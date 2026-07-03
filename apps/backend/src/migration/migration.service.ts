import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MigrationStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type { SJBLEntity } from '@tme/shared';

@Injectable()
export class MigrationService {
  constructor(private readonly prisma: PrismaService) {}

  health() {
    return { status: 'ok' as const, service: 'migration' };
  }

  async createMigration(input: {
    uploadId: string;
    name: string;
    sourceType: string;
    user: AuthUser;
    totalRows: number;
  }) {
    return this.prisma.migration.create({
      data: {
        uploadId: input.uploadId,
        name: input.name,
        sourceType: input.sourceType,
        userId: input.user.id,
        organizationId: input.user.organizationId,
        totalRows: input.totalRows,
        status: MigrationStatus.ANALYZED,
      },
    });
  }

  async createSjblDraftMigration(input: {
    uploadId: string;
    name: string;
    user: AuthUser;
    entities: SJBLEntity[];
    evidence?: unknown;
  }) {
    return this.prisma.migration.create({
      data: {
        uploadId: input.uploadId,
        name: input.name,
        sourceType: 'sjbl-draft',
        sourcePayload: this.json({
          entities: input.entities,
          evidence: input.evidence ?? null,
          acceptedAt: new Date().toISOString(),
        }),
        userId: input.user.id,
        organizationId: input.user.organizationId,
        totalRows: input.entities.length,
        status: MigrationStatus.MAPPED,
        mappingsApproved: true,
      },
    });
  }

  async getOwned(id: string, organizationId: string) {
    const migration = await this.prisma.migration.findFirst({
      where: { id, organizationId },
      include: {
        upload: true,
        columnMappings: { orderBy: { sourceColumn: 'asc' } },
        validationIssues: { orderBy: { createdAt: 'asc' } },
        executionRecords: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!migration) throw new NotFoundException('Migration not found');
    return migration;
  }

  async listMigrations(organizationId: string) {
    return this.prisma.migration.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        columnMappings: true,
        validationIssues: true,
      },
    });
  }

  async listWorklist(organizationId: string, role: UserRole) {
    const statuses =
      role === UserRole.ADMIN
        ? [MigrationStatus.ANALYZED, MigrationStatus.MAPPED, MigrationStatus.VALIDATED, MigrationStatus.SIMULATED]
        : role === UserRole.REVIEWER
          ? [MigrationStatus.ANALYZED, MigrationStatus.MAPPED, MigrationStatus.VALIDATED]
          : role === UserRole.EXECUTOR
            ? [MigrationStatus.SIMULATED]
            : [];
    if (!statuses.length) return [];
    const migrations = await this.prisma.migration.findMany({
      where: { organizationId, status: { in: statuses } },
      orderBy: { createdAt: 'asc' },
      include: {
        upload: { select: { originalName: true, extension: true, sizeBytes: true } },
        columnMappings: { orderBy: { sourceColumn: 'asc' } },
        validationIssues: { orderBy: { createdAt: 'asc' }, take: 25 },
      },
    });
    return migrations.map((migration) => ({
      ...migration,
      gate: this.gateFor(migration.status),
      nextAction: this.nextActionFor(migration.status),
    }));
  }

  async replaceMappings(
    migrationId: string,
    organizationId: string,
    mappings: Array<{ sourceColumn: string; targetField: string; confidence: number }>,
    confirmed: boolean,
  ) {
    await this.getOwned(migrationId, organizationId);
    await this.prisma.$transaction([
      this.prisma.columnMapping.deleteMany({ where: { migrationId } }),
      this.prisma.columnMapping.createMany({
        data: mappings.map((mapping) => ({
          migrationId,
          sourceColumn: mapping.sourceColumn,
          targetField: mapping.targetField,
          confidence: mapping.confidence,
          userConfirmed: confirmed,
        })),
      }),
      this.prisma.migration.update({
        where: { id: migrationId },
        data: confirmed
          ? {
              mappingsApproved: true,
              status: MigrationStatus.MAPPED,
              version: { increment: 1 },
            }
          : { mappingsApproved: false },
      }),
    ]);
  }

  async replaceValidationIssues(
    migrationId: string,
    issues: Array<{
      type: string;
      code?: string;
      rowNumber?: number;
      column?: string;
      message: string;
      value?: string;
    }>,
    passed: boolean,
  ) {
    await this.prisma.$transaction([
      this.prisma.validationIssue.deleteMany({ where: { migrationId } }),
      ...(issues.length
        ? [
            this.prisma.validationIssue.createMany({
              data: issues.map((issue) => ({ migrationId, ...issue })),
            }),
          ]
        : []),
      this.prisma.migration.update({
        where: { id: migrationId },
        data: {
          validationPassed: passed,
          status: MigrationStatus.VALIDATED,
          version: { increment: 1 },
        },
      }),
    ]);
  }

  async transition(
    id: string,
    organizationId: string,
    expected: MigrationStatus[],
    next: MigrationStatus,
    extra: Prisma.MigrationUpdateManyMutationInput = {},
  ) {
    const result = await this.prisma.migration.updateMany({
      where: { id, organizationId, status: { in: expected } },
      data: { ...extra, status: next, version: { increment: 1 } },
    });
    if (result.count !== 1) {
      const current = await this.getOwned(id, organizationId);
      throw new ConflictException(
        `Migration must be in ${expected.join(' or ')} state; current state is ${current.status}`,
      );
    }
    return this.getOwned(id, organizationId);
  }

  async markExecutionResult(
    id: string,
    organizationId: string,
    result: { success: number; failed: number; status: MigrationStatus },
  ) {
    return this.transition(id, organizationId, [MigrationStatus.EXECUTING], result.status, {
      successRows: result.success,
      failedRows: result.failed,
      executedAt: new Date(),
    });
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private gateFor(status: MigrationStatus): 'review' | 'execute' {
    return status === MigrationStatus.SIMULATED ? 'execute' : 'review';
  }

  private nextActionFor(status: MigrationStatus): string {
    switch (status) {
      case MigrationStatus.ANALYZED:
        return 'confirm_mappings';
      case MigrationStatus.MAPPED:
        return 'validate';
      case MigrationStatus.VALIDATED:
        return 'simulate';
      case MigrationStatus.SIMULATED:
        return 'import';
      default:
        return 'none';
    }
  }
}
