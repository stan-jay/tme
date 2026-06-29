import type { SJBLEntity, SJBLEntityType } from './sjbl';
import type { ValidationIssue } from './types';

export interface KnowledgePackManifest {
  id: string;
  name: string;
  version: string;
  systemFamily: string;
  languageVersion: string;
  supportedEntityTypes: SJBLEntityType[];
  jurisdictions?: string[];
  currencies?: string[];
}

export interface KnowledgeRule {
  id: string;
  name: string;
  category:
    | 'required-field'
    | 'posting'
    | 'tax'
    | 'currency'
    | 'inventory'
    | 'relationship'
    | 'reversal'
    | 'mapping'
    | 'warning';
  severity: 'error' | 'warning' | 'information';
  entityTypes: SJBLEntityType[];
  description: string;
  sourceReference?: string;
}

export interface KnowledgeEvaluation {
  packId: string;
  packVersion: string;
  issues: ValidationIssue[];
  decisions: Array<{
    ruleId: string;
    entityId: string;
    outcome: 'passed' | 'failed' | 'not-applicable';
    explanation: string;
  }>;
}

export interface KnowledgePack {
  manifest: KnowledgePackManifest;
  rules(): Promise<KnowledgeRule[]>;
  evaluate(entities: SJBLEntity[], context: Record<string, unknown>): Promise<KnowledgeEvaluation>;
}
