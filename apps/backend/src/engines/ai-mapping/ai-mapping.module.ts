import { Module } from '@nestjs/common';
import { AiMappingService } from './ai-mapping.service';

@Module({
  providers: [AiMappingService],
  exports: [AiMappingService],
})
export class AiMappingModule {}
