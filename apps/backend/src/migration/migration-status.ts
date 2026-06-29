import { MigrationStatus, PipelineRunStatus } from '@prisma/client';

/**
 * Derives the migration status from the terminal pipeline run and the write
 * stage outcome. Skipped entities (idempotent re-runs) count as successful.
 */
export function deriveMigrationStatus(
  runStatus: PipelineRunStatus,
  result: { success: number; failed: number; skipped: number },
): MigrationStatus {
  const succeeded = result.success + result.skipped;
  if (succeeded > 0 && result.failed === 0) return MigrationStatus.COMPLETED;
  if (succeeded > 0 && result.failed > 0) return MigrationStatus.PARTIALLY_COMPLETED;
  if (result.failed > 0) return MigrationStatus.FAILED;
  // No writes recorded: trust the run outcome (e.g. an empty document that
  // completed, versus a run that failed in validation before writing).
  return runStatus === PipelineRunStatus.COMPLETED
    ? MigrationStatus.COMPLETED
    : MigrationStatus.FAILED;
}
