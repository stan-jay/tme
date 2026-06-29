import { Module } from '@nestjs/common';
import { RollbackService } from './rollback.service';

@Module({
  providers: [RollbackService],
  exports: [RollbackService],
})
export class RollbackModule {}
