import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationController } from './integration.controller';
import { IntegrationCryptoService } from './integration-crypto.service';
import { IntegrationService } from './integration.service';
import { AuthModule } from '../../auth/auth.module';
import { PluginRegistryModule } from '../plugin-registry/plugin-registry.module';

@Global()
@Module({
  imports: [AuthModule, PluginRegistryModule],
  controllers: [IntegrationController],
  providers: [IntegrationService, IntegrationCryptoService, PrismaService],
  exports: [IntegrationService, IntegrationCryptoService],
})
export class IntegrationModule {}
