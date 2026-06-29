import { Injectable } from '@nestjs/common';
import type { PipelineStageDefinition, PipelineStageRun, Prisma } from '@prisma/client';
import type { SJBLEntity, SJBLEntityType } from '@tme/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionService } from '../../engines/execution/execution.service';
import { RelationshipService } from '../../engines/relationship/relationship.service';
import { validateSjUtfEntities } from '../../engines/transformation/sj-utf-validator';
import { IntegrationService } from '../integrations/integration.service';
import { PluginRegistryService } from '../plugin-registry/plugin-registry.service';
import { KnowledgeEngineService } from '../knowledge/knowledge-engine.service';

export interface StageExecutionContext {
  organizationId: string;
  pipelineRunId: string;
  stageRun: PipelineStageRun;
  stage: PipelineStageDefinition;
  input: Record<string, unknown>;
  /** Outputs of already-completed stages in the same run, keyed by stage key. */
  priorOutputs: Record<string, Record<string, unknown>>;
  maxParallelPartitions: number;
  /** Knowledge packs the pipeline definition attaches to this run. */
  knowledgePackIds: string[];
}

export interface StageExecutionResult {
  checkpoint?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface PipelineStageHandler {
  execute(context: StageExecutionContext): Promise<StageExecutionResult>;
}

/**
 * Resolves a handler for every SJBL pipeline stage kind. Handlers are
 * vendor-neutral: they operate on the canonical SJBL document carried in the
 * run input and on capabilities resolved by connection id. No handler imports
 * a vendor plugin.
 */
@Injectable()
export class PipelineStageHandlerRegistry {
  private readonly handlers = new Map<string, PipelineStageHandler>();

  constructor(
    prisma: PrismaService,
    execution: ExecutionService,
    relationships: RelationshipService,
    knowledge: KnowledgeEngineService,
    integrations: IntegrationService,
    plugins: PluginRegistryService,
  ) {
    const passThrough = (label: string) => new PassThroughStageHandler(label);
    this.handlers.set('discover', passThrough('discovered'));
    this.handlers.set('read', new ReadStageHandler(integrations, plugins));
    this.handlers.set('map', passThrough('mapped'));
    this.handlers.set('normalize', passThrough('normalized'));
    this.handlers.set('validate', new ValidateStageHandler());
    this.handlers.set('relate', new RelateStageHandler(relationships));
    this.handlers.set('decide', new DecideStageHandler(knowledge));
    this.handlers.set('write', new WriteStageHandler(prisma, execution));
    this.handlers.set('verify', new VerifyStageHandler());
    this.handlers.set('notify', passThrough('notified'));
    this.handlers.set('archive', passThrough('archived'));
  }

  get(kind: string): PipelineStageHandler {
    const handler = this.handlers.get(kind);
    if (!handler) throw new Error(`No pipeline stage handler is registered for ${kind}`);
    return handler;
  }

  register(kind: string, handler: PipelineStageHandler): void {
    this.handlers.set(kind, handler);
  }
}

/**
 * A stage that confirms the SJBL document is present and passes it through.
 * Sourcing through reader/mapper plugins replaces this where a stage declares
 * a source connection; until then the canonical document arrives in the run
 * input from the upstream reader.
 */
class PassThroughStageHandler implements PipelineStageHandler {
  constructor(private readonly label: string) {}

  async execute(context: StageExecutionContext): Promise<StageExecutionResult> {
    await applyStageTestControls(context);
    const entities = entitiesFromContext(context);
    return {
      output: { stage: this.label, entityCount: entities.length, entities },
      checkpoint: { completedAt: new Date().toISOString(), attempt: context.stageRun.attemptCount },
    };
  }
}

class ReadStageHandler implements PipelineStageHandler {
  constructor(
    private readonly integrations: IntegrationService,
    private readonly plugins: PluginRegistryService,
  ) {}

