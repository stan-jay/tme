import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  BusinessSystemPlugin,
  CapabilityContext,
  ConnectionTestResult,
  DestinationWriter,
  PluginManifest,
  WriteRequest,
  WriteResult,
} from '@tme/connector-sdk';
import type { Customer, Payment, Product, SaleInvoice, SJBLEntity } from '@tme/shared';

/**
 * Stan Jay business-system plugin.
 *
 * The plugin currently provides only the writer capability. Reader, mapper,
 * validator and knowledge-pack capabilities can evolve independently without
 * changing the pipeline engine.
 */
@Injectable()
export class StanJayConnectorService implements BusinessSystemPlugin, DestinationWriter {
  readonly manifest: PluginManifest = {
    id: 'stan-jay-erp',
    name: 'Stan Jay ERP',
    version: '0.1.0',
    category: 'erp',
    capabilities: ['write'],
    supportedEntityTypes: ['customer', 'product', 'sale_invoice', 'payment'],
    configurationSchema: [
      { key: 'apiUrl', label: 'API URL', type: 'url', required: true },
      { key: 'apiKey', label: 'API key', type: 'secret', required: true, secret: true },
      {
        key: 'timeoutMs',
        label: 'Request timeout in milliseconds',
        type: 'number',
        required: false,
      },
    ],
  };

  readonly writer: DestinationWriter = this;
  private readonly defaultApiUrl: string;
  private readonly defaultApiKey: string;
  private readonly defaultTimeoutMs: number;

  constructor(config: ConfigService) {
    this.defaultApiUrl = config.get<string>('STAN_JAY_API_URL') || 'http://localhost:3000/api';
    this.defaultApiKey = config.get<string>('STAN_JAY_API_KEY') || '';
    this.defaultTimeoutMs = Number(config.get<string>('STAN_JAY_API_TIMEOUT_MS') || 15_000);
  }

  async testConnection(context: CapabilityContext): Promise<ConnectionTestResult> {
    const settings = this.settings(context);
    if (!settings.apiKey) return { connected: false, message: 'API key is not configured' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
    try {
      const response = await fetch(`${settings.apiUrl}/health`, {
        headers: { Authorization: `Bearer ${settings.apiKey}` },
        signal: controller.signal,
      });
      return {
        connected: response.ok,
        message: response.ok ? 'Connection successful' : `Health check returned ${response.status}`,
        capabilities: this.manifest.capabilities,
      };
    } catch (error) {
      return {
        connected: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async write(request: WriteRequest, context: CapabilityContext): Promise<WriteResult> {
    const items = [];
    for (const entity of request.entities) {
      const entityKey = `${request.idempotencyKey}:${entity.id}`;
      try {
        const destinationId = await this.writeEntity(entity, entityKey, context);
        items.push({ entityId: entity.id, status: 'succeeded' as const, destinationId });
      } catch (error) {
        items.push({
          entityId: entity.id,
          status: 'failed' as const,
          errorCode: 'STAN_JAY_WRITE_FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown destination failure',
        });
      }
    }
    return { items };
  }

  private async writeEntity(
    entity: SJBLEntity,
    idempotencyKey: string,
    context: CapabilityContext,
  ): Promise<string | undefined> {
    switch (entity.type) {
      case 'customer':
        return this.post('customers', this.customerPayload(entity as Customer), idempotencyKey, context);
      case 'product':
        return this.post('products', this.productPayload(entity as Product), idempotencyKey, context);
      case 'sale_invoice':
        return this.post('invoices', this.invoicePayload(entity as SaleInvoice), idempotencyKey, context);
      case 'payment':
        return this.post('payments', this.paymentPayload(entity as Payment), idempotencyKey, context);
      default:
        throw new Error(`Stan Jay writer does not support ${entity.type}`);
    }
  }

  private async post(
    path: string,
    payload: unknown,
    idempotencyKey: string,
    context: CapabilityContext,
  ): Promise<string | undefined> {
    const settings = this.settings(context);
    if (!settings.apiKey) throw new Error('Stan Jay API key is not configured');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
    try {
      const response = await fetch(`${settings.apiUrl}/${path}`, {
        method: 'POST',
        signal: context.signal || controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Destination returned ${response.status}: ${body.slice(0, 500)}`);
      }
      const body = (await response.json().catch(() => ({}))) as { id?: string };
      return body.id;
    } finally {
      clearTimeout(timer);
    }
  }

  private settings(context: CapabilityContext) {
    return {
      apiUrl: String(context.configuration.apiUrl || this.defaultApiUrl).replace(/\/$/, ''),
      apiKey: String(context.configuration.apiKey || this.defaultApiKey),
      timeoutMs: Number(context.configuration.timeoutMs || this.defaultTimeoutMs),
    };
  }

  private customerPayload(customer: Customer) {
    return {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.billingAddress,
      taxId: customer.taxId,
    };
  }

  private productPayload(product: Product) {
    return { name: product.name, sku: product.sku, unitPrice: product.unitPrice };
  }

  private invoicePayload(invoice: SaleInvoice) {
    return {
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      date: invoice.date,
      items: invoice.items,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      total: invoice.total,
      status: invoice.status,
    };
  }

  private paymentPayload(payment: Payment) {
    return {
      referenceNumber: payment.referenceNumber,
      customerId: payment.customerId,
      supplierId: payment.supplierId,
      amount: payment.amount,
      date: payment.date,
      paymentMethod: payment.paymentMethod,
    };
  }
}
