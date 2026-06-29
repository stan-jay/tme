import type { SJUTFEntity } from '@tme/shared';
import { RelationshipService } from './relationship.service';

const customer = { id: 'customer-1', type: 'customer', name: 'Acme', accountNumber: 'C-1' } as unknown as SJUTFEntity;
const product = { id: 'product-1', type: 'product', name: 'Widget', sku: 'SKU1' } as unknown as SJUTFEntity;
const invoice = {
  id: 'inv-1',
  type: 'sale_invoice',
  invoiceNumber: 'INV-1',
  customerId: 'C-1',
  items: [{ productId: 'SKU1', total: 100 }],
} as unknown as SJUTFEntity;

describe('RelationshipService', () => {
  const service = new RelationshipService();

  it('resolves references by business key into typed edges', () => {
    const analysis = service.analyze([customer, product, invoice]);
    expect(analysis.edgeCount).toBe(2);
    expect(analysis.edgesByType['sale_invoice_customer']).toBe(1);
    expect(analysis.edgesByType['sale_invoice_product']).toBe(1);
    expect(analysis.unresolved).toHaveLength(0);
  });

  it('flags a dangling reference when the target type is present but the instance is missing', () => {
    const orphan = { ...(invoice as object), id: 'inv-2', customerId: 'C-99' } as unknown as SJUTFEntity;
    const analysis = service.analyze([customer, product, orphan]);
    expect(analysis.unresolved).toHaveLength(1);
    expect(analysis.unresolved[0]).toMatchObject({ targetType: 'customer', value: 'c-99' });
  });

  it('treats references to absent types as external, not errors', () => {
    const analysis = service.analyze([invoice]);
    expect(analysis.unresolved).toHaveLength(0);
    expect(analysis.externalReferenceCount).toBe(2);
    expect(analysis.edgeCount).toBe(0);
  });

  it('reports dangling references as validation messages', async () => {
    const orphan = { ...(invoice as object), id: 'inv-3', customerId: 'C-99' } as unknown as SJUTFEntity;
    const graph = await service.buildGraph([customer, orphan]);
    const issues = await service.validateRelationships(graph);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('not present');
  });
});
