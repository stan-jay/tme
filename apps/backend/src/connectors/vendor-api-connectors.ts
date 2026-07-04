import { Injectable } from '@nestjs/common';
import type {
  BusinessSystemPlugin,
  CapabilityContext,
  ConfigurationField,
  ConnectionTestResult,
  DestinationWriter,
  DiscoveryResult,
  PluginCategory,
  PluginManifest,
  ReadPage,
  ReadRequest,
  SourceReader,
  WriteRequest,
  WriteResult,
} from '@tme/connector-sdk';
import type { SJBLEntity, SJBLEntityType } from '@tme/shared';

type VendorConnectorDefinition = {
  id: string;
  name: string;
  category: PluginCategory;
  documentationUrl: string;
  capabilities: PluginManifest['capabilities'];
  supportedEntityTypes: SJBLEntityType[];
  configurationSchema: ConfigurationField[];
  resources: DiscoveryResult['resources'];
  sampleRecords: SJBLEntity[];
};

abstract class VendorApiConnector implements BusinessSystemPlugin, SourceReader, DestinationWriter {
  readonly reader: SourceReader = this;
  readonly writer: DestinationWriter = this;
  readonly manifest: PluginManifest;

  protected constructor(private readonly definition: VendorConnectorDefinition) {
    this.manifest = {
      id: definition.id,
      name: definition.name,
      version: '0.1.0',
      category: definition.category,
      capabilities: definition.capabilities,
      supportedEntityTypes: definition.supportedEntityTypes,
      configurationSchema: definition.configurationSchema,
      documentationUrl: definition.documentationUrl,
    };
  }

  async testConnection(context: CapabilityContext): Promise<ConnectionTestResult> {
    const missing = this.definition.configurationSchema
      .filter((field) => field.required)
      .filter((field) => !present(context.configuration[field.key]))
      .map((field) => field.label);
    if (missing.length) {
      return {
        connected: false,
        message: `Missing required configuration: ${missing.join(', ')}`,
        capabilities: this.manifest.capabilities,
      };
    }
    return {
      connected: true,
      message: `${this.manifest.name} credentials are configured. Pull preview is available for supported records.`,
      capabilities: this.manifest.capabilities,
      metadata: {
        resources: this.definition.resources.length,
        supportedEntityTypes: this.manifest.supportedEntityTypes,
      },
    };
  }

  async discover(): Promise<DiscoveryResult> {
    return { resources: this.definition.resources };
  }

  async *read(request: ReadRequest): AsyncIterable<ReadPage<SJBLEntity>> {
    const pageSize = Math.max(1, Math.min(500, request.pageSize || 100));
    const cursor = Number(request.cursor || 0);
    const resource = request.resourceId;
    const allowedTypes = new Set(request.entityTypes || []);
    const records = this.definition.sampleRecords.filter((entity) => {
      const resourceMatches = !resource || entity.metadata?.resourceId === resource;
      const typeMatches = !allowedTypes.size || allowedTypes.has(entity.type);
      return resourceMatches && typeMatches;
    });
    const page = records.slice(cursor, cursor + pageSize);
    const next = cursor + page.length;
    yield {
      records: page,
      nextCursor: next < records.length ? String(next) : undefined,
      checkpoint: `${this.manifest.id}:offset:${next}`,
      complete: next >= records.length,
    };
  }

  async write(request: WriteRequest): Promise<WriteResult> {
    return {
      items: request.entities.map((entity) => ({
        entityId: entity.id,
        status: 'skipped' as const,
        destinationId: `${this.manifest.id}:${entity.id}`,
      })),
      checkpoint: `${this.manifest.id}:write-preview:${request.partitionId}`,
    };
  }
}

@Injectable()
export class WooCommerceConnectorService extends VendorApiConnector {
  constructor() {
    super({
      id: 'woocommerce',
      name: 'WooCommerce',
      category: 'ecommerce',
      documentationUrl: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
      capabilities: ['discover', 'read', 'write'],
      supportedEntityTypes: ['customer', 'product', 'sale_invoice', 'payment'],
      configurationSchema: [
        { key: 'storeUrl', label: 'Store URL', type: 'url', required: true },
        { key: 'consumerKey', label: 'Consumer key', type: 'secret', required: true, secret: true },
        { key: 'consumerSecret', label: 'Consumer secret', type: 'secret', required: true, secret: true },
        {
          key: 'mode',
          label: 'Mode',
          type: 'select',
          required: true,
          options: [
            { label: 'Sandbox / staging', value: 'sandbox' },
            { label: 'Live store', value: 'live' },
          ],
        },
      ],
      resources: [
        { id: 'customers', name: 'Customers', entityTypes: ['customer'], estimatedCount: 1 },
        { id: 'products', name: 'Products', entityTypes: ['product'], estimatedCount: 1 },
        { id: 'orders', name: 'Orders', entityTypes: ['sale_invoice', 'payment'], estimatedCount: 2 },
      ],
      sampleRecords: [
        vendorEntity('wc-customer-1', 'customer', 'customers', {
          name: 'Woo Customer Ltd',
          email: 'buyer@woocommerce.example',
        }),
        vendorEntity('wc-product-1', 'product', 'products', {
          name: 'WooCommerce Product',
          sku: 'WC-PROD-001',
          unitPrice: 120,
        }),
        vendorEntity('wc-order-1001', 'sale_invoice', 'orders', {
          invoiceNumber: 'WC-1001',
          customerId: 'wc-customer-1',
          date: '2026-07-04',
          items: [{ productId: 'wc-product-1', quantity: 1, unitPrice: 120, total: 120 }],
          subtotal: 120,
          tax: 18,
          total: 138,
          currency: 'GHS',
          status: 'issued',
        }),
        vendorEntity('wc-payment-1001', 'payment', 'orders', {
          referenceNumber: 'WC-PAY-1001',
          customerId: 'wc-customer-1',
          amount: 138,
          date: '2026-07-04',
          currency: 'GHS',
          paymentMethod: 'card',
        }),
      ],
    });
  }
}

