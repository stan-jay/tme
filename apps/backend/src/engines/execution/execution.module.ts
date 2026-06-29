import { Module } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  providers: [ExecutionService, PrismaService],
  exports: [ExecutionService],
})
export class ExecutionModule {}
