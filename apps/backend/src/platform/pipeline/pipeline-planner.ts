import type {
  PipelineDefinition,
  PipelinePartition,
  PipelineStageDefinition,
  SJBLEntity,
  SJBLEntityType,
} from '@tme/shared';

const ENTITY_DEPENDENCIES: Partial<Record<SJBLEntityType, SJBLEntityType[]>> = {
  contact: ['customer', 'supplier'],
  inventory_item: ['product'],
  sale_invoice: ['customer', 'product'],
  purchase_order: ['supplier', 'product'],
  payment: ['customer', 'supplier', 'sale_invoice', 'purchase_order'],
  credit_note: ['customer', 'product', 'sale_invoice'],
  debit_note: ['supplier', 'product', 'purchase_order'],
  stock_movement: ['product', 'inventory_item'],
  shipment: ['sale_invoice', 'purchase_order'],
  employee: ['department'],
};

/**
 * Produces deterministic execution waves. Every stage inside one wave can run
 * concurrently; a wave begins only after all dependencies in earlier waves
 * have completed.
 */
export function planStageWaves(definition: PipelineDefinition): PipelineStageDefinition[][] {
  const stages = new Map(definition.stages.map((stage) => [stage.id, stage]));
  const completed = new Set<string>();
  const waves: PipelineStageDefinition[][] = [];

  while (completed.size < stages.size) {
    const wave = [...stages.values()].filter(
      (stage) =>
        !completed.has(stage.id) &&
        stage.dependsOn.every((dependency) => {
          if (!stages.has(dependency)) {
            throw new Error(`Stage ${stage.id} depends on missing stage ${dependency}`);
          }
          return completed.has(dependency);
        }),
    );
    if (!wave.length) throw new Error('Pipeline stage graph contains a cycle');
    wave.sort((left, right) => left.id.localeCompare(right.id));
    waves.push(wave);
    wave.forEach((stage) => completed.add(stage.id));
  }
  return waves;
}

/**
 * Groups SJBL entities into dependency levels. Partitions at the same level
 * are safe candidates for bounded parallel processing.
 */
export function partitionEntities(
  pipelineRunId: string,
  entities: SJBLEntity[],
): PipelinePartition[] {
  const counts = new Map<SJBLEntityType, number>();
  entities.forEach((entity) => counts.set(entity.type, (counts.get(entity.type) || 0) + 1));

  const levelCache = new Map<SJBLEntityType, number>();
  const level = (type: SJBLEntityType, visiting = new Set<SJBLEntityType>()): number => {
    const cached = levelCache.get(type);
    if (cached !== undefined) return cached;
    if (visiting.has(type)) throw new Error(`Entity dependency cycle detected at ${type}`);
    visiting.add(type);
    const dependencies = (ENTITY_DEPENDENCIES[type] || []).filter((dependency) => counts.has(dependency));
    const value = dependencies.length
      ? Math.max(...dependencies.map((dependency) => level(dependency, new Set(visiting)))) + 1
      : 0;
    levelCache.set(type, value);
    return value;
  };

  return [...counts.entries()]
    .map(([type, itemCount]) => ({
      id: `${pipelineRunId}:${type}`,
      pipelineRunId,
      entityTypes: [type],
      dependencyLevel: level(type),
      itemCount,
    }))
    .sort(
      (left, right) =>
        left.dependencyLevel - right.dependencyLevel ||
        left.entityTypes[0].localeCompare(right.entityTypes[0]),
    );
}
