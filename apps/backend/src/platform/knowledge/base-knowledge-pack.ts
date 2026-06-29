import type {
  KnowledgeEvaluation,
  KnowledgePack,
  KnowledgePackManifest,
  KnowledgeRule,
  SJBLEntity,
  ValidationIssue,
} from '@tme/shared';

export type KnowledgeContext = Record<string, unknown>;

export interface RuleDecision {
  entityId: string;
  outcome: 'passed' | 'failed' | 'not-applicable';
  explanation: string;
}

/**
 * A deterministic rule: given the entities it applies to, it returns a decision
 * (with a human-readable explanation that doubles as evidence) per inspected
 * entity. Rules never call AI and never reach the network.
 */
export interface EvaluableRule {
  meta: KnowledgeRule;
  evaluate(entities: SJBLEntity[], context: KnowledgeContext): RuleDecision[];
}

/** Caps the per-pack decision list so large batches keep bounded output. */
const MAX_FAILED_DECISIONS = 500;

/**
 * Builds a rule that inspects each entity independently. `check` returns null
 * when the rule does not apply to that entity, otherwise an outcome plus the
 * evidence string.
 */
export function perEntityRule(
  meta: KnowledgeRule,
  check: (entity: SJBLEntity, context: KnowledgeContext) => { ok: boolean; explanation: string } | null,
): EvaluableRule {
  return {
    meta,
    evaluate(entities, context) {
      const decisions: RuleDecision[] = [];
      for (const entity of entities) {
        const result = check(entity, context);
        if (!result) {
          decisions.push({ entityId: entity.id, outcome: 'not-applicable', explanation: 'Rule not applicable' });
          continue;
        }
        decisions.push({
          entityId: entity.id,
          outcome: result.ok ? 'passed' : 'failed',
          explanation: result.explanation,
        });
      }
      return decisions;
    },
  };
}

/** Builds a rule that inspects the whole applicable batch (e.g. duplicate detection). */
export function batchRule(
  meta: KnowledgeRule,
  check: (entities: SJBLEntity[], context: KnowledgeContext) => RuleDecision[],
): EvaluableRule {
  return { meta, evaluate: check };
}

export abstract class BaseKnowledgePack implements KnowledgePack {
  abstract readonly manifest: KnowledgePackManifest;
  protected abstract rulesList(): EvaluableRule[];

  async rules(): Promise<KnowledgeRule[]> {
    return this.rulesList().map((rule) => rule.meta);
  }

  async evaluate(entities: SJBLEntity[], context: KnowledgeContext): Promise<KnowledgeEvaluation> {
    const issues: ValidationIssue[] = [];
    const decisions: KnowledgeEvaluation['decisions'] = [];
    for (const rule of this.rulesList()) {
      const applicable = rule.meta.entityTypes.length
        ? entities.filter((entity) => rule.meta.entityTypes.includes(entity.type))
        : entities;
      if (!applicable.length) continue;
      for (const decision of rule.evaluate(applicable, context)) {
        if (decision.outcome !== 'failed') continue;
        if (decisions.length < MAX_FAILED_DECISIONS) {
          decisions.push({
            ruleId: rule.meta.id,
            entityId: decision.entityId,
            outcome: decision.outcome,
            explanation: decision.explanation,
          });
        }
        if (rule.meta.severity !== 'information') {
          issues.push({
            type: rule.meta.severity,
            message: `[${this.manifest.id}/${rule.meta.id}] ${decision.explanation}`,
            value: decision.entityId,
          });
        }
      }
    }
    return { packId: this.manifest.id, packVersion: this.manifest.version, issues, decisions };
  }
}

export function asRecord(entity: SJBLEntity): Record<string, unknown> {
  return entity as unknown as Record<string, unknown>;
}

export function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function approxEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
