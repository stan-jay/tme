import { Injectable } from '@nestjs/common';
import type {
  EntityRelationshipGraph,
  RelationshipEdge,
  SJBLEntityType,
  SJUTFEntity,
} from '@tme/shared';

interface ReferenceSpec {
  field: string;
  targetType: SJBLEntityType;
  /** When true the reference is read from each line item rather than the entity. */
  viaLineItems?: boolean;
}

interface UnresolvedReference {
  fromId: string;
  fromType: SJBLEntityType;
  field: string;
  value: string;
  targetType: SJBLEntityType;
}

export interface RelationshipAnalysis {
  graph: EntityRelationshipGraph;
  edgeCount: number;
  edgesByType: Record<string, number>;
  /** References whose target type is present in the batch but the instance is missing. */
  unresolved: UnresolvedReference[];
  /** References to types absent from the batch (assumed to exist in the destination). */
  externalReferenceCount: number;
}

/** Outgoing references each entity type declares, resolved against the batch. */
const REFERENCE_SPECS: Partial<Record<SJBLEntityType, ReferenceSpec[]>> = {
  sale_invoice: [
    { field: 'customerId', targetType: 'customer' },
    { field: 'productId', targetType: 'product', viaLineItems: true },
  ],
  purchase_order: [
    { field: 'supplierId', targetType: 'supplier' },
    { field: 'productId', targetType: 'product', viaLineItems: true },
  ],
  credit_note: [
    { field: 'customerId', targetType: 'customer' },
    { field: 'productId', targetType: 'product', viaLineItems: true },
  ],
  payment: [
    { field: 'customerId', targetType: 'customer' },
    { field: 'supplierId', targetType: 'supplier' },
    { field: 'relatedDocumentId', targetType: 'sale_invoice' },
  ],
  inventory_item: [{ field: 'productId', targetType: 'product' }],
  stock_movement: [{ field: 'productId', targetType: 'product' }],
  contact: [{ field: 'companyId', targetType: 'company' }],
  employee: [{ field: 'departmentId', targetType: 'department' }],
};

/** Business-key fields used to resolve references that carry a code or name, not an SJBL id. */
const KEY_FIELDS: Partial<Record<SJBLEntityType, string[]>> = {
  customer: ['externalId', 'accountNumber', 'name'],
  supplier: ['externalId', 'supplierCode', 'name'],
  product: ['externalId', 'sku', 'barcode', 'name'],
  company: ['externalId', 'registrationNumber', 'name'],
  sale_invoice: ['externalId', 'invoiceNumber'],
  purchase_order: ['externalId', 'purchaseOrderNumber'],
  department: ['externalId', 'code', 'name'],
};

@Injectable()
export class RelationshipService {
  /**
   * Builds the entity relationship graph, preserving business relationships by
   * resolving references both by SJBL id and by business key (code or name).
   */
  async buildGraph(entities: SJUTFEntity[]): Promise<EntityRelationshipGraph> {
    return this.analyze(entities).graph;
  }

  /**
   * Returns genuine dangling references: a reference whose target type is
   * present in the batch but the specific instance is missing. References to
   * types absent from the batch are treated as external, not errors.
   */
  async validateRelationships(graph: EntityRelationshipGraph): Promise<string[]> {
    const entities = [...graph.nodes.values()] as SJUTFEntity[];
    return this.analyze(entities).unresolved.map(
      (reference) =>
        `${reference.fromType} ${reference.fromId} references ${reference.targetType} "${reference.value}" which is not present`,
    );
  }

  analyze(entities: SJUTFEntity[]): RelationshipAnalysis {
    const nodes = new Map<string, SJUTFEntity>(entities.map((entity) => [entity.id, entity]));
    const byId = nodes;
    const keyIndex = this.buildKeyIndex(entities);
    const presentTypes = new Set(entities.map((entity) => entity.type));

    const edges: RelationshipEdge[] = [];
    const edgesByType: Record<string, number> = {};
    const unresolved: UnresolvedReference[] = [];
    let externalReferenceCount = 0;

    for (const entity of entities) {
      for (const spec of REFERENCE_SPECS[entity.type] ?? []) {
        for (const value of this.referenceValues(entity, spec)) {
          const targetId = this.resolve(value, spec.targetType, byId, keyIndex);
          if (targetId) {
            const edgeType = `${entity.type}_${spec.targetType}`;
            edges.push({ from: entity.id, to: targetId, type: edgeType });
            edgesByType[edgeType] = (edgesByType[edgeType] ?? 0) + 1;
          } else if (presentTypes.has(spec.targetType)) {
            unresolved.push({
              fromId: entity.id,
              fromType: entity.type,
              field: spec.field,
              value,
              targetType: spec.targetType,
            });
          } else {
            externalReferenceCount++;
          }
        }
      }
    }

    return { graph: { nodes, edges }, edgeCount: edges.length, edgesByType, unresolved, externalReferenceCount };
  }

  private referenceValues(entity: SJUTFEntity, spec: ReferenceSpec): string[] {
    const record = entity as unknown as Record<string, unknown>;
    if (spec.viaLineItems) {
      const items = record.items;
      if (!Array.isArray(items)) return [];
      return items
        .map((item) => normalizeRef((item as Record<string, unknown>)[spec.field]))
        .filter((value): value is string => value !== null);
    }
    const value = normalizeRef(record[spec.field]);
    return value ? [value] : [];
  }

  private resolve(
    value: string,
    targetType: SJBLEntityType,
    byId: Map<string, SJUTFEntity>,
    keyIndex: Map<string, string>,
  ): string | null {
    const direct = byId.get(value);
    if (direct && direct.type === targetType) return direct.id;
    return keyIndex.get(`${targetType}:${value}`) ?? null;
  }

  private buildKeyIndex(entities: SJUTFEntity[]): Map<string, string> {
    const index = new Map<string, string>();
    for (const entity of entities) {
      const record = entity as unknown as Record<string, unknown>;
      const fields = KEY_FIELDS[entity.type] ?? ['externalId'];
      for (const field of fields) {
        const key = normalizeRef(record[field]);
        if (!key) continue;
        const indexKey = `${entity.type}:${key}`;
        if (!index.has(indexKey)) index.set(indexKey, entity.id);
      }
    }
    return index;
  }
}

function normalizeRef(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().toLowerCase();
  return text === '' ? null : text;
}
