import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StageRunStatus } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { PipelineProcessorService } from './pipeline-processor.service';

const QUEUE_NAME = 'tme-pipeline-stages';

@Injectable()
export class PipelineQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PipelineQueueService.name);
  private readonly driver: 'database' | 'redis';
  private readonly concurrency: number;
  private readonly pollMs: number;
  private queue?: Queue;
  private worker?: Worker;
  private pollTimer?: NodeJS.Timeout;
  private polling = false;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly processor: PipelineProcessorService,
  ) {
    this.driver =
      config.get<string>('PIPELINE_QUEUE_DRIVER') === 'redis' ? 'redis' : 'database';
    this.concurrency = Number(config.get<string>('PIPELINE_WORKER_CONCURRENCY') || 4);
    this.pollMs = Number(config.get<string>('PIPELINE_DATABASE_POLL_MS') || 1000);
    this.redisUrl = config.get<string>('REDIS_URL') || 'redis://localhost:6379';
  }

  private readonly redisUrl: string;

  async onModuleInit(): Promise<void> {
    this.processor.setEnqueueCallback((stageRunId) => this.enqueue(stageRunId));
    await this.processor.recoverInterruptedRuns();
    if (this.driver === 'redis') {
      const connection = redisConnection(this.redisUrl);
      this.queue = new Queue(QUEUE_NAME, { connection });
      this.worker = new Worker(
        QUEUE_NAME,
        async (job) => this.processor.process(String(job.data.stageRunId)),
        { connection, concurrency: this.concurrency },
      );
      this.worker.on('error', (error) => this.logger.error(`Pipeline worker error: ${error.message}`));
      this.logger.log(`Pipeline queue using Redis with concurrency ${this.concurrency}`);
    } else {
      this.pollTimer = setInterval(() => void this.pollDatabaseQueue(), this.pollMs);
      this.pollTimer.unref();
      void this.pollDatabaseQueue();
      this.logger.warn('Pipeline queue using PostgreSQL polling; use Redis for production scale');
    }
  }

  async enqueue(stageRunId: string): Promise<void> {
    if (this.queue) {
      const stage = await this.prisma.pipelineStageRun.findUnique({
        where: { id: stageRunId },
        select: { attemptCount: true, queuedAt: true },
      });
      if (!stage) return;
      const delay = Math.max(0, (stage.queuedAt?.getTime() || Date.now()) - Date.now());
      await this.queue.add(
        'execute-stage',
        { stageRunId },
        {
          jobId: `${stageRunId}:${stage.attemptCount + 1}`,
          delay,
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    await this.worker?.close();
    await this.queue?.close();
  }

  private async pollDatabaseQueue(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const stages = await this.prisma.pipelineStageRun.findMany({
        where: {
          status: StageRunStatus.QUEUED,
          queuedAt: { lte: new Date() },
        },
        orderBy: { queuedAt: 'asc' },
        take: this.concurrency,
        select: { id: true },
      });
      await Promise.all(stages.map((stage) => this.processor.process(stage.id)));
    } catch (error) {
      this.logger.error(
        `Database pipeline dispatcher failed: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.polling = false;
    }
  }
}

function redisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname ? Number(url.pathname.slice(1) || 0) : 0,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
