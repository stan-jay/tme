import { ConflictException, Injectable } from '@nestjs/common';
import { MigrationStatus } from '@prisma/client';
import type { ColumnMapping, MigrationPreview, ValidationIssue } from '@tme/shared';
import type { AuthUser } from '../auth/auth.types';
import type { SJBLEntity, SJBLEntityType } from '@tme/shared';
import { AuditService } from '../audit/audit.service';
import { UploadService } from '../upload/upload.service';
import { AiMappingService } from '../engines/ai-mapping/ai-mapping.service';
import { TabularFileReaderService } from '../engines/ingestion/tabular-file-reader.service';
import { RelationshipService } from '../engines/relationship/relationship.service';
import { RollbackService } from '../engines/rollback/rollback.service';
import { SimulationService } from '../engines/simulation/simulation.service';
import { validateSjUtfEntities } from '../engines/transformation/sj-utf-validator';
import { TransformationService } from '../engines/transformation/transformation.service';
import { ValidationService } from '../engines/validation/validation.service';
import { PipelineService } from '../platform/pipeline/pipeline.service';
import { IntegrationService } from '../platform/integrations/integration.service';
import { detectEntityType } from '../engines/language/entity-detection';
import { MigrationService } from './migration.service';
import { deriveMigrationStatus } from './migration-status';
import { MappingProfileService } from './mapping-profile.service';
import { reconcileProfileMappings } from './mapping-profile.util';

@Injectable()
export class MigrationOrchestrator {
  constructor(
    private readonly fileReader: TabularFileReaderService,
    private readonly aiMapping: AiMappingService,
    private readonly validation: ValidationService,
    private readonly transformation: TransformationService,
    private readonly relationship: RelationshipService,
    private readonly simulation: SimulationService,
    private readonly pipelines: PipelineService,
    private readonly integrations: IntegrationService,
    private readonly rollback: RollbackService,
    private readonly migrationService: MigrationService,
    private readonly uploads: UploadService,
    private readonly audit: AuditService,
    private readonly mappingProfiles: MappingProfileService,
  ) {}

  async analyzeUpload(uploadId: string, sourceType: string, user: AuthUser) {
    const upload = await this.uploads.resolveOwned(uploadId, user.organizationId);
    const expectedSourceType = upload.extension === '.csv' ? 'csv' : 'excel';
    if (sourceType !== expectedSourceType) {
      throw new ConflictException(
        `Source type ${sourceType} does not match uploaded file type ${expectedSourceType}`,
      );
    }
    const rawData = await this.parseSource(upload.storagePath, sourceType);
    if (!rawData.length) throw new ConflictException('The uploaded file contains no readable rows');

    const columns = Object.keys(rawData[0] || {});

    // Reuse a saved profile when this column layout has been imported before;
    // otherwise fall back to deterministic detection.
    const profile = await this.mappingProfiles.find(user.organizationId, columns);
    let mappings: ColumnMapping[];
    let profileApplied = false;
    if (profile) {
      mappings = reconcileProfileMappings(profile.mappings as unknown as ColumnMapping[], columns).mappings;
      profileApplied = true;
      await this.mappingProfiles.recordUse(profile.id);
    } else {
      mappings = await this.aiMapping.detectColumns(columns);
    }

    const migration = await this.migrationService.createMigration({
      uploadId,
      name: `Migration-${new Date().toISOString()}`,
      sourceType,
      user,
      totalRows: rawData.length,
    });
    await this.migrationService.replaceMappings(migration.id, user.organizationId, mappings, false);
    await this.audit.record({
      user,
      action: 'migration.analyze',
      entityType: 'migration',
      entityId: migration.id,
      details: { uploadId, rows: rawData.length, columns, profileApplied, profileId: profile?.id },
    });

    return {
      migrationId: migration.id,
      status: MigrationStatus.ANALYZED,
      rows: rawData.length,
      columns,
      entityType: detectEntityType(mappings.map((mapping) => mapping.targetField)),
      suggestedMappings: mappings,
      profileApplied,
    };
  }

