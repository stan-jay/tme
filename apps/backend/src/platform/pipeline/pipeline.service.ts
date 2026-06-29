import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PipelineDefinitionStatus,
  PipelineRunStatus,
  Prisma,
  StageRunStatus,
} from '@prisma/client';
import type {
  PipelineDefinition as CorePipelineDefinition,
  PipelineStageDefinition as CoreStageDefinition,
} from '@tme/shared';
import type { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreatePipelineDefinitionDto,
  StartPipelineRunDto,
} from './dto/pipeline.dto';
import { planStageWaves } from './pipeline-planner';
import { partitionEntities } from './pipeline-planner';
import { PipelineQueueService } from './pipeline-queue.service';
import { PipelineProcessorService } from './pipeline-processor.service';
import type { SJBLEntity } from '@tme/shared';

const MIGRATION_TEMPLATE_NAME = 'Standard SJBL migration pipeline';
const DEFAULT_MIGRATION_KNOWLEDGE_PACKS = ['spreadsheet-import', 'stan-jay-accounting'];
const TERMINAL_RUN_STATUSES: PipelineRunStatus[] = [
  PipelineRunStatus.COMPLETED,
  PipelineRunStatus.PARTIALLY_COMPLETED,
  PipelineRunStatus.FAILED,
  PipelineRunStatus.CANCELLED,
];

