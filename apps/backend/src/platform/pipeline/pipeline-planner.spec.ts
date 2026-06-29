import type { PipelineDefinition, SJBLEntity } from '@tme/shared';
import { partitionEntities, planStageWaves } from './pipeline-planner';

describe('pipeline planner', () => {
  it('plans independent stages in parallel waves', () => {
    const definition: PipelineDefinition = {
      id: 'pipeline-1',
      name: 'Accounting import',
      operation: 'migration',
      sourcePluginId: 'spreadsheet',
      destinationPluginIds: ['stan-jay-erp'],
      knowledgePackIds: [],
      stages: [
        { id: 'read', kind: 'read', dependsOn: [], capability: 'read' },
        { id: 'map', kind: 'map', dependsOn: ['read'], capability: 'map' },
        { id: 'validate', kind: 'validate', dependsOn: ['map'], capability: 'validate' },
        { id: 'archive', kind: 'archive', dependsOn: ['read'], capability: 'archive' },
        { id: 'write', kind: 'write', dependsOn: ['validate'], capability: 'write' },
      ],
    };
    expect(planStageWaves(definition).map((wave) => wave.map((stage) => stage.id))).toEqual([
      ['read'],
      ['archive', 'map'],
      ['validate'],
      ['write'],
    ]);
  });

  it('partitions dependent business entities into safe levels', () => {
    const entities = [
      { id: 'customer-1', type: 'customer' },
      { id: 'product-1', type: 'product' },
      { id: 'invoice-1', type: 'sale_invoice' },
      { id: 'payment-1', type: 'payment' },
    ] as SJBLEntity[];
    const partitions = partitionEntities('run-1', entities);
    expect(partitions.filter((partition) => partition.dependencyLevel === 0)).toHaveLength(2);
    expect(partitions.find((partition) => partition.entityTypes[0] === 'sale_invoice')?.dependencyLevel).toBe(1);
    expect(partitions.find((partition) => partition.entityTypes[0] === 'payment')?.dependencyLevel).toBe(2);
  });
});
