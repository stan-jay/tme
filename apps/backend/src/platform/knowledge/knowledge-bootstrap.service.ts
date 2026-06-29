import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgePackRegistry } from './knowledge-pack.registry';
import { GhanaVatPack } from './packs/ghana-vat.pack';
import { SpreadsheetImportPack } from './packs/spreadsheet-import.pack';
import { StanJayAccountingPack } from './packs/stan-jay-accounting.pack';

/**
 * Registers the built-in knowledge packs. Like the plugin composition root,
 * this is the single place that knows the concrete packs; the registry and
 * engine stay pack-neutral.
 */
@Injectable()
export class KnowledgeBootstrapService implements OnModuleInit {
  constructor(
    private readonly registry: KnowledgePackRegistry,
    private readonly ghanaVat: GhanaVatPack,
    private readonly stanJay: StanJayAccountingPack,
    private readonly spreadsheet: SpreadsheetImportPack,
  ) {}

  onModuleInit(): void {
    for (const pack of [this.ghanaVat, this.stanJay, this.spreadsheet]) {
      this.registry.register(pack);
    }
  }
}
