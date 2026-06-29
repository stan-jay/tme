import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { AuditService } from '../audit/audit.service';
import { UploadService } from '../upload/upload.service';
import { DocumentScanReaderService } from '../engines/ingestion/document-scan-reader.service';
import { PrismaService } from '../prisma/prisma.service';
import { MigrationController } from './migration.controller';
import { MigrationOrchestrator } from './migration.orchestrator';
import { MigrationService } from './migration.service';

describe('MigrationController', () => {
  let controller: MigrationController;
  let orchestrator: MigrationOrchestrator;
  let migrationService: MigrationService;

  const request = {
    user: {
      id: 'user-1',
      organizationId: 'org-1',
      email: 'admin@example.com',
      role: 'ADMIN',
    },
  } as AuthenticatedRequest;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MigrationController],
      providers: [
        {
          provide: MigrationService,
          useValue: {
            health: jest.fn().mockReturnValue({ status: 'ok', service: 'migration' }),
            listMigrations: jest.fn().mockResolvedValue([]),
            listWorklist: jest.fn().mockResolvedValue([]),
            getOwned: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: MigrationOrchestrator,
          useValue: {
            analyzeUpload: jest.fn().mockResolvedValue({}),
            detectMappings: jest.fn().mockResolvedValue([]),
            confirmMappings: jest.fn().mockResolvedValue({}),
            validateMigration: jest.fn().mockResolvedValue({}),
            simulateMigration: jest.fn().mockResolvedValue({}),
            executeMigration: jest.fn().mockResolvedValue({ status: 'COMPLETED' }),
            rollbackMigration: jest.fn().mockRejectedValue(new Error('Unavailable')),
            acceptSjblDraft: jest.fn().mockResolvedValue({ migrationId: 'migration-1' }),
          },
        },
        { provide: UploadService, useValue: { store: jest.fn(), resolveOwned: jest.fn() } },
        { provide: DocumentScanReaderService, useValue: { extract: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: { user: { findFirst: jest.fn() } } },
      ],
    }).compile();

    controller = module.get(MigrationController);
    orchestrator = module.get(MigrationOrchestrator);
    migrationService = module.get(MigrationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns health status', () => {
    expect(controller.health()).toEqual({ status: 'ok', service: 'migration' });
  });

  it('passes opaque upload ownership context to analysis', async () => {
    await controller.analyze({ uploadId: 'upload-1', sourceType: 'excel' }, request);
    expect(orchestrator.analyzeUpload).toHaveBeenCalledWith('upload-1', 'excel', request.user);
  });

  it('returns role-scoped worklist items', async () => {
    await expect(controller.listWorklist(request)).resolves.toEqual([]);
    expect(migrationService.listWorklist).toHaveBeenCalledWith('org-1', 'ADMIN');
  });

  it('accepts a reviewed scan draft into the migration flow', async () => {
    await controller.acceptScanDraft(
      'upload-1',
      { entities: [{ id: 'invoice-1', type: 'sale_invoice' }], evidence: [] },
      request,
    );
    expect(orchestrator.acceptSjblDraft).toHaveBeenCalledWith({
      uploadId: 'upload-1',
      entities: [{ id: 'invoice-1', type: 'sale_invoice' }],
      evidence: [],
      user: request.user,
    });
  });
});