  detectMappings(columns: string[], context?: string): Promise<ColumnMapping[]> {
    return this.aiMapping.mapColumns(columns, context || '');
  }

  async confirmMappings(
    migrationId: string,
    mappings: ColumnMapping[],
    user: AuthUser,
  ) {
    const migration = await this.migrationService.getOwned(migrationId, user.organizationId);
    if (migration.status !== MigrationStatus.ANALYZED) {
      throw new ConflictException(`Mappings cannot be confirmed from ${migration.status} state`);
    }
    const sourceColumns = new Set(migration.columnMappings.map((mapping) => mapping.sourceColumn));
    if (
      mappings.length !== sourceColumns.size ||
      mappings.some((mapping) => !sourceColumns.has(mapping.sourceColumn))
    ) {
      throw new ConflictException('Confirmed mappings must cover each analyzed source column exactly once');
    }

    await this.migrationService.replaceMappings(migrationId, user.organizationId, mappings, true);

    // Persist the confirmed mappings as a reusable profile for this layout.
    const columns = mappings.map((mapping) => mapping.sourceColumn);
    const entityType = detectEntityType(mappings.map((mapping) => mapping.targetField));
    await this.mappingProfiles.save({
      organizationId: user.organizationId,
      createdById: user.id,
      columns,
      entityType,
      mappings,
      name: `${entityType} import`,
    });

    await this.audit.record({
      user,
      action: 'migration.mappings.confirm',
      entityType: 'migration',
      entityId: migrationId,
      details: { mappings, savedProfile: true, entityType },
    });
    return this.migrationService.getOwned(migrationId, user.organizationId);
  }

  async validateMigration(migrationId: string, user: AuthUser) {
    const migration = await this.requireState(migrationId, user, [MigrationStatus.MAPPED]);
    const source = await this.loadMigrationEntities(migration);
    const sourceIssues = source.kind === 'tabular' ? await this.validation.validate(source.rawData, {}) : [];
    const utfData = source.entities;
    const runtimeIssues: ValidationIssue[] = validateSjUtfEntities(utfData).map((issue) => ({
      type: 'error',
      message: issue.message,
      value: issue.entityId,
    }));
    const issues = [...sourceIssues, ...runtimeIssues];
    const healthScore = this.validation.calculateHealthScore(issues, utfData.length);
    const passed = !issues.some((issue) => issue.type === 'error');

    await this.migrationService.replaceValidationIssues(
      migrationId,
      issues.map((issue) => ({
        type: issue.type,
        code: issue.type === 'error' ? 'VALIDATION_ERROR' : 'VALIDATION_WARNING',
        rowNumber: issue.row,
        column: issue.column,
        message: issue.message,
        value: issue.value === undefined ? undefined : String(issue.value),
      })),
      passed,
    );
    await this.audit.record({
      user,
      action: 'migration.validate',
      entityType: 'migration',
      entityId: migrationId,
      outcome: passed ? 'success' : 'rejected',
      details: { healthScore, issueCount: issues.length },
    });
    return { migrationId, status: MigrationStatus.VALIDATED, issues, healthScore, readyToImport: passed };
  }

  async simulateMigration(migrationId: string, user: AuthUser): Promise<MigrationPreview & { migrationId: string }> {
    const migration = await this.requireState(migrationId, user, [MigrationStatus.VALIDATED]);
    if (!migration.validationPassed) {
      throw new ConflictException('Validation errors must be resolved before simulation');
    }
    const source = await this.loadMigrationEntities(migration);
    const utfData = source.entities;
    const mappings = migration.columnMappings.map(this.toMapping);
    const graph = await this.relationship.buildGraph(utfData);
    const relationshipIssues = await this.relationship.validateRelationships(graph);
    if (relationshipIssues.length) {
      throw new ConflictException(`Relationship validation failed: ${relationshipIssues.join('; ')}`);
    }

    const preview = await this.simulation.simulateMigration(utfData, mappings, migration.validationIssues);
    await this.migrationService.transition(
      migrationId,
      user.organizationId,
      [MigrationStatus.VALIDATED],
      MigrationStatus.SIMULATED,
      { simulationPassed: true },
    );
    await this.audit.record({
      user,
      action: 'migration.simulate',
      entityType: 'migration',
      entityId: migrationId,
      details: { estimatedSuccess: preview.estimatedSuccess, sourceRows: preview.sourceRows },
    });
    return { ...preview, migrationId };
  }

