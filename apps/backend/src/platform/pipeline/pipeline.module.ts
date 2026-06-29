import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionModule } from '../../engines/execution/execution.module';
import { RelationshipModule } from '../../engines/relationship/relationship.module';
import { PipelineController } from './pipeline.controller';
import { PipelineProcessorService } from './pipeline-processor.service';
import { PipelineQueueService } from './pipeline-queue.service';
import { PipelineStageHandlerRegistry } from './pipeline-stage-handler.registry';
import { PipelineService } from './pipeline.service';

@Global()
@Module({
  imports: [ExecutionModule, RelationshipModule],
  controllers: [PipelineController],
  providers: [
    PipelineService,
    PipelineQueueService,
    PipelineProcessorService,
    PipelineStageHandlerRegistry,
    PrismaService,
  ],
  exports: [PipelineService, PipelineQueueService, PipelineStageHandlerRegistry],
})
export class PipelineModule {}
