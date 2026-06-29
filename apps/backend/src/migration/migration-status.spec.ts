import { MigrationStatus, PipelineRunStatus } from '@prisma/client';
import { deriveMigrationStatus } from './migration-status';

describe('deriveMigrationStatus', () => {
  it('reports COMPLETED when every entity succeeded', () => {
    expect(
      deriveMigrationStatus(PipelineRunStatus.COMPLETED, { success: 5, failed: 0, skipped: 0 }),
    ).toBe(MigrationStatus.COMPLETED);
  });

  it('counts skipped (idempotent) entities as success', () => {
    expect(
      deriveMigrationStatus(PipelineRunStatus.COMPLETED, { success: 0, failed: 0, skipped: 3 }),
    ).toBe(MigrationStatus.COMPLETED);
  });

  it('reports PARTIALLY_COMPLETED when some entities failed', () => {
    expect(
      deriveMigrationStatus(PipelineRunStatus.COMPLETED, { success: 4, failed: 1, skipped: 0 }),
    ).toBe(MigrationStatus.PARTIALLY_COMPLETED);
  });

  it('reports FAILED when only failures were recorded', () => {
    expect(
      deriveMigrationStatus(PipelineRunStatus.FAILED, { success: 0, failed: 2, skipped: 0 }),
    ).toBe(MigrationStatus.FAILED);
  });

  it('reports FAILED when the run failed before any write (e.g. validation)', () => {
    expect(
      deriveMigrationStatus(PipelineRunStatus.FAILED, { success: 0, failed: 0, skipped: 0 }),
    ).toBe(MigrationStatus.FAILED);
  });

  it('reports COMPLETED for an empty document that ran to completion', () => {
    expect(
      deriveMigrationStatus(PipelineRunStatus.COMPLETED, { success: 0, failed: 0, skipped: 0 }),
    ).toBe(MigrationStatus.COMPLETED);
  });
});
