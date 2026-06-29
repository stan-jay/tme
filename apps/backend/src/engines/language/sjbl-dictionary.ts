import type { SJBLEntityType } from '@tme/shared';

export type FieldType = 'string' | 'number' | 'currency' | 'date' | 'enum';

export interface FieldDefinition {
  /** Canonical SJBL field name on the entity. */
  field: string;
  type: FieldType;
  aliases: string[];
  required?: boolean;
  /** Detection weight; distinctive fields (e.g. invoiceNumber) score higher. */
  weight?: number;
  enumValues?: string[];
}

export interface EntityDefinition {
  type: SJBLEntityType;
  /** Document entities carry line items synthesized from flat rows. */
  document?: boolean;
  fields: FieldDefinition[];
}

/**
 * The SJBL semantic dictionary — the canonical vocabulary the platform uses to
 * interpret external column names. Each field lists human aliases; matching is
 * deterministic and alias-based (no AI, no network). Distinctive fields carry a
 * higher weight so entity-type detection is driven by the columns that only one
 * entity type owns.
 */
export const SJBL_DICTIONARY: EntityDefinition[] = [
  {
    type: 'customer',
    fields: [
      { field: 'name', type: 'string', required: true, weight: 1, aliases: ['name', 'customer', 'customer name', 'client', 'client name', 'account name'] },
      { field: 'email', type: 'string', aliases: ['email', 'email address', 'e-mail'] },
      { field: 'phone', type: 'string', aliases: ['phone', 'telephone', 'mobile', 'contact number'] },
      { field: 'taxId', type: 'string', weight: 2, aliases: ['tax id', 'tin', 'tax identification', 'vat number', 'taxpayer id'] },
      { field: 'accountNumber', type: 'string', weight: 2, aliases: ['account number', 'account no', 'customer code', 'customer id'] },
      { field: 'creditLimit', type: 'number', aliases: ['credit limit'] },
      { field: 'openBalance', type: 'number', aliases: ['open balance', 'opening balance', 'balance'] },
    ],
  },
  {
    type: 'supplier',
    fields: [
      { field: 'name', type: 'string', required: true, weight: 1, aliases: ['name', 'supplier', 'supplier name', 'vendor', 'vendor name'] },
      { field: 'email', type: 'string', aliases: ['email', 'email address', 'e-mail'] },
      { field: 'phone', type: 'string', aliases: ['phone', 'telephone', 'mobile'] },
      { field: 'taxId', type: 'string', weight: 2, aliases: ['tax id', 'tin', 'vat number'] },
      { field: 'supplierCode', type: 'string', weight: 3, aliases: ['supplier code', 'vendor code', 'supplier id', 'vendor id'] },
      { field: 'paymentTerms', type: 'string', aliases: ['payment terms', 'terms'] },
    ],
  },
  {
    type: 'product',
    fields: [
      { field: 'name', type: 'string', required: true, weight: 1, aliases: ['name', 'product', 'product name', 'item', 'item name', 'description'] },
      { field: 'sku', type: 'string', weight: 3, aliases: ['sku', 'stock code', 'item code', 'product code', 'part number'] },
      { field: 'barcode', type: 'string', weight: 2, aliases: ['barcode', 'ean', 'upc'] },
      { field: 'category', type: 'string', aliases: ['category', 'product category', 'group'] },
      { field: 'unitPrice', type: 'currency', required: true, weight: 2, aliases: ['unit price', 'price', 'selling price', 'sales price', 'rate'] },
      { field: 'unitCost', type: 'currency', weight: 2, aliases: ['unit cost', 'cost', 'cost price', 'buying price'] },
      { field: 'quantity', type: 'number', aliases: ['quantity', 'qty', 'stock', 'on hand', 'stock on hand'] },
      { field: 'taxCode', type: 'string', aliases: ['tax code', 'vat code'] },
    ],
  },
  {
    type: 'sale_invoice',
    document: true,
    fields: [
      { field: 'invoiceNumber', type: 'string', required: true, weight: 3, aliases: ['invoice number', 'invoice no', 'invoice', 'invoice #', 'inv no', 'inv number', 'bill number'] },
      { field: 'customerId', type: 'string', required: true, weight: 2, aliases: ['customer id', 'customer', 'customer code', 'client id', 'bill to'] },
      { field: 'date', type: 'date', required: true, weight: 1, aliases: ['date', 'invoice date', 'issue date', 'transaction date'] },
      { field: 'dueDate', type: 'date', weight: 2, aliases: ['due date', 'payment due', 'maturity date'] },
      { field: 'subtotal', type: 'currency', weight: 2, aliases: ['subtotal', 'sub total', 'net amount', 'net', 'amount before tax'] },
      { field: 'discount', type: 'currency', aliases: ['discount', 'discount amount'] },
      { field: 'tax', type: 'currency', weight: 1, aliases: ['tax', 'vat', 'vat amount', 'tax amount', 'gst'] },
      { field: 'total', type: 'currency', weight: 1, aliases: ['total', 'grand total', 'invoice total', 'amount due', 'gross amount'] },
      { field: 'currency', type: 'string', aliases: ['currency', 'ccy'] },
      { field: 'status', type: 'enum', enumValues: ['draft', 'issued', 'paid', 'overdue', 'cancelled'], aliases: ['status', 'invoice status'] },
      { field: 'paymentTerms', type: 'string', aliases: ['payment terms', 'terms'] },
    ],
  },
  {
    type: 'purchase_order',
    document: true,
    fields: [
      { field: 'purchaseOrderNumber', type: 'string', required: true, weight: 3, aliases: ['purchase order number', 'po number', 'po no', 'po', 'order number'] },
      { field: 'supplierId', type: 'string', required: true, weight: 2, aliases: ['supplier id', 'supplier', 'vendor id', 'vendor'] },
      { field: 'date', type: 'date', weight: 1, aliases: ['date', 'order date', 'po date'] },
      { field: 'expectedDate', type: 'date', weight: 2, aliases: ['expected date', 'delivery date', 'expected delivery'] },
      { field: 'subtotal', type: 'currency', weight: 2, aliases: ['subtotal', 'sub total', 'net amount'] },
      { field: 'tax', type: 'currency', aliases: ['tax', 'vat', 'vat amount'] },
      { field: 'total', type: 'currency', aliases: ['total', 'grand total', 'order total'] },
      { field: 'currency', type: 'string', aliases: ['currency', 'ccy'] },
    ],
  },
  {
    type: 'payment',
    fields: [
      { field: 'referenceNumber', type: 'string', weight: 2, aliases: ['reference number', 'reference', 'ref', 'ref no', 'payment reference', 'receipt number'] },
      { field: 'customerId', type: 'string', weight: 1, aliases: ['customer id', 'customer', 'received from', 'paid by'] },
      { field: 'supplierId', type: 'string', weight: 1, aliases: ['supplier id', 'supplier', 'paid to', 'vendor'] },
      { field: 'amount', type: 'currency', required: true, weight: 2, aliases: ['amount', 'payment amount', 'amount paid', 'value'] },
      { field: 'date', type: 'date', required: true, weight: 1, aliases: ['date', 'payment date', 'transaction date'] },
      { field: 'currency', type: 'string', aliases: ['currency', 'ccy'] },
      { field: 'paymentMethod', type: 'enum', weight: 3, enumValues: ['cash', 'cheque', 'bank', 'momo', 'card', 'other'], aliases: ['payment method', 'method', 'mode of payment', 'pay method', 'channel'] },
      { field: 'bankAccountId', type: 'string', aliases: ['bank account', 'account', 'bank'] },
    ],
  },
  {
    type: 'credit_note',
    document: true,
    fields: [
      { field: 'creditNoteNumber', type: 'string', required: true, weight: 3, aliases: ['credit note number', 'credit note', 'cn number', 'cn no', 'credit memo'] },
      { field: 'customerId', type: 'string', required: true, weight: 2, aliases: ['customer id', 'customer', 'client'] },
      { field: 'date', type: 'date', weight: 1, aliases: ['date', 'credit note date'] },
      { field: 'subtotal', type: 'currency', weight: 1, aliases: ['subtotal', 'sub total', 'net amount'] },
      { field: 'tax', type: 'currency', aliases: ['tax', 'vat'] },
      { field: 'total', type: 'currency', aliases: ['total', 'credit total'] },
      { field: 'reason', type: 'string', weight: 2, aliases: ['reason', 'credit reason'] },
    ],
  },
];

export function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const DOCUMENT_TYPES = new Set(
  SJBL_DICTIONARY.filter((entity) => entity.document).map((entity) => entity.type),
);

export function isDocumentEntity(type: SJBLEntityType): boolean {
  return DOCUMENT_TYPES.has(type);
}

export function entityDefinition(type: SJBLEntityType): EntityDefinition | undefined {
  return SJBL_DICTIONARY.find((entity) => entity.type === type);
}
