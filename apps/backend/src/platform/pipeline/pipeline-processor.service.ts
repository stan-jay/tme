import { Injectable, Logger } from '@nestjs/common';
import { PipelineRunStatus, Prisma, StageRunStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PipelineStageHandlerRegistry } from './pipeline-stage-handler.registry';

@Injectable()
export class PipelineProcessorService {
  private readonly logger = new Logger(PipelineProcessorService.name);
  private enqueueCallback?: (stageRunId: string) => Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly handlers: PipelineStageHandlerRegistry,
  ) {}

  setEnqueueCallback(callback: (stageRunId: string) => Promise<void>): void {
    this.enqueueCallback = callback;
  }

  async recoverInterruptedRuns(): Promise<void> {
    const cutoff = new Date(Date.now() - 5 * 60_000);
    await this.prisma.pipelineStageRun.updateMany({
      where: {
        status: StageRunStatus.RUNNING,
        OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: cutoff } }],
      },
      data: {
        status: StageRunStatus.QUEUED,
        queuedAt: new Date(),
        errorCode: 'WORKER_RECOVERY',
        errorMessage: 'Stage was requeued after an interrupted worker',
      },
    });
  }

  async process(stageRunId: string): Promise<void> {
    const claim = await this.prisma.pipelineStageRun.updateMany({
      where: {
        id: stageRunId,
        status: StageRunStatus.QUEUED,
        queuedAt: { lte: new Date() },
      },
      data: {
        status: StageRunStatus.RUNNING,
        attemptCount: { increment: 1 },
        startedAt: new Date(),
        heartbeatAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });
    if (claim.count !== 1) return;

    const stageRun = await this.prisma.pipelineStageRun.findUniqueOrThrow({
      where: { id: stageRunId },
      include: {
        stageDefinition: true,
        pipelineRun: { include: { pipelineDefinition: true } },
        partitions: true,
      },
    });
    if (
      stageRun.pipelineRun.status === PipelineRunStatus.CANCEL_REQUESTED ||
      stageRun.pipelineRun.status === PipelineRunStatus.CANCELLED
    ) {
      await this.prisma.pipelineStageRun.update({
        where: { id: stageRunId },
        data: { status: StageRunStatus.CANCELLED, completedAt: new Date() },
      });
      await this.finalizeRun(stageRun.pipelineRunId);
      return;
    }

    await this.prisma.pipelineRun.updateMany({
      where: { id: stageRun.pipelineRunId, status: PipelineRunStatus.QUEUED },
      data: { status: PipelineRunStatus.RUNNING, startedAt: new Date() },
    });

    try {
      const completed = await this.prisma.pipelineStageRun.findMany({
        where: { pipelineRunId: stageRun.pipelineRunId, status: StageRunStatus.COMPLETED },
        select: { stageKey: true, output: true },
      });
      const priorOutputs = Object.fromEntries(
        completed.map((entry) => [entry.stageKey, asObject(entry.output)]),
      );
      const handler = this.handlers.get(stageRun.stageDefinition.kind);
      const result = await handler.execute({
        organizationId: stageRun.pipelineRun.organizationId,
        pipelineRunId: stageRun.pipelineRunId,
        stageRun,
        stage: stageRun.stageDefinition,
        input: asObject(stageRun.pipelineRun.input),
        priorOutputs,
        maxParallelPartitions: stageRun.pipelineRun.pipelineDefinition.maxParallelPartitions,
        knowledgePackIds: stringArray(stageRun.pipelineRun.pipelineDefinition.knowledgePackIds),
      });
      await this.prisma.pipelineStageRun.update({
        where: { id: stageRunId },
        data: {
          status: StageRunStatus.COMPLETED,
          checkpoint: json(result.checkpoint),
          output: json(result.output),
          completedAt: new Date(),
          heartbeatAt: new Date(),
        },
      });
      await this.releaseDependants(stageRun.pipelineRunId);
      await this.finalizeRun(stageRun.pipelineRunId);
    } catch (error) {
      await this.handleFailure(stageRun, error);
    }
  }

  private async handleFailure(
    stageRun: Awaited<ReturnType<PrismaService['pipelineStageRun']['findUniqueOrThrow']>> & any,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : 'Unknown stage failure';
    const attempts = stageRun.attemptCount;
    if (attempts < stageRun.stageDefinition.maxAttempts) {
      const delay = Math.min(
        stageRun.stageDefinition.maxBackoffMs,
        stageRun.stageDefinition.backoffMs * 2 ** Math.max(0, attempts - 1),
      );
      await this.prisma.pipelineStageRun.update({
        where: { id: stageRun.id },
        data: {
          status: StageRunStatus.QUEUED,
          queuedAt: new Date(Date.now() + delay),
          errorCode: 'STAGE_RETRY',
          errorMessage: message.slice(0, 2000),
        },
      });
      if (this.enqueueCallback) await this.enqueueCallback(stageRun.id);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.pipelineStageRun.update({
        where: { id: stageRun.id },
        data: {
          status: StageRunStatus.FAILED,
          errorCode: 'STAGE_FAILED',
          errorMessage: message.slice(0, 2000),
          completedAt: new Date(),
        },
      }),
      this.prisma.pipelineStageRun.updateMany({
        where: {
          pipelineRunId: stageRun.pipelineRunId,
          status: { in: [StageRunStatus.BLOCKED, StageRunStatus.QUEUED] },
        },
        data: { status: StageRunStatus.CANCELLED, completedAt: new Date() },
      }),
      this.prisma.pipelineRun.update({
        where: { id: stageRun.pipelineRunId },
        data: {
          status: PipelineRunStatus.FAILED,
          failedStages: { increment: 1 },
          completedAt: new Date(),
        },
      }),
    ]);
    this.logger.error(`Pipeline stage ${stageRun.stageKey} failed: ${message}`);
  }

  private async releaseDependants(pipelineRunId: string): Promise<void> {
    const runs = await this.prisma.pipelineStageRun.findMany({
      where: { pipelineRunId },
      include: { stageDefinition: true },
    });
    const statusByKey = new Map(runs.map((run) => [run.stageKey, run.status]));
    for (const run of runs.filter((candidate) => candidate.status === StageRunStatus.BLOCKED)) {
      const dependencies = stringArray(run.stageDefinition.dependsOn);
      if (
        dependencies.every((dependency) =>
          ([StageRunStatus.COMPLETED, StageRunStatus.SKIPPED] as StageRunStatus[]).includes(
            statusByKey.get(dependency) as StageRunStatus,
          ),
        )
      ) {
        const released = await this.prisma.pipelineStageRun.updateMany({
          where: { id: run.id, status: StageRunStatus.BLOCKED },
          data: { status: StageRunStatus.QUEUED, queuedAt: new Date() },
        });
        if (released.count && this.enqueueCallback) await this.enqueueCallback(run.id);
      }
    }
  }

  private async finalizeRun(pipelineRunId: string): Promise<void> {
    const stages = await this.prisma.pipelineStageRun.groupBy({
      by: ['status'],
      where: { pipelineRunId },
      _count: true,
    });
    const counts = new Map(stages.map((entry) => [entry.status, entry._count]));
    const active =
      (counts.get(StageRunStatus.BLOCKED) || 0) +
      (counts.get(StageRunStatus.QUEUED) || 0) +
      (counts.get(StageRunStatus.RUNNING) || 0) +
      (counts.get(StageRunStatus.RETRY_WAIT) || 0);
    const completed = counts.get(StageRunStatus.COMPLETED) || 0;
    const failed = counts.get(StageRunStatus.FAILED) || 0;
    const cancelled = counts.get(StageRunStatus.CANCELLED) || 0;
    if (active > 0) {
      await this.prisma.pipelineRun.update({
        where: { id: pipelineRunId },
        data: { completedStages: completed, failedStages: failed },
      });
      return;
    }
    const run = await this.prisma.pipelineRun.findUniqueOrThrow({ where: { id: pipelineRunId } });
    const status =
      run.status === PipelineRunStatus.CANCEL_REQUESTED || cancelled > 0
        ? PipelineRunStatus.CANCELLED
        : failed > 0
          ? PipelineRunStatus.FAILED
          : PipelineRunStatus.COMPLETED;
    await this.prisma.pipelineRun.update({
      where: { id: pipelineRunId },
      data: {
        status,
        completedStages: completed,
        failedStages: failed,
        completedAt: new Date(),
        cancelledAt: status === PipelineRunStatus.CANCELLED ? new Date() : undefined,
      },
    });
  }
}

function asObject(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function json(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}