@Injectable()
export class OdooConnectorService extends VendorApiConnector {
  constructor() {
    super({
      id: 'odoo',
      name: 'Odoo',
      category: 'erp',
      documentationUrl: 'https://www.odoo.com/documentation/18.0/developer/reference/external_api.html',
      capabilities: ['discover', 'read', 'write'],
      supportedEntityTypes: ['customer', 'supplier', 'product', 'sale_invoice', 'purchase_order', 'payment'],
      configurationSchema: [
        { key: 'baseUrl', label: 'Odoo URL', type: 'url', required: true },
        { key: 'database', label: 'Database name', type: 'text', required: true },
        { key: 'username', label: 'Username', type: 'text', required: true },
        { key: 'apiKey', label: 'API key or password', type: 'secret', required: true, secret: true },
      ],
      resources: [
        { id: 'res.partner', name: 'Contacts / partners', entityTypes: ['customer', 'supplier'], estimatedCount: 2 },
        { id: 'product.product', name: 'Products', entityTypes: ['product'], estimatedCount: 1 },
        { id: 'account.move', name: 'Invoices', entityTypes: ['sale_invoice', 'payment'], estimatedCount: 2 },
        { id: 'purchase.order', name: 'Purchase orders', entityTypes: ['purchase_order'], estimatedCount: 1 },
      ],
      sampleRecords: [
        vendorEntity('odoo-partner-1', 'customer', 'res.partner', { name: 'Odoo Customer Ltd' }),
        vendorEntity('odoo-supplier-1', 'supplier', 'res.partner', { name: 'Odoo Supplier Ltd' }),
        vendorEntity('odoo-product-1', 'product', 'product.product', {
          name: 'Odoo Service Item',
          sku: 'ODOO-SVC-001',
          unitPrice: 450,
        }),
        vendorEntity('odoo-invoice-1', 'sale_invoice', 'account.move', {
          invoiceNumber: 'ODOO-INV-1',
          customerId: 'odoo-partner-1',
          date: '2026-07-04',
          items: [{ productId: 'odoo-product-1', quantity: 1, unitPrice: 450, total: 450 }],
          subtotal: 450,
          tax: 67.5,
          total: 517.5,
          currency: 'GHS',
          status: 'issued',
        }),
      ],
    });
  }
}

@Injectable()
export class QuickBooksConnectorService extends VendorApiConnector {
  constructor() {
    super({
      id: 'quickbooks-online',
      name: 'QuickBooks Online',
      category: 'accounting',
      documentationUrl: 'https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account',
      capabilities: ['discover', 'read', 'write'],
      supportedEntityTypes: ['customer', 'supplier', 'product', 'sale_invoice', 'payment', 'account', 'tax_rate'],
      configurationSchema: [
        {
          key: 'environment',
          label: 'Environment',
          type: 'select',
          required: true,
          options: [
            { label: 'Sandbox', value: 'sandbox' },
            { label: 'Production', value: 'production' },
          ],
        },
        { key: 'realmId', label: 'Company / realm ID', type: 'text', required: true },
        {
          key: 'accessToken',
          label: 'OAuth access token',
          type: 'secret',
          required: true,
          secret: true,
          description: 'Temporary first-phase field. Production should use a full OAuth connect flow.',
        },
      ],
      resources: [
        { id: 'Customer', name: 'Customers', entityTypes: ['customer'], estimatedCount: 1 },
        { id: 'Vendor', name: 'Vendors', entityTypes: ['supplier'], estimatedCount: 1 },
        { id: 'Item', name: 'Items', entityTypes: ['product'], estimatedCount: 1 },
        { id: 'Invoice', name: 'Invoices', entityTypes: ['sale_invoice', 'payment'], estimatedCount: 2 },
        { id: 'Account', name: 'Chart of accounts', entityTypes: ['account'], estimatedCount: 1 },
      ],
      sampleRecords: [
        vendorEntity('qbo-customer-1', 'customer', 'Customer', { name: 'QuickBooks Customer Ltd' }),
        vendorEntity('qbo-item-1', 'product', 'Item', {
          name: 'QBO Consulting',
          sku: 'QBO-SVC',
          unitPrice: 800,
        }),
        vendorEntity('qbo-invoice-1', 'sale_invoice', 'Invoice', {
          invoiceNumber: 'QBO-1001',
          customerId: 'qbo-customer-1',
          date: '2026-07-04',
          items: [{ productId: 'qbo-item-1', quantity: 1, unitPrice: 800, total: 800 }],
          subtotal: 800,
          tax: 120,
          total: 920,
          currency: 'GHS',
          status: 'issued',
        }),
      ],
    });
  }
}

function vendorEntity(id: string, type: SJBLEntityType, resourceId: string, values: Record<string, unknown>) {
  return {
    id,
    type,
    externalId: id,
    externalSource: resourceId,
    metadata: { resourceId },
    ...values,
  } as SJBLEntity;
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '';
}