  async execute(context: StageExecutionContext): Promise<StageExecutionResult> {
    await applyStageTestControls(context);
    const existingEntities = entitiesFromInput(context.input);
    if (existingEntities.length) {
      return {
        output: {
          stage: 'read',
          source: 'pipeline-input',
          entityCount: existingEntities.length,
          entities: existingEntities,
        },
      };
    }

    const connectionId =
      context.stage.connectionId ||
      stringInput(context.input, 'sourceConnectionId');
    if (!connectionId) {
      throw new Error('Read stage requires a source connection or input.entities');
    }

    const runtime = await this.integrations.runtimeConfiguration(connectionId, context.organizationId);
    if (!runtime.capabilities.includes('read')) {
      throw new Error('Selected source connection does not provide a reader capability');
    }

    const reader = this.plugins.reader(runtime.pluginId);
    const configuration = asObject(context.stage.configuration);
    const pageSize = Math.max(1, Math.min(500, Number(configuration.pageSize || 100)));
    const entityTypes = stringArray(configuration.entityTypes as Prisma.JsonValue) as SJBLEntityType[];
    const entities: SJBLEntity[] = [];
    let cursor = stringInput(configuration, 'cursor') || undefined;
    let checkpoint: string | undefined;
    for (;;) {
      const pages = reader.read(
        {
          resourceId: stringInput(configuration, 'resourceId') || undefined,
          entityTypes,
          cursor,
          pageSize,
          changedSince: stringInput(configuration, 'changedSince') || undefined,
        },
        {
          organizationId: context.organizationId,
          connectionId,
          pipelineRunId: context.pipelineRunId,
          configuration: runtime.configuration,
        },
      );
      let progressed = false;
      for await (const page of pages) {
        progressed = true;
        const records = page.records.filter(isSjblEntity);
        entities.push(...records);
        cursor = page.nextCursor;
        checkpoint = page.checkpoint;
        if (page.complete || !cursor) {
          return {
            output: {
              stage: 'read',
              sourceConnectionId: connectionId,
              pluginId: runtime.pluginId,
              entityCount: entities.length,
              entities,
            },
            checkpoint: { cursor, checkpoint, completedAt: new Date().toISOString() },
          };
        }
      }
      if (!progressed) break;
    }
    return {
      output: {
        stage: 'read',
        sourceConnectionId: connectionId,
        pluginId: runtime.pluginId,
        entityCount: entities.length,
        entities,
      },
      checkpoint: { cursor, checkpoint, completedAt: new Date().toISOString() },
    };
  }
}

class ValidateStageHandler implements PipelineStageHandler {
  async execute(context: StageExecutionContext): Promise<StageExecutionResult> {
    await applyStageTestControls(context);
    const entities = entitiesFromContext(context);
    const errors = validateSjUtfEntities(entities);
    if (errors.length) {
      const sample = errors.slice(0, 5).map((error) => error.message).join('; ');
      throw new Error(`SJBL validation failed for ${errors.length} entit(y/ies): ${sample}`);
    }
    return { output: { validated: entities.length, issues: 0 } };
  }
}

class RelateStageHandler implements PipelineStageHandler {
  constructor(private readonly relationships: RelationshipService) {}

  async execute(context: StageExecutionContext): Promise<StageExecutionResult> {
    await applyStageTestControls(context);
    const entities = entitiesFromContext(context);
    const analysis = this.relationships.analyze(entities);
    return {
      output: {
        nodes: entities.length,
        edges: analysis.edgeCount,
        edgesByType: analysis.edgesByType,
        externalReferences: analysis.externalReferenceCount,
        unresolvedReferences: analysis.unresolved.length,
        unresolvedSample: analysis.unresolved.slice(0, 20),
      },
    };
  }
}

/**
 * Deterministic decision stage. Knowledge packs decide whether the SJBL
 * document is acceptable; every blocking failure carries evidence. A rejected
 * decision fails the stage so the run is never reported as successful.
 */
class DecideStageHandler implements PipelineStageHandler {
  constructor(private readonly knowledge: KnowledgeEngineService) {}

  async execute(context: StageExecutionContext): Promise<StageExecutionResult> {
    await applyStageTestControls(context);
    const entities = entitiesFromContext(context);
    const packIds = uniqueStrings([...context.knowledgePackIds, context.stage.knowledgePackId]);
    if (!packIds.length) {
      return { output: { approved: true, packs: [], evaluated: entities.length, errors: 0, warnings: 0 } };
    }

    const result = await this.knowledge.evaluate(packIds, entities, context.input);
    const output = {
      approved: result.approved,
      packs: packIds,
      unknownPacks: result.unknownPackIds,
      evaluated: entities.length,
      errors: result.errorCount,
      warnings: result.warningCount,
      issues: result.issues.slice(0, 50),
      decisions: result.evaluations.flatMap((evaluation) => evaluation.decisions).slice(0, 50),
    };
    if (!result.approved) {
      const first = result.issues.find((issue) => issue.type === 'error');
      throw new Error(
        `Knowledge decision rejected the document: ${result.errorCount} blocking failure(s)` +
          (first ? ` — ${first.message}` : ''),
      );
    }
    return { output };
  }
}

class WriteStageHandler implements PipelineStageHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly execution: ExecutionService,
  ) {}

  async execute(context: StageExecutionContext): Promise<StageExecutionResult> {
    await applyStageTestControls(context);
    const entities = entitiesFromContext(context);
    const totals = { success: 0, failed: 0, skipped: 0 };
    if (!entities.length) {
      return { output: { ...totals, partitions: 0 } };
    }

    const migrationId = stringInput(context.input, 'migrationId');
    const destinationConnectionId = stringInput(context.input, 'destinationConnectionId');
    if (!migrationId || !destinationConnectionId) {
      throw new Error('Write stage requires migrationId and destinationConnectionId in the pipeline input');
    }
    const idempotencyKey = stringInput(context.input, 'idempotencyKey') || context.pipelineRunId;
    const byType = groupEntitiesByType(entities);

    const partitions = await this.prisma.pipelineRunPartition.findMany({
      where: { stageRunId: context.stageRun.id },
      orderBy: [{ dependencyLevel: 'asc' }, { partitionKey: 'asc' }],
    });

    // Without partitions (e.g. a manual run that did not declare entities for
    // partitioning) write the document as a single unit.
    if (!partitions.length) {
      const result = await this.execution.executeMigration(
        migrationId,
        context.organizationId,
        entities,
        destinationConnectionId,
        idempotencyKey,
      );
      accumulate(totals, result);
      return { output: { ...totals, partitions: 0 } };
    }

    // Dependency levels run in order; partitions within a level run with
    // bounded parallelism. A genuinely failed partition fails the stage so the
    // run is not reported as successful after a caught exception.
    const levels = [...new Set(partitions.map((partition) => partition.dependencyLevel))].sort(
      (left, right) => left - right,
    );
    for (const level of levels) {
      const levelPartitions = partitions.filter(
        (partition) => partition.dependencyLevel === level && partition.status !== 'COMPLETED',
      );
      await runBounded(levelPartitions, context.maxParallelPartitions, async (partition) => {
        const claimed = await this.prisma.pipelineRunPartition.updateMany({
          where: { id: partition.id, status: 'QUEUED' },
          data: { status: 'RUNNING', attemptCount: { increment: 1 }, startedAt: new Date() },
        });
        if (!claimed.count) return;
        const type = stringArray(partition.entityTypes)[0] as SJBLEntityType | undefined;
        const subset = type ? byType.get(type) ?? [] : [];
        try {
          const result = await this.execution.executeMigration(
            migrationId,
            context.organizationId,
            subset,
            destinationConnectionId,
            idempotencyKey,
          );
          accumulate(totals, result);
          await this.prisma.pipelineRunPartition.update({
            where: { id: partition.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              checkpoint: {
                type: type ?? null,
                success: result.success,
                failed: result.failed,
                skipped: result.skipped,
                completedAt: new Date().toISOString(),
              },
            },
          });
        } catch (error) {
          await this.prisma.pipelineRunPartition.update({
            where: { id: partition.id },
            data: {
              status: 'FAILED',
              errorMessage: (error instanceof Error ? error.message : 'Partition write failed').slice(0, 2000),
            },
          });
          throw error;
        }
      });
    }
    return { output: { ...totals, partitions: partitions.length } };
  }
}

