import { Injectable } from '@nestjs/common';
import type { KnowledgePackManifest, SJBLEntityType } from '@tme/shared';
import {
  asRecord,
  BaseKnowledgePack,
  batchRule,
  EvaluableRule,
  nonEmptyString,
  perEntityRule,
  RuleDecision,
} from '../base-knowledge-pack';

const MONETARY_TYPES: SJBLEntityType[] = [
  'sale_invoice',
  'purchase_order',
  'payment',
  'credit_note',
  'debit_note',
];
const DATED_TYPES: SJBLEntityType[] = [
  'sale_invoice',
  'purchase_order',
  'payment',
  'credit_note',
  'debit_note',
];

/**
 * Spreadsheet import knowledge pack.
 *
 * Captures the common mistakes that appear when business data arrives from
 * spreadsheets: duplicated identifiers, unparseable dates, missing currency and
 * untrimmed text. These are vendor-neutral data-quality rules.
 */
@Injectable()
export class SpreadsheetImportPack extends BaseKnowledgePack {
  readonly manifest: KnowledgePackManifest = {
    id: 'spreadsheet-import',
    name: 'Spreadsheet Import',
    version: '1.0.0',
    systemFamily: 'spreadsheet',
    languageVersion: '1.0',
    supportedEntityTypes: [],
  };

  protected rulesList(): EvaluableRule[] {
    return [
      batchRule(
        {
          id: 'ss-duplicate-external-id',
          name: 'Duplicate source identifiers',
          category: 'warning',
          severity: 'warning',
          entityTypes: [],
          description: 'Two rows share the same type and source identifier.',
        },
        (entities) => {
          const seen = new Map<string, number>();
          for (const entity of entities) {
            const externalId = asRecord(entity).externalId;
            if (typeof externalId !== 'string' || externalId.trim() === '') continue;
            const key = `${entity.type}:${externalId}`;
            seen.set(key, (seen.get(key) ?? 0) + 1);
          }
          const decisions: RuleDecision[] = [];
          for (const entity of entities) {
            const externalId = asRecord(entity).externalId;
            if (typeof externalId !== 'string' || externalId.trim() === '') continue;
            const count = seen.get(`${entity.type}:${externalId}`) ?? 0;
            if (count > 1) {
              decisions.push({
                entityId: entity.id,
                outcome: 'failed',
                explanation: `Source identifier ${externalId} appears ${count} times for type ${entity.type}`,
              });
            }
          }
          return decisions;
        },
      ),
      perEntityRule(
        {
          id: 'ss-unparseable-date',
          name: 'Dates must be parseable',
          category: 'warning',
          severity: 'error',
          entityTypes: DATED_TYPES,
          description: 'A required date value could not be parsed.',
        },
        (entity) => {
          const date = asRecord(entity).date;
          if (date === undefined || date === null || date === '') return null;
          const parsed = new Date(date as string | number);
          return {
            ok: !Number.isNaN(parsed.getTime()),
            explanation: `Date value "${String(date)}" is not parseable`,
          };
        },
      ),
      perEntityRule(
        {
          id: 'ss-missing-currency',
          name: 'Monetary records should declare a currency',
          category: 'currency',
          severity: 'information',
          entityTypes: MONETARY_TYPES,
          description: 'A monetary record has no currency; the organization default will be assumed.',
        },
        (entity) => ({
          ok: nonEmptyString(asRecord(entity).currency),
          explanation: 'No currency set on a monetary record',
        }),
      ),
      perEntityRule(
        {
          id: 'ss-trimmed-name',
          name: 'Names should not have surrounding whitespace',
          category: 'warning',
          severity: 'information',
          entityTypes: ['customer', 'supplier', 'product'],
          description: 'A name has leading or trailing whitespace.',
        },
        (entity) => {
          const name = asRecord(entity).name;
          if (typeof name !== 'string' || name === '') return null;
          return { ok: name === name.trim(), explanation: `Name "${name}" has surrounding whitespace` };
        },
      ),
    ];
  }
}
