import type { ColumnMapping, SaleInvoice } from '@tme/shared';
import { buildEntities, detectColumnMappings, detectEntityType } from './entity-detection';
import { parseDateToIso, parseDecimal } from './value-normalization';
import { KnowledgePackRegistry } from '../../platform/knowledge/knowledge-pack.registry';
import { KnowledgeEngineService } from '../../platform/knowledge/knowledge-engine.service';
import { StanJayAccountingPack } from '../../platform/knowledge/packs/stan-jay-accounting.pack';
import { SpreadsheetImportPack } from '../../platform/knowledge/packs/spreadsheet-import.pack';
import { validateSjUtfEntities } from '../transformation/sj-utf-validator';

describe('value normalization', () => {
  it('parses decimals with separators, currency codes and negatives', () => {
    expect(parseDecimal('1,234.56')).toBe(1234.56);
    expect(parseDecimal('GHS 1,200.50')).toBe(1200.5);
    expect(parseDecimal('1.200,50')).toBe(1200.5);
    expect(parseDecimal('(500)')).toBe(-500);
    expect(parseDecimal('abc')).toBeNull();
  });

  it('parses day-first and ISO dates to ISO', () => {
    expect(parseDateToIso('15/01/2024')).toBe('2024-01-15');
    expect(parseDateToIso('01/15/2024')).toBe('2024-01-15');
    expect(parseDateToIso('2024-01-15')).toBe('2024-01-15');
    expect(parseDateToIso('not a date')).toBeNull();
  });
});

describe('field and entity detection', () => {
  it('maps source columns to SJBL fields by alias', () => {
    const mappings = detectColumnMappings(['Invoice No', 'Customer', 'Grand Total', 'Wibble']);
    const byColumn = new Map(mappings.map((mapping) => [mapping.sourceColumn, mapping]));
    expect(byColumn.get('Invoice No')?.targetField).toBe('invoiceNumber');
    expect(byColumn.get('Invoice No')!.confidence).toBeGreaterThan(0.9);
    expect(byColumn.get('Customer')?.targetField).toBe('customerId');
    expect(byColumn.get('Grand Total')?.targetField).toBe('total');
    // Unknown column is preserved at low confidence, not dropped.
    expect(byColumn.get('Wibble')?.confidence).toBeLessThan(0.5);
  });

  it('detects the entity type from the mapped fields', () => {
    expect(detectEntityType(['invoiceNumber', 'customerId', 'date', 'total'])).toBe('sale_invoice');
    expect(detectEntityType(['name', 'email', 'taxId', 'creditLimit'])).toBe('customer');
    expect(detectEntityType(['sku', 'name', 'unitPrice', 'quantity'])).toBe('product');
    expect(detectEntityType(['paymentMethod', 'amount', 'date', 'referenceNumber'])).toBe('payment');
  });
});

describe('entity construction', () => {
  const invoiceMappings: ColumnMapping[] = [
    { sourceColumn: 'Invoice No', targetField: 'invoiceNumber', confidence: 0.95 },
    { sourceColumn: 'Customer', targetField: 'customerId', confidence: 0.9 },
    { sourceColumn: 'Date', targetField: 'date', confidence: 0.9 },
    { sourceColumn: 'VAT', targetField: 'tax', confidence: 0.9 },
    { sourceColumn: 'Total', targetField: 'total', confidence: 0.9 },
  ];

  it('builds typed invoices with a reconciled synthesized line item', () => {
    const rows = [{ 'Invoice No': 'INV-1', Customer: 'C-1', Date: '15/01/2024', VAT: '15', Total: 'GHS 115.00' }];
    const [entity] = buildEntities(rows, invoiceMappings) as SaleInvoice[];

    expect(entity.type).toBe('sale_invoice');
    expect(entity.invoiceNumber).toBe('INV-1');
    expect(entity.date).toBe('2024-01-15');
    expect(entity.tax).toBe(15);
    expect(entity.total).toBe(115);
    // subtotal derived from total - tax, and the line reconciles with it.
    expect(entity.subtotal).toBe(100);
    expect(entity.items).toHaveLength(1);
    expect(entity.items[0].total).toBe(100);
  });

  it('builds customers and coerces numeric fields', () => {
    const mappings: ColumnMapping[] = [
      { sourceColumn: 'Name', targetField: 'name', confidence: 0.95 },
      { sourceColumn: 'Credit Limit', targetField: 'creditLimit', confidence: 0.9 },
    ];
    const rows = [{ Name: '  Acme Ltd ', 'Credit Limit': '10,000' }];
    const [entity] = buildEntities(rows, mappings);

    expect(entity.type).toBe('customer');
    const customer = entity as unknown as { name: string; creditLimit: number };
    expect(customer.name).toBe('Acme Ltd');
    expect(customer.creditLimit).toBe(10000);
  });

  it('produces invoices that pass SJBL validation and the knowledge packs', async () => {
    const rows = [
      { 'Invoice No': 'INV-1', Customer: 'C-1', Date: '15/01/2024', VAT: '15', Total: '115' },
      { 'Invoice No': 'INV-2', Customer: 'C-2', Date: '16/01/2024', VAT: '0', Total: '50' },
    ];
    const entities = buildEntities(rows, invoiceMappings);

    // The constructed entities satisfy the runtime SJBL validator...
    expect(validateSjUtfEntities(entities)).toEqual([]);

    // ...and the knowledge packs the migration pipeline attaches by default.
    const registry = new KnowledgePackRegistry();
    registry.register(new StanJayAccountingPack());
    registry.register(new SpreadsheetImportPack());
    const result = await new KnowledgeEngineService(registry).evaluate(
      ['stan-jay-accounting', 'spreadsheet-import'],
      entities,
    );
    expect(result.approved).toBe(true);
    expect(result.errorCount).toBe(0);
  });
});
