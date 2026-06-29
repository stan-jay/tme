import type {
  ColumnMapping,
  KnowledgePack,
  SJBLEntity,
  SJBLEntityType,
  ValidationIssue,
} from '@tme/shared';

export type PluginCategory =
  | 'accounting'
  | 'erp'
  | 'pos'
  | 'ecommerce'
  | 'spreadsheet'
  | 'database'
  | 'storage'
  | 'payroll'
  | 'manufacturing'
  | 'custom';

export type PluginCapability =
  | 'discover'
  | 'read'
  | 'write'
  | 'map'
  | 'validate'
  | 'compare'
  | 'watch'
  | 'webhook'
  | 'rollback';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  category: PluginCategory;
  capabilities: PluginCapability[];
  supportedEntityTypes: SJBLEntityType[];
  configurationSchema: ConfigurationField[];
  documentationUrl?: string;
}

export interface ConfigurationField {
  key: string;
  label: string;
  type: 'text' | 'secret' | 'url' | 'number' | 'boolean' | 'select';
  required: boolean;
  secret?: boolean;
  options?: Array<{ label: string; value: string }>;
  description?: string;
}

export interface CapabilityContext {
  organizationId: string;
  connectionId: string;
  pipelineRunId: string;
  configuration: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
}

export interface ConnectionTestResult {
  connected: boolean;
  message: string;
  capabilities?: PluginCapability[];
  metadata?: Record<string, unknown>;
}

export interface DiscoveryResult {
  resources: Array<{
    id: string;
    name: string;
    entityTypes: SJBLEntityType[];
    estimatedCount?: number;
  }>;
  cursor?: string;
}

export interface ReadRequest {
  resourceId?: string;
  entityTypes?: SJBLEntityType[];
  cursor?: string;
  pageSize: number;
  changedSince?: string;
}

export interface ReadPage<T = unknown> {
  records: T[];
  nextCursor?: string;
  checkpoint?: string;
  complete: boolean;
}

export interface WriteRequest {
  entities: SJBLEntity[];
  partitionId: string;
  idempotencyKey: string;
}

export interface WriteItemResult {
  entityId: string;
  status: 'succeeded' | 'failed' | 'skipped';
  destinationId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface WriteResult {
  items: WriteItemResult[];
  checkpoint?: string;
}

export interface MappingRequest {
  sourceFields: string[];
  targetEntityTypes: SJBLEntityType[];
  sampleRecords?: unknown[];
  context?: Record<string, unknown>;
}

export interface ValidationRequest {
  entities: SJBLEntity[];
  operation: 'read' | 'write' | 'compare';
  context?: Record<string, unknown>;
}

export interface SourceReader {
  testConnection(context: CapabilityContext): Promise<ConnectionTestResult>;
  discover(context: CapabilityContext): Promise<DiscoveryResult>;
  read(request: ReadRequest, context: CapabilityContext): AsyncIterable<ReadPage>;
}

export interface DestinationWriter {
  testConnection(context: CapabilityContext): Promise<ConnectionTestResult>;
  write(request: WriteRequest, context: CapabilityContext): Promise<WriteResult>;
}

export interface MappingProvider {
  suggestMappings(request: MappingRequest, context: CapabilityContext): Promise<ColumnMapping[]>;
}

export interface BusinessValidator {
  validate(request: ValidationRequest, context: CapabilityContext): Promise<ValidationIssue[]>;
}

export interface ChangeWatcher {
  watch(
    request: ReadRequest,
    context: CapabilityContext,
  ): AsyncIterable<{ eventId: string; occurredAt: string; record: unknown }>;
}

export interface RollbackProvider {
  compensate(
    writes: WriteItemResult[],
    context: CapabilityContext,
  ): Promise<WriteResult>;
}

export interface BusinessSystemPlugin {
  manifest: PluginManifest;
  reader?: SourceReader;
  writer?: DestinationWriter;
  mapper?: MappingProvider;
  validator?: BusinessValidator;
  watcher?: ChangeWatcher;
  rollback?: RollbackProvider;
  knowledgePacks?: KnowledgePack[];
}

export class PluginContractError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PluginContractError';
  }
}
