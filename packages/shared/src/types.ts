export interface MigrationHealth {
  status: 'ok' | 'error';
  service: string;
}

export type SourceFileType = 'csv' | 'excel';

export interface DataColumn {
  name: string;
  semanticType?: string;
}

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  confidence: number; // 0-1
  suggestedType?: string;
  userConfirmed?: boolean;
}

export interface ValidationIssue {
  id?: string;
  type: 'error' | 'warning';
  row?: number;
  column?: string;
  message: string;
  value?: any;
}

export interface MigrationPreview {
  sourceRows: number;
  mappedRows: number;
  issues: ValidationIssue[];
  healthScore: number; // 0-100
  mappings: ColumnMapping[];
  estimatedSuccess: number; // 0-1
}

export interface RelationshipEdge {
  from: string; // entity id
  to: string; // entity id
  type: string; // 'customer_invoice', 'invoice_payment', etc.
}

export interface EntityRelationshipGraph {
  nodes: Map<string, any>;
  edges: RelationshipEdge[];
}
