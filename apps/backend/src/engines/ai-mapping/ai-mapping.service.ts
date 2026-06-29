import { Injectable } from '@nestjs/common';
import type { ColumnMapping } from '@tme/shared';
import { detectColumnMappings } from '../language/entity-detection';

@Injectable()
export class AiMappingService {
  /**
   * Detect column meanings and suggest SJBL field mappings using the
   * deterministic semantic dictionary. AI may later refine low-confidence
   * suggestions, but the baseline is rules-based and reproducible.
   */
  async detectColumns(columns: string[]): Promise<ColumnMapping[]> {
    return detectColumnMappings(columns);
  }

  async mapColumns(columns: string[], _context: string): Promise<ColumnMapping[]> {
    return detectColumnMappings(columns);
  }
}
