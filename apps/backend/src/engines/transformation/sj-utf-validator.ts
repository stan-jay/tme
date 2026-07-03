import type { SJUTFEntity } from '@tme/shared';

export interface RuntimeValidationError {
  entityId: string;
  entityType: string;
  message: string;
}

export function validateSjUtfEntities(entities: SJUTFEntity[]): RuntimeValidationError[] {
  const errors: RuntimeValidationError[] = [];
  for (const entity of entities) {
    if (!entity.id || !entity.type) {
      errors.push({
        entityId: entity.id || 'unknown',
        entityType: entity.type || 'unknown',
        message: 'Every SJ-UTF entity requires id and type',
      });
      continue;
    }

    const value = entity as unknown as Record<string, unknown>;
    if (entity.type === 'sale_invoice') {
      requireString(value, 'invoiceNumber', entity, errors);
      requireString(value, 'customerId', entity, errors);
      requireString(value, 'date', entity, errors);
      requireNumber(value, 'subtotal', entity, errors);
      requireNumber(value, 'tax', entity, errors);
      requireNumber(value, 'total', entity, errors);
      if (!Array.isArray(value.items) || value.items.length === 0) {
        errors.push(error(entity, 'Sale invoice requires at least one line item'));
      }
    } else if (entity.type === 'purchase_order') {
      requireString(value, 'purchaseOrderNumber', entity, errors);
      requireString(value, 'supplierId', entity, errors);
      requireString(value, 'date', entity, errors);
      requireNumber(value, 'subtotal', entity, errors);
      requireNumber(value, 'tax', entity, errors);
      requireNumber(value, 'total', entity, errors);
      if (!Array.isArray(value.items) || value.items.length === 0) {
        errors.push(error(entity, 'Purchase order requires at least one line item'));
      }
    } else if (entity.type === 'credit_note') {
      requireString(value, 'creditNoteNumber', entity, errors);
      requireString(value, 'customerId', entity, errors);
      requireString(value, 'date', entity, errors);
      requireNumber(value, 'subtotal', entity, errors);
      requireNumber(value, 'tax', entity, errors);
      requireNumber(value, 'total', entity, errors);
      if (!Array.isArray(value.items) || value.items.length === 0) {
        errors.push(error(entity, 'Credit note requires at least one line item'));
      }
    } else if (entity.type === 'debit_note') {
      requireString(value, 'debitNoteNumber', entity, errors);
      requireString(value, 'supplierId', entity, errors);
      requireString(value, 'date', entity, errors);
      requireNumber(value, 'subtotal', entity, errors);
      requireNumber(value, 'tax', entity, errors);
      requireNumber(value, 'total', entity, errors);
      if (!Array.isArray(value.items) || value.items.length === 0) {
        errors.push(error(entity, 'Debit note requires at least one line item'));
      }
    } else if (entity.type === 'supplier') {
      requireString(value, 'name', entity, errors);
    } else if (entity.type === 'customer' || entity.type === 'product') {
      requireString(value, 'name', entity, errors);
      if (entity.type === 'product') requireNumber(value, 'unitPrice', entity, errors);
    } else if (entity.type === 'payment') {
      requireNumber(value, 'amount', entity, errors);
      requireString(value, 'date', entity, errors);
    }
  }
  return errors;
}

function requireString(
  value: Record<string, unknown>,
  field: string,
  entity: SJUTFEntity,
  errors: RuntimeValidationError[],
): void {
  if (typeof value[field] !== 'string' || !String(value[field]).trim()) {
    errors.push(error(entity, `${entity.type}.${field} must be a non-empty string`));
  }
}

function requireNumber(
  value: Record<string, unknown>,
  field: string,
  entity: SJUTFEntity,
  errors: RuntimeValidationError[],
): void {
  if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
    errors.push(error(entity, `${entity.type}.${field} must be a finite number`));
  }
}

function error(entity: SJUTFEntity, message: string): RuntimeValidationError {
  return { entityId: entity.id, entityType: entity.type, message };
}
