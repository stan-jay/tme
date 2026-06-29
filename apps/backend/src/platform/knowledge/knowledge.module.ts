import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { KnowledgePackRegistry } from './knowledge-pack.registry';
import { KnowledgeEngineService } from './knowledge-engine.service';
import { KnowledgeBootstrapService } from './knowledge-bootstrap.service';
import { KnowledgeController } from './knowledge.controller';
import { GhanaVatPack } from './packs/ghana-vat.pack';
import { SpreadsheetImportPack } from './packs/spreadsheet-import.pack';
import { StanJayAccountingPack } from './packs/stan-jay-accounting.pack';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [KnowledgeController],
  providers: [
    KnowledgePackRegistry,
    KnowledgeEngineService,
    KnowledgeBootstrapService,
    GhanaVatPack,
    StanJayAccountingPack,
    SpreadsheetImportPack,
  ],
  exports: [KnowledgePackRegistry, KnowledgeEngineService],
})
export class KnowledgeModule {}
