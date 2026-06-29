import type { ColumnMapping } from '@tme/shared';
import { computeSourceSignature, reconcileProfileMappings } from './mapping-profile.util';

describe('computeSourceSignature', () => {
  it('is independent of column order, case and whitespace', () => {
    expect(computeSourceSignature(['Invoice No', 'Customer', 'Total'])).toBe(
      computeSourceSignature([' total ', 'invoice no', 'CUSTOMER']),
    );
  });

  it('differs when the column set differs', () => {
    expect(computeSourceSignature(['Invoice No', 'Customer'])).not.toBe(
      computeSourceSignature(['Invoice No', 'Customer', 'Total']),
    );
  });
});

describe('reconcileProfileMappings', () => {
  const saved: ColumnMapping[] = [
    { sourceColumn: 'Invoice No', targetField: 'invoiceNumber', confidence: 0.95 },
    { sourceColumn: 'Customer', targetField: 'customerId', confidence: 0.9 },
  ];

  it('keeps mappings for present columns and reports an exact match', () => {
    const result = reconcileProfileMappings(saved, ['Invoice No', 'Customer']);
    expect(result.mappings).toHaveLength(2);
    expect(result.exact).toBe(true);
  });

  it('drops mappings for absent columns and reports drift', () => {
    const result = reconcileProfileMappings(saved, ['Invoice No', 'Grand Total']);
    expect(result.mappings.map((mapping) => mapping.sourceColumn)).toEqual(['Invoice No']);
    expect(result.missingColumns).toEqual(['Customer']);
    expect(result.newColumns).toEqual(['Grand Total']);
    expect(result.exact).toBe(false);
  });
});
