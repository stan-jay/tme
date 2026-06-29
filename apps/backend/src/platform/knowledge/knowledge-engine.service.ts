import { Injectable } from '@nestjs/common';
import type { KnowledgeEvaluation, SJBLEntity, ValidationIssue } from '@tme/shared';
import { KnowledgePackRegistry } from './knowledge-pack.registry';
import type { KnowledgeContext } from './base-knowledge-pack';

export interface KnowledgeEngineResult {
  /** True when no error-severity rule failed across all evaluated packs. */
  approved: boolean;
  packIds: string[];
  unknownPackIds: string[];
  errorCount: number;
  warningCount: number;
  issues: ValidationIssue[];
  evaluations: KnowledgeEvaluation[];
}

/**
 * Evaluates SJBL entities against one or more knowledge packs and reaches a
 * deterministic approval decision. Knowledge rules — not AI — decide whether
 * financial data is acceptable; every failure carries an explanation that
 * serves as evidence.
 */
@Injectable()
export class KnowledgeEngineService {
  constructor(private readonly registry: KnowledgePackRegistry) {}

  async evaluate(
    packIds: string[],
    entities: SJBLEntity[],
    context: KnowledgeContext = {},
  ): Promise<KnowledgeEngineResult> {
    const requested = [...new Set(packIds.filter((id) => typeof id === 'string' && id.trim() !== ''))];
    const evaluations: KnowledgeEvaluation[] = [];
    const unknownPackIds: string[] = [];

    for (const id of requested) {
      const pack = this.registry.tryResolve(id);
      if (!pack) {
        unknownPackIds.push(id);
        continue;
      }
      const applicable = pack.manifest.supportedEntityTypes.length
        ? entities.filter((entity) => pack.manifest.supportedEntityTypes.includes(entity.type))
        : entities;
      evaluations.push(await pack.evaluate(applicable, context));
    }

    const issues = evaluations.flatMap((evaluation) => evaluation.issues);
    const errorCount = issues.filter((issue) => issue.type === 'error').length;
    const warningCount = issues.filter((issue) => issue.type === 'warning').length;

    return {
      approved: errorCount === 0,
      packIds: requested,
      unknownPackIds,
      errorCount,
      warningCount,
      issues,
      evaluations,
    };
  }
}
