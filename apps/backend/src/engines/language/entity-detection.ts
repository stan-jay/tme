import type { ColumnMapping, SJBLEntity, SJBLEntityType } from '@tme/shared';
import {
  entityDefinition,
  FieldType,
  isDocumentEntity,
  normalizeToken,
  SJBL_DICTIONARY,
} from './sjbl-dictionary';
import { coerceValue, parseDecimal } from './value-normalization';

interface FieldMatch {
  field: string;
  type: FieldType;
  confidence: number;
  enumValues?: string[];
}

/** Priority used to break entity-detection ties deterministically. */
const ENTITY_PRIORITY: SJBLEntityType[] = [
  'sale_invoice',
  'payment',
  'purchase_order',
  'credit_note',
  'product',
  'customer',
  'supplier',
];

/** Reverse index: field name -> the entities that own it and the field weight. */
const FIELD_OWNERS = new Map<string, Array<{ type: SJBLEntityType; weight: number }>>();
for (const entity of SJBL_DICTIONARY) {
  for (const field of entity.fields) {
    const owners = FIELD_OWNERS.get(field.field) ?? [];
    owners.push({ type: entity.type, weight: field.weight ?? 1 });
    FIELD_OWNERS.set(field.field, owners);
  }
}

function matchColumn(column: string): FieldMatch | null {
  const target = normalizeToken(column);
  if (!target) return null;
  let best: FieldMatch | null = null;
  for (const entity of SJBL_DICTIONARY) {
    for (const field of entity.fields) {
      for (const alias of field.aliases) {
        const normalizedAlias = normalizeToken(alias);
        if (!normalizedAlias) continue;
        let confidence = 0;
        if (target === normalizedAlias) confidence = 0.95;
        else if (
          normalizedAlias.length >= 4 &&
          (target.includes(normalizedAlias) || normalizedAlias.includes(target))
        ) {
          confidence = 0.7;
        }
        if (!confidence) continue;
        // Tiny weight nudge keeps distinctive fields ahead on ties.
        const score = confidence + (field.weight ?? 1) * 0.001;
        if (!best || score > best.confidence) {
          best = { field: field.field, type: field.type, confidence: score, enumValues: field.enumValues };
        }
      }
    }
  }
  if (!best) return null;
  return { ...best, confidence: Math.min(0.99, best.confidence) };
}

function snakeCase(column: string): string {
  return column.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/**
 * Deterministically maps source columns to SJBL fields by alias. Every column
 * receives a mapping; unmatched columns fall back to a snake-cased name at low
 * confidence so they are preserved as metadata rather than dropped.
 */
export function detectColumnMappings(columns: string[]): ColumnMapping[] {
  return columns.map((column) => {
    const match = matchColumn(column);
    if (match) {
      return {
        sourceColumn: column,
        targetField: match.field,
        confidence: Number(match.confidence.toFixed(2)),
        suggestedType: match.type,
      };
    }
    return { sourceColumn: column, targetField: snakeCase(column), confidence: 0.3 };
  });
}

/**
 * Infers the SJBL entity type from the set of mapped target fields. Each entity
 * is scored by the weighted fields it owns among the mappings; the highest score
 * wins, with a deterministic priority tie-break.
 */
export function detectEntityType(targetFields: string[]): SJBLEntityType {
  const scores = new Map<SJBLEntityType, number>();
  for (const field of targetFields) {
    for (const owner of FIELD_OWNERS.get(field) ?? []) {
      scores.set(owner.type, (scores.get(owner.type) ?? 0) + owner.weight);
    }
  }
  let bestType: SJBLEntityType = 'sale_invoice';
  let bestScore = -1;
  for (const type of ENTITY_PRIORITY) {
    const score = scores.get(type) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }
  return bestType;
}

/**
 * Builds typed SJBL entities from raw rows and confirmed column mappings. The
 * entity type is detected once for the batch; each row is constructed with
 * values coerced to the SJBL field types, and document entities (invoices,
 * orders, credit notes) get a synthesized line item that reconciles with the
 * subtotal so downstream posting rules can evaluate them.
 */
export function buildEntities(rawData: Array<Record<string, unknown>>, mappings: ColumnMapping[]): SJBLEntity[] {
  const type = detectEntityType(mappings.map((mapping) => mapping.targetField));
  const definition = entityDefinition(type);
  const fieldByName = new Map(definition?.fields.map((field) => [field.field, field]) ?? []);

  return rawData.map((row, index) => {
    const entity: Record<string, unknown> = {
      id: `${type}-${index + 1}`,
      type,
      externalId: String(index + 1),
      metadata: {} as Record<string, unknown>,
    };

    for (const mapping of mappings) {
      const raw = row[mapping.sourceColumn];
      const field = fieldByName.get(mapping.targetField);
      if (field) {
        const coerced = coerceValue(raw, field.type, field.enumValues);
        if (coerced !== undefined) entity[mapping.targetField] = coerced;
      } else if (raw !== undefined && raw !== null && raw !== '') {
        (entity.metadata as Record<string, unknown>)[mapping.targetField] = raw;
      }
    }

    if (isDocumentEntity(type)) reconcileDocument(entity);
    return entity as unknown as SJBLEntity;
  });
}

function reconcileDocument(entity: Record<string, unknown>): void {
  const tax = num(entity.tax) ?? 0;
  const discount = num(entity.discount) ?? 0;
  let subtotal = num(entity.subtotal);
  let total = num(entity.total);

  if (subtotal === null && total !== null) subtotal = total - tax + discount;
  if (total === null && subtotal !== null) total = subtotal + tax - discount;

  entity.tax = tax;
  if (subtotal !== null) entity.subtotal = round(subtotal);
  if (total !== null) entity.total = round(total);

  if (!Array.isArray(entity.items) || entity.items.length === 0) {
    const lineValue = subtotal ?? total ?? 0;
    entity.items = [
      {
        productId: typeof entity.productId === 'string' ? entity.productId : 'line-1',
        description: typeof entity.description === 'string' ? entity.description : undefined,
        quantity: num(entity.quantity) ?? 1,
        unitPrice: round(lineValue),
        total: round(lineValue),
      },
    ];
  }
}

function num(value: unknown): number | null {
  return parseDecimal(value);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
