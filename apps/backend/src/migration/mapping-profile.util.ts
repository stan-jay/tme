import { createHash } from 'crypto';
import type { ColumnMapping } from '@tme/shared';

/**
 * Computes a stable fingerprint for a set of source columns. The signature is
 * order-independent and case/whitespace-insensitive, so the same spreadsheet
 * layout always produces the same signature for profile lookup.
 */
export function computeSourceSignature(columns: string[]): string {
  const normalized = columns
    .map((column) => column.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter((column) => column !== '')
    .sort();
  return createHash('sha256').update(normalized.join('')).digest('hex');
}

export interface ReconciledProfile {
  mappings: ColumnMapping[];
  missingColumns: string[];
  newColumns: string[];
  exact: boolean;
}

/**
 * Reconciles a saved profile's mappings against the columns actually present in
 * the current file. Mappings for absent columns are dropped; columns with no
 * saved mapping are reported so the caller can detect them. Defensive even when
 * the signature matched, so a profile never assigns a column that is gone.
 */
export function reconcileProfileMappings(
  savedMappings: ColumnMapping[],
  currentColumns: string[],
): ReconciledProfile {
  const currentSet = new Set(currentColumns);
  const savedSet = new Set(savedMappings.map((mapping) => mapping.sourceColumn));

  const mappings = savedMappings.filter((mapping) => currentSet.has(mapping.sourceColumn));
  const missingColumns = savedMappings
    .map((mapping) => mapping.sourceColumn)
    .filter((column) => !currentSet.has(column));
  const newColumns = currentColumns.filter((column) => !savedSet.has(column));

  return { mappings, missingColumns, newColumns, exact: missingColumns.length === 0 && newColumns.length === 0 };
}
