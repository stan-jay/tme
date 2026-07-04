import { Injectable, OnModuleInit } from '@nestjs/common';
import { MockApiSourceConnectorService } from '../../connectors/mock-api-source.connector';
import { StanJayConnectorService } from '../../connectors/stan-jay.connector';
import {
  OdooConnectorService,
  QuickBooksConnectorService,
  WooCommerceConnectorService,
} from '../../connectors/vendor-api-connectors';
import { PluginRegistryService } from './plugin-registry.service';

/**
 * Composition root for built-in plugins.
 *
 * Vendor imports are intentionally confined here; pipeline and registry
 * services remain vendor-neutral.
 */
@Injectable()
export class PluginBootstrapService implements OnModuleInit {
  constructor(
    private readonly registry: PluginRegistryService,
    private readonly mockApiSource: MockApiSourceConnectorService,
    private readonly stanJay: StanJayConnectorService,
    private readonly wooCommerce: WooCommerceConnectorService,
    private readonly odoo: OdooConnectorService,
    private readonly quickBooks: QuickBooksConnectorService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.mockApiSource);
    this.registry.register(this.stanJay);
    this.registry.register(this.wooCommerce);
    this.registry.register(this.odoo);
    this.registry.register(this.quickBooks);
  }
}
