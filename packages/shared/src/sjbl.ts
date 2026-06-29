import type { EntityRelationshipGraph, ValidationIssue } from './types';
import type { EntityType, SJUTFEntity } from './sj-utf';

/**
 * Stan Jay Business Language (SJBL)
 *
 * The canonical business language is the stable center of the platform.
 * External systems translate into and out of SJBL through independent
 * reader, writer, mapper and validator capabilities.
 *
 * SJUTFEntity remains an alias during the compatibility transition.
 */
export type SJBLEntityType = EntityType;
export type SJBLEntity = SJUTFEntity;

export interface SJBLDocument {
  language: 'sjbl';
  schemaVersion: string;
  documentId: string;
  organizationId: string;
  source?: {
    pluginId: string;
    connectionId?: string;
    capturedAt: string;
    cursor?: string;
  };
  entities: SJBLEntity[];
  relationships?: EntityRelationshipGraph;
  metadata?: Record<string, unknown>;
}

export interface SJBLValidationResult {
  valid: boolean;
  schemaVersion: string;
  issues: ValidationIssue[];
}

export type PipelineOperation =
  | 'migration'
  | 'synchronization'
  | 'replication'
  | 'backup'
  | 'archive'
  | 'validation'
  | 'comparison'
  | 'monitoring';

export type PipelineStageKind =
  | 'discover'
  | 'read'
  | 'map'
  | 'normalize'
  | 'validate'
  | 'relate'
  | 'decide'
  | 'write'
  | 'verify'
  | 'notify'
  | 'archive';

export interface PipelineDefinition {
  id: string;
  name: string;
  operation: PipelineOperation;
  sourcePluginId: string;
  destinationPluginIds: string[];
  knowledgePackIds: string[];
  stages: PipelineStageDefinition[];
  schedule?: PipelineSchedule;
  concurrency?: {
    maxParallelStages: number;
    maxParallelPartitions: number;
  };
}

export interface PipelineStageDefinition {
  id: string;
  kind: PipelineStageKind;
  dependsOn: string[];
  capability: string;
  pluginId?: string;
  knowledgePackId?: string;
  configuration?: Record<string, unknown>;
  retry?: {
    maxAttempts: number;
    backoffMs: number;
    maxBackoffMs: number;
  };
}

export interface PipelineSchedule {
  mode: 'manual' | 'cron' | 'watch' | 'webhook';
  expression?: string;
  timezone?: string;
  watchLocationId?: string;
}

export interface PipelinePartition {
  id: string;
  pipelineRunId: string;
  entityTypes: SJBLEntityType[];
  dependencyLevel: number;
  itemCount: number;
}
