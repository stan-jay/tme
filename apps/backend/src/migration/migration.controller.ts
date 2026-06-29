import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { memoryStorage } from 'multer';
import { AuditService } from '../audit/audit.service';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UploadService } from '../upload/upload.service';
import { DocumentScanReaderService } from '../engines/ingestion/document-scan-reader.service';
import {
  AcceptScanDraftDto,
  AnalyzeUploadDto,
  ConfirmMappingsDto,
  DetectMappingsDto,
  ExecuteMigrationDto,
} from './dto/migration.dto';
import { MigrationOrchestrator } from './migration.orchestrator';
import { MigrationService } from './migration.service';

@Controller('migration')
@UseGuards(AuthGuard, RolesGuard)
export class MigrationController {
  constructor(
    private readonly migrationService: MigrationService,
    private readonly orchestrator: MigrationOrchestrator,
    private readonly uploads: UploadService,
    private readonly documentScans: DocumentScanReaderService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  @Get('health')
  health() {
    return this.migrationService.health();
  }

  @Post('upload')
  @Roles(UserRole.ADMIN, UserRole.UPLOADER)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { files: 1, fileSize: 25 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const maxBytes = Number(
      this.config.get<string>('UPLOAD_MAX_BYTES') || 25 * 1024 * 1024,
    );
    if (file && file.size > maxBytes) {
      throw new PayloadTooLargeException('Upload exceeds configured size limit');
    }
    const upload = await this.uploads.store(file, request.user);
    await this.audit.record({
      user: request.user,
      action: 'upload.store',
      entityType: 'upload',
      entityId: upload.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      details: { originalName: upload.originalName, sizeBytes: upload.sizeBytes, sha256: upload.sha256 },
    });
    return { uploadId: upload.id, ...upload };
  }

  @Post('analyze')
  @Roles(UserRole.ADMIN, UserRole.UPLOADER, UserRole.REVIEWER)
  analyze(@Body() body: AnalyzeUploadDto, @Req() request: AuthenticatedRequest) {
    return this.orchestrator.analyzeUpload(body.uploadId, body.sourceType, request.user);
  }

  @Post('scans/:uploadId/analyze')
  @Roles(UserRole.ADMIN, UserRole.UPLOADER, UserRole.REVIEWER)
  async analyzeScan(@Param('uploadId') uploadId: string, @Req() request: AuthenticatedRequest) {
    const upload = await this.uploads.resolveOwned(uploadId, request.user.organizationId);
    const result = await this.documentScans.extract(upload.storagePath, upload.extension);
    await this.audit.record({
      user: request.user,
      action: 'scan.analyze',
      entityType: 'upload',
      entityId: upload.id,
      outcome: result.extractionMode === 'embedded-text' ? 'drafted' : 'ocr_required',
      details: {
        sourceKind: result.sourceKind,
        extractionMode: result.extractionMode,
        confidence: result.confidence,
        warningCount: result.warnings.length,
      },
    });
    return { uploadId, ...result };
  }

  @Post('scans/:uploadId/accept-draft')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER)
  acceptScanDraft(
    @Param('uploadId') uploadId: string,
    @Body() body: AcceptScanDraftDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.orchestrator.acceptSjblDraft({
      uploadId,
      entities: body.entities as any,
      evidence: body.evidence,
      user: request.user,
    });
  }

  @Post('detect-mappings')
  @Roles(UserRole.ADMIN, UserRole.UPLOADER, UserRole.REVIEWER)
  detectMappings(@Body() body: DetectMappingsDto) {
    return this.orchestrator.detectMappings(body.columns, body.context);
  }

  @Post('migrations/:id/mappings/confirm')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER)
  confirmMappings(
    @Param('id') id: string,
    @Body() body: ConfirmMappingsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.orchestrator.confirmMappings(id, body.mappings, request.user);
  }

  @Post('migrations/:id/validate')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER)
  validate(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.orchestrator.validateMigration(id, request.user);
  }

  @Post('migrations/:id/simulate')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER)
  simulate(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.orchestrator.simulateMigration(id, request.user);
  }

  @Post('migrations/:id/execute')
  @Roles(UserRole.ADMIN, UserRole.EXECUTOR)
  execute(
    @Param('id') id: string,
    @Body() body: ExecuteMigrationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.orchestrator.executeMigration(
      id,
      body.destinationConnectionId,
      body.idempotencyKey,
      request.user,
    );
  }

  @Post('migrations/:id/rollback')
  @Roles(UserRole.ADMIN)
  rollback(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.orchestrator.rollbackMigration(id, request.user);
  }

  @Get('migrations')
  listMigrations(@Req() request: AuthenticatedRequest) {
    return this.migrationService.listMigrations(request.user.organizationId);
  }

  @Get('worklist')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.EXECUTOR)
  listWorklist(@Req() request: AuthenticatedRequest) {
    return this.migrationService.listWorklist(request.user.organizationId, request.user.role);
  }

  @Get('migrations/:id')
  getMigration(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.migrationService.getOwned(id, request.user.organizationId);
  }
}
