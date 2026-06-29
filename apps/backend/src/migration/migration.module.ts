import { Module } from '@nestjs/common';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';
import { MigrationOrchestrator } from './migration.orchestrator';
import { MappingProfileService } from './mapping-profile.service';
import { IngestionModule } from '../engines/ingestion/ingestion.module';
import { AiMappingModule } from '../engines/ai-mapping/ai-mapping.module';
import { ValidationModule } from '../engines/validation/validation.module';
import { TransformationModule } from '../engines/transformation/transformation.module';
import { RelationshipModule } from '../engines/relationship/relationship.module';
import { SimulationModule } from '../engines/simulation/simulation.module';
import { RollbackModule } from '../engines/rollback/rollback.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    AuthModule,
    UploadModule,
    IngestionModule,
    AiMappingModule,
    ValidationModule,
    TransformationModule,
    RelationshipModule,
    SimulationModule,
    RollbackModule,
  ],
  controllers: [MigrationController],
  providers: [MigrationService, MigrationOrchestrator, MappingProfileService, PrismaService],
})
export class MigrationModule {}