  async executeMigration(
    migrationId: string,
    destinationConnectionId: string,
    idempotencyKey: string,
    user: AuthUser,
  ) {
    const migration = await this.requireState(migrationId, user, [MigrationStatus.SIMULATED]);
    if (!migration.mappingsApproved || !migration.validationPassed || !migration.simulationPassed) {
      throw new ConflictException('Mapping approval, validation and simulation are required before execution');
    }
    const source = await this.loadMigrationEntities(migration);
    const utfData = source.entities;
    const runtimeErrors = validateSjUtfEntities(utfData);
    if (runtimeErrors.length) {
      throw new ConflictException({
        message: 'SJ-UTF runtime validation failed',
        errors: runtimeErrors.slice(0, 100),
      });
    }
    await this.assertDestinationCompatibility(
      destinationConnectionId,
      user.organizationId,
      utfData,
    );

    await this.migrationService.transition(
      migrationId,
      user.organizationId,
      [MigrationStatus.SIMULATED],
      MigrationStatus.EXECUTING,
      { destination: destinationConnectionId },
    );
    const run = await this.pipelines.runMigration({
      migrationId,
      destinationConnectionId,
      idempotencyKey,
      entities: utfData,
      user,
    });
    const writeStage = run.stageRuns.find((stageRun) => stageRun.stageKey === 'write');
    const writeOutput = asObject(writeStage?.output);
    const result = {
      success: Number(writeOutput.success || 0),
      failed: Number(writeOutput.failed || 0),
      skipped: Number(writeOutput.skipped || 0),
    };
    const status = deriveMigrationStatus(run.status, result);
    await this.migrationService.markExecutionResult(migrationId, user.organizationId, {
      success: result.success + result.skipped,
      failed: result.failed,
      status,
    });
    await this.audit.record({
      user,
      action: 'migration.execute',
      entityType: 'migration',
      entityId: migrationId,
      outcome: status.toLowerCase(),
      details: { ...result, pipelineRunId: run.id, runStatus: run.status },
    });
    return { migrationId, status, pipelineRunId: run.id, ...result };
  }

  async rollbackMigration(migrationId: string, user: AuthUser): Promise<never> {
    const migration = await this.migrationService.getOwned(migrationId, user.organizationId);
    const rollbackTerminalStates: MigrationStatus[] = [
        MigrationStatus.COMPLETED,
        MigrationStatus.PARTIALLY_COMPLETED,
        MigrationStatus.FAILED,
      ];
    if (rollbackTerminalStates.includes(migration.status)) {
      await this.migrationService.transition(
        migrationId,
        user.organizationId,
        [migration.status],
        MigrationStatus.ROLLBACK_UNAVAILABLE,
      );
    }
    await this.audit.record({
      user,
      action: 'migration.rollback',
      entityType: 'migration',
      entityId: migrationId,
      outcome: 'unavailable',
    });
    return this.rollback.rollback();
  }

