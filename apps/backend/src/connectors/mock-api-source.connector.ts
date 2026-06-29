import { Injectable } from '@nestjs/common';
import type {
  BusinessSystemPlugin,
  CapabilityContext,
  ConnectionTestResult,
  DiscoveryResult,
  PluginManifest,
  ReadPage,
  ReadRequest,
  SourceReader,
} from '@tme/connector-sdk';
import type { SJBLEntity } from '@tme/shared';

/**
 * Mock business API source.
 *
 * This is the first true API-style reader path. It intentionally emits SJBL
 * entities already, so the platform can prove source-API -> SJBL -> destination
 * writer without waiting for Zoho/WooCommerce/QuickBooks credentials. Real API
 * readers will follow the same SourceReader contract but translate vendor
 * records into SJBL in their mapper/normalize capability.
 */
@Injectable()
export class MockApiSourceConnectorService implements BusinessSystemPlugin, SourceReader {
  readonly manifest: PluginManifest = {
    id: 'mock-business-api',
    name: 'Mock Business API Source',
    version: '0.1.0',
    category: 'custom',
    capabilities: ['read'],
    supportedEntityTypes: ['customer', 'product', 'sale_invoice', 'payment'],
    configurationSchema: [
      {
        key: 'dataset',
        label: 'Dataset',
        type: 'select',
        required: true,
        options: [
          { label: 'Commerce demo orders', value: 'commerce-demo' },
          { label: 'Accounting demo invoices', value: 'accounting-demo' },
        ],
        description: 'Demo API dataset emitted as SJBL entities.',
      },
      {
        key: 'apiUrl',
        label: 'API URL',
        type: 'url',
        required: false,
        description: 'Optional placeholder URL to mirror real API source configuration.',
      },
      {
        key: 'apiKey',
        label: 'API key',
        type: 'secret',
        required: false,
        secret: true,
        description: 'Optional placeholder secret to mirror real API source configuration.',
      },
    ],
  };

  readonly reader: SourceReader = this;

  async testConnection(context: CapabilityContext): Promise<ConnectionTestResult> {
    const dataset = this.datasetName(context);
    return {
      connected: Boolean(DATASETS[dataset]),
      message: DATASETS[dataset]
        ? `Mock API dataset ${dataset} is available`
        : `Unknown mock API dataset ${dataset}`,
      capabilities: this.manifest.capabilities,
      metadata: { dataset, entityCount: DATASETS[dataset]?.length ?? 0 },
    };
  }

  async discover(context: CapabilityContext): Promise<DiscoveryResult> {
    const dataset = this.datasetName(context);
    const entities = DATASETS[dataset] ?? [];
    return {
      resources: [
        {
          id: dataset,
          name: `${dataset} resource`,
          entityTypes: [...new Set(entities.map((entity) => entity.type))],
          estimatedCount: entities.length,
        },
      ],
    };
  }

  async *read(request: ReadRequest, context: CapabilityContext): AsyncIterable<ReadPage<SJBLEntity>> {
    const dataset = request.resourceId || this.datasetName(context);
    const pageSize = Math.max(1, Math.min(500, request.pageSize || 100));
    const cursor = Number(request.cursor || 0);
    const allowedTypes = new Set(request.entityTypes || []);
    const all = (DATASETS[dataset] ?? []).filter((entity) => !allowedTypes.size || allowedTypes.has(entity.type));
    const records = all.slice(cursor, cursor + pageSize);
    const next = cursor + records.length;
    yield {
      records,
      nextCursor: next < all.length ? String(next) : undefined,
      checkpoint: `offset:${next}`,
      complete: next >= all.length,
    };
  }

  private datasetName(context: CapabilityContext): string {
    return String(context.configuration.dataset || 'commerce-demo');
  }
}

const DATASETS: Record<string, SJBLEntity[]> = {
  'commerce-demo': [
    { id: 'customer-1', type: 'customer', name: 'Akosua Retail Ltd', email: 'ops@akosuaretail.example' },
    { id: 'product-1', type: 'product', name: 'Premium Widget', sku: 'PW-001', unitPrice: 100 },
    {
      id: 'invoice-1',
      type: 'sale_invoice',
      invoiceNumber: 'WC-1001',
      customerId: 'customer-1',
      date: '2026-06-27',
      items: [{ productId: 'product-1', quantity: 2, unitPrice: 100, total: 200 }],
      subtotal: 200,
      tax: 30,
      total: 230,
      currency: 'GHS',
      status: 'issued',
    },
    {
      id: 'payment-1',
      type: 'payment',
      referenceNumber: 'PAY-WC-1001',
      customerId: 'customer-1',
      amount: 230,
      date: '2026-06-27',
      paymentMethod: 'card',
    },
  ] as unknown as SJBLEntity[],
  'accounting-demo': [
    { id: 'customer-2', type: 'customer', name: 'North Ridge Services' },
    {
      id: 'invoice-2',
      type: 'sale_invoice',
      invoiceNumber: 'ZB-2001',
      customerId: 'customer-2',
      date: '2026-06-27',
      items: [{ productId: 'service-1', quantity: 1, unitPrice: 500, total: 500 }],
      subtotal: 500,
      tax: 75,
      total: 575,
      currency: 'GHS',
      status: 'issued',
    },
  ] as unknown as SJBLEntity[],
};