@Injectable()
export class PipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: PipelineQueueService,
    private readonly audit: AuditService,
    private readonly processor: PipelineProcessorService,
  ) {}

  async create(body: CreatePipelineDefinitionDto, user: AuthUser) {
    this.validateDefinition(body);
    const definition = await this.prisma.pipelineDefinition.create({
      data: {
        organizationId: user.organizationId,
        name: body.name.trim(),
        description: body.description,
        operation: body.operation,
        sourceConnectionId: body.sourceConnectionId,
        destinationConnectionIds: json(body.destinationConnectionIds),
        knowledgePackIds: json(body.knowledgePackIds),
        maxParallelStages: body.maxParallelStages,
        maxParallelPartitions: body.maxParallelPartitions,
        createdById: user.id,
        updatedById: user.id,
        stages: {
          create: body.stages.map((stage) => ({
            key: stage.key,
            kind: stage.kind,
            capability: stage.capability,
            dependsOn: json(stage.dependsOn),
            connectionId: stage.connectionId,
            knowledgePackId: stage.knowledgePackId,
            configuration: json(stage.configuration),
            maxAttempts: stage.maxAttempts,
            backoffMs: stage.backoffMs,
            maxBackoffMs: stage.maxBackoffMs,
          })),
        },
      },
      include: { stages: true },
    });
    await this.audit.record({
      user,
      action: 'pipeline.definition.create',
      entityType: 'pipeline_definition',
      entityId: definition.id,
      details: { name: definition.name, operation: definition.operation },
    });
    return definition;
  }

  createMigrationTemplate(
    name: string,
    sourceConnectionId: string | undefined,
    destinationConnectionId: string | undefined,
    user: AuthUser,
  ) {
    const stages = [
      stage('read', 'read', [], 'read', sourceConnectionId),
      stage('map', 'map', ['read'], 'map'),
      stage('normalize', 'normalize', ['map'], 'normalize'),
      stage('validate', 'validate', ['normalize'], 'validate'),
      stage('relate', 'relate', ['normalize'], 'relate'),
      stage('decide', 'decide', ['validate', 'relate'], 'decide'),
      stage('write', 'write', ['decide'], 'write', destinationConnectionId),
      stage('verify', 'verify', ['write'], 'verify', destinationConnectionId),
      stage('archive', 'archive', ['read'], 'archive'),
    ];
    return this.create(
      {
        name,
        description: 'Standard SJBL migration pipeline',
        operation: 'migration',
        sourceConnectionId,
        destinationConnectionIds: destinationConnectionId ? [destinationConnectionId] : [],
        knowledgePackIds: [...DEFAULT_MIGRATION_KNOWLEDGE_PACKS],
        maxParallelStages: 4,
        maxParallelPartitions: 4,
        stages,
      },
      user,
    );
  }

  async listDefinitions(organizationId: string) {
    return this.prisma.pipelineDefinition.findMany({
      where: { organizationId },
      include: { stages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(
    id: string,
    status: PipelineDefinitionStatus,
    user: AuthUser,
  ) {
    const definition = await this.getOwnedDefinition(id, user.organizationId);
    if (status === PipelineDefinitionStatus.ACTIVE) {
      this.validateStoredDefinition(definition);
    }
    const updated = await this.prisma.pipelineDefinition.update({
      where: { id },
      data: { status, updatedById: user.id, version: { increment: 1 } },
      include: { stages: true },
    });
    await this.audit.record({
      user,
      action: 'pipeline.definition.status',
      entityType: 'pipeline_definition',
      entityId: id,
      details: { status },
    });
    return updated;
  }

  async start(id: string, body: StartPipelineRunDto, user: AuthUser) {
    const existing = await this.prisma.pipelineRun.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: user.organizationId,
          idempotencyKey: body.idempotencyKey,
        },
      },
      include: { stageRuns: true },
    });
    if (existing) return existing;

    const definition = await this.getOwnedDefinition(id, user.organizationId);
    if (definition.status !== PipelineDefinitionStatus.ACTIVE) {
      throw new ConflictException('Pipeline definition must be active before it can run');
    }
    const waves = this.validateStoredDefinition(definition);
    const rootKeys = new Set(waves[0].map((stage) => stage.id));
    const run = await this.prisma.pipelineRun.create({
      data: {
        organizationId: user.organizationId,
        pipelineDefinitionId: definition.id,
        definitionVersion: definition.version,
        operation: definition.operation,
        initiatedById: user.id,
        idempotencyKey: body.idempotencyKey,
        input: json(body.input),
        totalStages: definition.stages.length,
        stageRuns: {
          create: definition.stages.map((stageDefinition) => ({
            stageDefinitionId: stageDefinition.id,
            stageKey: stageDefinition.key,
            status: rootKeys.has(stageDefinition.key)
              ? StageRunStatus.QUEUED
              : StageRunStatus.BLOCKED,
            queuedAt: rootKeys.has(stageDefinition.key) ? new Date() : undefined,
          })),
        },
      },
      include: { stageRuns: true },
    });
    const entities = Array.isArray(body.input.entities)
      ? (body.input.entities.filter(
          (entity): entity is SJBLEntity =>
            Boolean(
              entity &&
                typeof entity === 'object' &&
                typeof (entity as { id?: unknown }).id === 'string' &&
                typeof (entity as { type?: unknown }).type === 'string',
            ),
        ) as SJBLEntity[])
      : [];
    if (entities.length) {
      const stageByKey = new Map(definition.stages.map((stageDefinition) => [stageDefinition.key, stageDefinition]));
      for (const stageRun of run.stageRuns) {
        if (stageByKey.get(stageRun.stageKey)?.kind !== 'write') continue;
        const partitions = partitionEntities(run.id, entities);
        if (partitions.length) {
          await this.prisma.pipelineRunPartition.createMany({
            data: partitions.map((partition) => ({
              stageRunId: stageRun.id,
              partitionKey: partition.id,
              dependencyLevel: partition.dependencyLevel,
              entityTypes: json(partition.entityTypes),
              itemCount: partition.itemCount,
            })),
          });
        }
      }
    }
    await Promise.all(
      run.stageRuns
        .filter((stageRun) => stageRun.status === StageRunStatus.QUEUED)
        .map((stageRun) => this.queue.enqueue(stageRun.id)),
    );
    await this.audit.record({
      user,
      action: 'pipeline.run.start',
      entityType: 'pipeline_run',
      entityId: run.id,
      details: { pipelineDefinitionId: definition.id, version: definition.version },
    });
    return run;
  }

  async listRuns(organizationId: string) {
    return this.prisma.pipelineRun.findMany({
      where: { organizationId },
      include: {
        pipelineDefinition: { select: { name: true } },
        stageRuns: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getRun(id: string, organizationId: string) {
    const run = await this.prisma.pipelineRun.findFirst({
      where: { id, organizationId },
      include: {
        pipelineDefinition: true,
        stageRuns: {
          include: { stageDefinition: true, partitions: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!run) throw new NotFoundException('Pipeline run not found');
    return run;
  }

  async cancel(id: string, user: AuthUser) {
    const run = await this.getRun(id, user.organizationId);
    if (
      ([
        PipelineRunStatus.COMPLETED,
        PipelineRunStatus.FAILED,
        PipelineRunStatus.CANCELLED,
      ] as PipelineRunStatus[]).includes(run.status)
    ) {
      throw new ConflictException(`Pipeline run is already ${run.status}`);
    }
    await this.prisma.$transaction([
      this.prisma.pipelineRun.update({
        where: { id },
        data: { status: PipelineRunStatus.CANCEL_REQUESTED },
      }),
      this.prisma.pipelineStageRun.updateMany({
        where: {
          pipelineRunId: id,
          status: { in: [StageRunStatus.BLOCKED, StageRunStatus.QUEUED] },
        },
        data: { status: StageRunStatus.CANCELLED, completedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      user,
      action: 'pipeline.run.cancel',
      entityType: 'pipeline_run',
      entityId: id,
    });
    return this.getRun(id, user.organizationId);
  }

  /**
   * Runs a migration as one pipeline operation: it ensures the reusable
   * migration definition is active, starts an idempotent run carrying the SJBL
   * document, and drives the run to a terminal state. The migration becomes a
   * pipeline operation rather than a bespoke serial path.
   */
  async runMigration(args: {
    migrationId: string;
    destinationConnectionId: string;
    idempotencyKey: string;
    entities: SJBLEntity[];
    user: AuthUser;
  }) {
    const definition = await this.ensureMigrationDefinition(args.user);
    const run = await this.start(
      definition.id,
      {
        idempotencyKey: args.idempotencyKey,
        input: {
          migrationId: args.migrationId,
          destinationConnectionId: args.destinationConnectionId,
          idempotencyKey: args.idempotencyKey,
          entities: args.entities as unknown as Record<string, unknown>[],
        },
      },
      args.user,
    );
    return this.drainRun(run.id, args.user.organizationId);
  }

  /**
   * Synchronously processes queued stages until the run is terminal. The
   * processor claims each stage atomically, so this is safe to run alongside
   * the background dispatcher (database poller or BullMQ worker) without
   * double execution.
   */
  async drainRun(runId: string, organizationId: string, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const run = await this.prisma.pipelineRun.findFirst({
        where: { id: runId, organizationId },
        include: { pipelineDefinition: { select: { maxParallelStages: true } } },
      });
      if (!run) throw new NotFoundException('Pipeline run not found');
      if (TERMINAL_RUN_STATUSES.includes(run.status)) {
        return this.getRun(runId, organizationId);
      }

      const queued = await this.prisma.pipelineStageRun.findMany({
        where: { pipelineRunId: runId, status: StageRunStatus.QUEUED, queuedAt: { lte: new Date() } },
        orderBy: { queuedAt: 'asc' },
        select: { id: true },
      });
      if (queued.length) {
        const limit = Math.max(1, run.pipelineDefinition.maxParallelStages);
        for (let index = 0; index < queued.length; index += limit) {
          await Promise.all(
            queued.slice(index, index + limit).map((stage) => this.processor.process(stage.id)),
          );
        }
        continue;
      }

      const pending = await this.prisma.pipelineStageRun.count({
        where: {
          pipelineRunId: runId,
          status: {
            in: [
              StageRunStatus.BLOCKED,
              StageRunStatus.QUEUED,
              StageRunStatus.RUNNING,
              StageRunStatus.RETRY_WAIT,
            ],
          },
        },
      });
      if (pending === 0) return this.getRun(runId, organizationId);
      if (Date.now() > deadline) {
        throw new ConflictException('Pipeline run did not complete within the allotted time');
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private async ensureMigrationDefinition(user: AuthUser) {
    const existing = await this.prisma.pipelineDefinition.findFirst({
      where: { organizationId: user.organizationId, name: MIGRATION_TEMPLATE_NAME },
    });
    let definitionId = existing?.id;
    if (!definitionId) {
      try {
        const created = await this.createMigrationTemplate(
          MIGRATION_TEMPLATE_NAME,
          undefined,
          undefined,
          user,
        );
        definitionId = created.id;
      } catch {
        const retry = await this.prisma.pipelineDefinition.findFirst({
          where: { organizationId: user.organizationId, name: MIGRATION_TEMPLATE_NAME },
        });
        if (!retry) throw new ConflictException('Migration pipeline definition could not be created');
        definitionId = retry.id;
      }
    }
    const definition = await this.getOwnedDefinition(definitionId, user.organizationId);
    if (definition.status !== PipelineDefinitionStatus.ACTIVE) {
      await this.updateStatus(definition.id, PipelineDefinitionStatus.ACTIVE, user);
    }
    return definition;
  }

  private async getOwnedDefinition(id: string, organizationId: string) {
    const definition = await this.prisma.pipelineDefinition.findFirst({
      where: { id, organizationId },
      include: { stages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!definition) throw new NotFoundException('Pipeline definition not found');
    return definition;
  }

  private validateDefinition(body: CreatePipelineDefinitionDto) {
    if (!body.stages.length) throw new ConflictException('Pipeline requires at least one stage');
    return planStageWaves({
      id: 'new',
      name: body.name,
      operation: body.operation as any,
      sourcePluginId: body.sourceConnectionId || 'manual',
      destinationPluginIds: body.destinationConnectionIds,
      knowledgePackIds: body.knowledgePackIds,
      stages: body.stages.map((stage) => ({
        id: stage.key,
        kind: stage.kind as any,
        capability: stage.capability,
        dependsOn: stage.dependsOn,
        pluginId: stage.connectionId,
        knowledgePackId: stage.knowledgePackId,
        configuration: stage.configuration,
        retry: {
          maxAttempts: stage.maxAttempts,
          backoffMs: stage.backoffMs,
          maxBackoffMs: stage.maxBackoffMs,
        },
      })),
      concurrency: {
        maxParallelStages: body.maxParallelStages,
        maxParallelPartitions: body.maxParallelPartitions,
      },
    });
  }

  private validateStoredDefinition(
    definition: Awaited<ReturnType<PipelineService['getOwnedDefinition']>>,
  ) {
    const stages: CoreStageDefinition[] = definition.stages.map((stageDefinition) => ({
      id: stageDefinition.key,
      kind: stageDefinition.kind as any,
      capability: stageDefinition.capability,
      dependsOn: stringArray(stageDefinition.dependsOn),
      pluginId: stageDefinition.connectionId || undefined,
      knowledgePackId: stageDefinition.knowledgePackId || undefined,
      configuration: object(stageDefinition.configuration),
      retry: {
        maxAttempts: stageDefinition.maxAttempts,
        backoffMs: stageDefinition.backoffMs,
        maxBackoffMs: stageDefinition.maxBackoffMs,
      },
    }));
    const core: CorePipelineDefinition = {
      id: definition.id,
      name: definition.name,
      operation: definition.operation as any,
      sourcePluginId: definition.sourceConnectionId || 'manual',
      destinationPluginIds: stringArray(definition.destinationConnectionIds),
      knowledgePackIds: stringArray(definition.knowledgePackIds),
      stages,
      concurrency: {
        maxParallelStages: definition.maxParallelStages,
        maxParallelPartitions: definition.maxParallelPartitions,
      },
    };
    return planStageWaves(core);
  }
}

function stage(
  key: string,
  kind: string,
  dependsOn: string[],
  capability: string,
  connectionId?: string,
) {
  return {
    key,
    kind,
    capability,
    dependsOn,
    connectionId,
    configuration: {},
    maxAttempts: 3,
    backoffMs: 1000,
    maxBackoffMs: 30_000,
  };
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function object(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
