import type { SJBLEntity } from '@tme/shared';
import { KnowledgePackRegistry } from './knowledge-pack.registry';
import { KnowledgeEngineService } from './knowledge-engine.service';
import { GhanaVatPack } from './packs/ghana-vat.pack';
import { SpreadsheetImportPack } from './packs/spreadsheet-import.pack';
import { StanJayAccountingPack } from './packs/stan-jay-accounting.pack';

function buildEngine(): KnowledgeEngineService {
  const registry = new KnowledgePackRegistry();
  registry.register(new GhanaVatPack());
  registry.register(new StanJayAccountingPack());
  registry.register(new SpreadsheetImportPack());
  return new KnowledgeEngineService(registry);
}

const ALL_PACKS = ['ghana-vat', 'stan-jay-accounting', 'spreadsheet-import'];

const validInvoice = {
  id: 'inv-1',
  type: 'sale_invoice',
  invoiceNumber: 'INV-1',
  customerId: 'cust-1',
  date: '2024-01-15',
  items: [{ productId: 'p1', quantity: 1, unitPrice: 100, total: 100 }],
  subtotal: 100,
  tax: 15,
  total: 115,
  currency: 'GHS',
  status: 'issued',
} as unknown as SJBLEntity;

const validCustomer = { id: 'cust-1', type: 'customer', name: 'Acme Ltd' } as unknown as SJBLEntity;
const validPayment = {
  id: 'pay-1',
  type: 'payment',
  amount: 50,
  date: '2024-01-16',
  customerId: 'cust-1',
  paymentMethod: 'cash',
} as unknown as SJBLEntity;

describe('KnowledgeEngineService', () => {
  it('approves a well-formed document with no errors', async () => {
    const result = await buildEngine().evaluate(ALL_PACKS, [validInvoice, validCustomer, validPayment]);
    expect(result.approved).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it('rejects an invoice whose line totals do not reconcile with the subtotal', async () => {
    const invoice = { ...(validInvoice as object), subtotal: 90 } as unknown as SJBLEntity;
    const result = await buildEngine().evaluate(['stan-jay-accounting'], [invoice]);
    expect(result.approved).toBe(false);
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.message.includes('sj-invoice-line-total'))).toBe(true);
  });

  it('rejects a payment that references neither a customer nor a supplier', async () => {
    const payment = {
      id: 'pay-2',
      type: 'payment',
      amount: 50,
      date: '2024-01-16',
      paymentMethod: 'cash',
    } as unknown as SJBLEntity;
    const result = await buildEngine().evaluate(['stan-jay-accounting'], [payment]);
    expect(result.approved).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes('sj-payment-party'))).toBe(true);
  });

  it('blocks a negative Ghana VAT amount', async () => {
    const invoice = {
      id: 'inv-neg',
      type: 'sale_invoice',
      invoiceNumber: 'INV-2',
      customerId: 'cust-1',
      date: '2024-01-15',
      items: [{ productId: 'p1', quantity: 1, unitPrice: 100, total: 100 }],
      subtotal: 100,
      tax: -5,
      total: 95,
    } as unknown as SJBLEntity;
    const result = await buildEngine().evaluate(['ghana-vat'], [invoice]);
    expect(result.approved).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes('gh-vat-non-negative-tax'))).toBe(true);
  });

  it('warns but does not block an implausible VAT rate', async () => {
    const invoice = {
      id: 'inv-rate',
      type: 'sale_invoice',
      invoiceNumber: 'INV-3',
      customerId: 'cust-1',
      date: '2024-01-15',
      subtotal: 100,
      tax: 50,
      total: 150,
    } as unknown as SJBLEntity;
    const result = await buildEngine().evaluate(['ghana-vat'], [invoice]);
    expect(result.approved).toBe(true);
    expect(result.warningCount).toBeGreaterThan(0);
  });

  it('flags duplicate source identifiers from a spreadsheet as warnings', async () => {
    const a = { id: 'a', type: 'customer', name: 'A', externalId: 'X' } as unknown as SJBLEntity;
    const b = { id: 'b', type: 'customer', name: 'B', externalId: 'X' } as unknown as SJBLEntity;
    const result = await buildEngine().evaluate(['spreadsheet-import'], [a, b]);
    expect(result.approved).toBe(true);
    expect(result.warningCount).toBe(2);
  });

  it('records unknown pack ids without failing the evaluation', async () => {
    const result = await buildEngine().evaluate(['does-not-exist'], [validCustomer]);
    expect(result.approved).toBe(true);
    expect(result.unknownPackIds).toContain('does-not-exist');
  });
});
