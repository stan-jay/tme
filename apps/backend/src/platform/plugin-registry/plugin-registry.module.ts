import { Global, Module } from '@nestjs/common';
import { MockApiSourceConnectorService } from '../../connectors/mock-api-source.connector';
import { StanJayConnectorService } from '../../connectors/stan-jay.connector';
import {
  OdooConnectorService,
  QuickBooksConnectorService,
  WooCommerceConnectorService,
} from '../../connectors/vendor-api-connectors';
import { PluginBootstrapService } from './plugin-bootstrap.service';
import { PluginRegistryController } from './plugin-registry.controller';
import { PluginRegistryService } from './plugin-registry.service';
import { AuthModule } from '../../auth/auth.module';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [PluginRegistryController],
  providers: [
    PluginRegistryService,
    PluginBootstrapService,
    MockApiSourceConnectorService,
    StanJayConnectorService,
    WooCommerceConnectorService,
    OdooConnectorService,
    QuickBooksConnectorService,
  ],
  exports: [PluginRegistryService],
})
export class PluginRegistryModule {}
