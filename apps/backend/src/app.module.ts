import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MigrationModule } from './migration/migration.module';
import { IngestionModule } from './engines/ingestion/ingestion.module';
import { AiMappingModule } from './engines/ai-mapping/ai-mapping.module';
import { ValidationModule } from './engines/validation/validation.module';
import { TransformationModule } from './engines/transformation/transformation.module';
import { RelationshipModule } from './engines/relationship/relationship.module';
import { SimulationModule } from './engines/simulation/simulation.module';
import { ExecutionModule } from './engines/execution/execution.module';
import { RollbackModule } from './engines/rollback/rollback.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { UploadModule } from './upload/upload.module';
import { PluginRegistryModule } from './platform/plugin-registry/plugin-registry.module';
import { KnowledgeModule } from './platform/knowledge/knowledge.module';
import { IntegrationModule } from './platform/integrations/integration.module';
import { PipelineModule } from './platform/pipeline/pipeline.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuditModule,
    AuthModule,
    UploadModule,
    PluginRegistryModule,
    IntegrationModule,
    PipelineModule,
    KnowledgeModule,
    IngestionModule,
    AiMappingModule,
    ValidationModule,
    TransformationModule,
    RelationshipModule,
    SimulationModule,
    ExecutionModule,
    RollbackModule,
    MigrationModule,
  ],
})
export class AppModule {}