  async acceptSjblDraft(input: {
    uploadId: string;
    entities: SJBLEntity[];
    evidence?: unknown;
    user: AuthUser;
  }) {
    const upload = await this.uploads.resolveOwned(input.uploadId, input.user.organizationId);
    if (!input.entities.length) throw new ConflictException('At least one reviewed SJBL entity is required');
    const invalid = input.entities.filter((entity) => !entity.id || !entity.type);
    if (invalid.length) {
      throw new ConflictException('Every reviewed SJBL entity requires id and type');
    }
    const migration = await this.migrationService.createSjblDraftMigration({
      uploadId: upload.id,
      name: `Scan draft-${new Date().toISOString()}`,
      user: input.user,
      entities: input.entities,
      evidence: input.evidence,
    });
    await this.audit.record({
      user: input.user,
      action: 'scan.draft.accept',
      entityType: 'migration',
      entityId: migration.id,
      details: {
        uploadId: upload.id,
        entityTypes: [...new Set(input.entities.map((entity) => entity.type))],
        entityCount: input.entities.length,
      },
    });
    const validation = await this.validateMigration(migration.id, input.user);
    const simulation = validation.readyToImport
      ? await this.simulateMigration(migration.id, input.user)
      : null;
    return {
      migrationId: migration.id,
      status: simulation ? MigrationStatus.SIMULATED : MigrationStatus.VALIDATED,
      validation,
      simulation,
    };
  }

  private async requireState(id: string, user: AuthUser, states: MigrationStatus[]) {
    const migration = await this.migrationService.getOwned(id, user.organizationId);
    if (!states.includes(migration.status)) {
      throw new ConflictException(
        `Migration must be in ${states.join(' or ')} state; current state is ${migration.status}`,
      );
    }
    return migration;
  }

  private async parseSource(filePath: string, sourceType: string): Promise<any[]> {
    if (sourceType === 'excel') return this.fileReader.readExcel(filePath) as any[];
    if (sourceType === 'csv') return this.fileReader.readCsv(filePath) as any[];
    throw new ConflictException(`Unsupported source type ${sourceType}`);
  }

  private async loadMigrationEntities(migration: Awaited<ReturnType<MigrationService['getOwned']>>): Promise<
    | { kind: 'sjbl'; entities: SJBLEntity[] }
    | { kind: 'tabular'; rawData: any[]; entities: SJBLEntity[] }
  > {
    if (migration.sourceType === 'sjbl-draft') {
      const payload = asObject(migration.sourcePayload);
      const entities = Array.isArray(payload.entities)
        ? payload.entities.filter(isSjblEntity)
        : [];
      if (!entities.length) throw new ConflictException('SJBL draft migration contains no entities');
      return { kind: 'sjbl', entities };
    }
    const rawData = await this.parseSource(migration.upload.storagePath, migration.sourceType);
    const entities = await this.transformation.transformToUtf(
      rawData,
      migration.columnMappings.map(this.toMapping),
    );
    return { kind: 'tabular', rawData, entities };
  }

  private toMapping(mapping: {
    sourceColumn: string;
    targetField: string;
    confidence: number;
    userConfirmed: boolean;
  }): ColumnMapping {
    return {
      sourceColumn: mapping.sourceColumn,
      targetField: mapping.targetField,
      confidence: mapping.confidence,
      userConfirmed: mapping.userConfirmed,
    };
  }

  private async assertDestinationCompatibility(
    destinationConnectionId: string,
    organizationId: string,
    entities: SJBLEntity[],
  ): Promise<void> {
    const runtime = await this.integrations.runtimeConfiguration(destinationConnectionId, organizationId);
    const capabilities = new Set(runtime.capabilities);
    if (!capabilities.has('write')) {
      throw new ConflictException('Selected destination does not provide a writer capability');
    }

    const supported = new Set(runtime.supportedEntityTypes as SJBLEntityType[]);
    if (!supported.size) return;

    const requested = [...new Set(entities.map((entity) => entity.type))];
    const unsupported = requested.filter((entityType) => !supported.has(entityType));
    if (unsupported.length) {
      throw new ConflictException(
        `Selected destination cannot accept ${unsupported.join(', ')} records`,
      );
    }
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isSjblEntity(value: unknown): value is SJBLEntity {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { id?: unknown }).id === 'string' &&
      typeof (value as { type?: unknown }).type === 'string',
  );
}
