import { Injectable } from '@nestjs/common';
import type { ColumnMapping, SJBLEntity } from '@tme/shared';
import { buildEntities } from '../language/entity-detection';

@Injectable()
export class TransformationService {
  /**
   * Normalize source records into typed SJBL entities. The entity type is
   * detected from the confirmed mappings (no longer forced to sale_invoice),
   * values are coerced to their SJBL field types, and document entities receive
   * a reconciled line item so posting and tax rules can evaluate them.
   */
  async transformToUtf(
    sourceData: Array<Record<string, unknown>>,
    mappings: ColumnMapping[],
  ): Promise<SJBLEntity[]> {
    return buildEntities(sourceData, mappings ?? []);
  }

  async transformFromSjbl(sjblData: SJBLEntity[], targetPluginId: string): Promise<any[]> {
    return sjblData.map((entity) => ({ ...entity, targetPluginId }));
  }
}
