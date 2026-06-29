import { Injectable } from '@nestjs/common';
import type { MigrationPreview } from '@tme/shared';
import type { ValidationIssue as StoredValidationIssue } from '@prisma/client';

@Injectable()
export class SimulationService {
  /**
   * Simulate migration outcome before execution.
   * Shows what would happen without actually importing.
   */
  async simulateMigration(
    data: any[],
    mappings: any,
    validationIssues: StoredValidationIssue[] = [],
  ): Promise<MigrationPreview> {
    const errorRows = new Set(
      validationIssues
        .filter((issue) => issue.type === 'error' && issue.rowNumber)
        .map((issue) => issue.rowNumber),
    );
    const mappedRows = Math.max(0, data.length - errorRows.size);
    const issuePenalty = data.length ? validationIssues.length / data.length : 1;
    return {
      sourceRows: data.length,
      mappedRows,
      issues: validationIssues.map((issue) => ({
        type: issue.type === 'error' ? 'error' : 'warning',
        row: issue.rowNumber || undefined,
        column: issue.column || undefined,
        message: issue.message,
        value: issue.value,
      })),
      healthScore: Math.max(0, Math.round(100 - issuePenalty * 100)),
      mappings,
      estimatedSuccess: data.length ? mappedRows / data.length : 0,
    };
  }

  calculateRiskScore(preview: MigrationPreview): number {
    // Calculate risk (0-100) based on issues and validation
    return Math.max(0, 100 - preview.healthScore);
  }
}
