import { Injectable } from '@nestjs/common';
import type { ValidationIssue } from '@tme/shared';

@Injectable()
export class ValidationService {
  /**
   * Validate data quality before migration.
   */
  async validate(data: any[], schema: any): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const seenHashes = new Map<string, number>();

    data.forEach((row, index) => {
      const rowNumber = index + 1;
      const rowKeys = Object.keys(row);
      const rowHash = rowKeys
        .sort()
        .map((key) => `${key}:${String(row[key])}`)
        .join('|');

      seenHashes.set(rowHash, (seenHashes.get(rowHash) || 0) + 1);

      rowKeys.forEach((key) => {
        const value = row[key];
        const lowerKey = key.toLowerCase();

        if (value === null || value === undefined || value === '') {
          issues.push({
            type: 'warning',
            row: rowNumber,
            column: key,
            message: 'Missing value',
          });
          return;
        }

        if (lowerKey.includes('date')) {
          const parsed = new Date(value);
          if (Number.isNaN(parsed.getTime())) {
            issues.push({
              type: 'error',
              row: rowNumber,
              column: key,
              message: 'Invalid date value',
              value,
            });
          }
        }

        if (/(qty|quantity|amount|total|price|cost|balance)/.test(lowerKey)) {
          const numberValue = Number(value);
          if (!Number.isNaN(numberValue) && numberValue < 0) {
            issues.push({
              type: 'error',
              row: rowNumber,
              column: key,
              message: 'Negative numeric value detected',
              value,
            });
          }
        }
      });
    });

    for (const [hash, count] of seenHashes) {
      if (count > 1) {
        issues.push({
          type: 'warning',
          message: `Duplicate row detected ${count} time(s)`,
        });
      }
    }

    return issues;
  }

  calculateHealthScore(issues: ValidationIssue[], rowCount = 1): number {
    const denominator = Math.max(1, rowCount);
    const penalty = issues.reduce((total, issue) => total + (issue.type === 'error' ? 10 : 3), 0);
    return Math.max(0, Math.round(100 - penalty / denominator));
  }
}