class VerifyStageHandler implements PipelineStageHandler {
  async execute(context: StageExecutionContext): Promise<StageExecutionResult> {
    await applyStageTestControls(context);
    const write = context.priorOutputs['write'] ?? {};
    const expected = entitiesFromContext(context).length;
    const success = Number(write.success || 0);
    const failed = Number(write.failed || 0);
    const skipped = Number(write.skipped || 0);
    const processed = success + failed + skipped;
    return {
      output: { expected, processed, success, failed, skipped, reconciled: processed === expected },
    };
  }
}

export function entitiesFromInput(input: Record<string, unknown>): SJBLEntity[] {
  const value = (input as { entities?: unknown }).entities;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entity): entity is SJBLEntity =>
      Boolean(
        entity &&
          typeof entity === 'object' &&
          typeof (entity as { id?: unknown }).id === 'string' &&
          typeof (entity as { type?: unknown }).type === 'string',
      ),
  );
}

export function entitiesFromContext(context: {
  input: Record<string, unknown>;
  priorOutputs: Record<string, Record<string, unknown>>;
}): SJBLEntity[] {
  const direct = entitiesFromInput(context.input);
  if (direct.length) return direct;
  for (const key of ['normalize', 'map', 'read']) {
    const entities = entitiesFromInput(context.priorOutputs[key] || {});
    if (entities.length) return entities;
  }
  return [];
}

export function groupEntitiesByType(entities: SJBLEntity[]): Map<SJBLEntityType, SJBLEntity[]> {
  const grouped = new Map<SJBLEntityType, SJBLEntity[]>();
  for (const entity of entities) {
    const bucket = grouped.get(entity.type);
    if (bucket) bucket.push(entity);
    else grouped.set(entity.type, [entity]);
  }
  return grouped;
}

async function runBounded<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const size = Math.max(1, limit);
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(worker));
  }
}

async function applyStageTestControls(context: StageExecutionContext): Promise<void> {
  const configuration = asObject(context.stage.configuration);
  const failUntilAttempt = Number(configuration.failUntilAttempt || 0);
  if (context.stageRun.attemptCount <= failUntilAttempt) {
    throw new Error(`Configured retry test failure at attempt ${context.stageRun.attemptCount}`);
  }
  const delayMs = Math.min(5_000, Math.max(0, Number(configuration.delayMs || 0)));
  if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function accumulate(
  totals: { success: number; failed: number; skipped: number },
  result: { success: number; failed: number; skipped: number },
): void {
  totals.success += result.success;
  totals.failed += result.failed;
  totals.skipped += result.skipped;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim() !== ''))];
}

function stringInput(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === 'string' ? value : '';
}

function isSjblEntity(value: unknown): value is SJBLEntity {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { id?: unknown }).id === 'string' &&
      typeof (value as { type?: unknown }).type === 'string',
  );
}

function asObject(value: Prisma.JsonValue | unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
