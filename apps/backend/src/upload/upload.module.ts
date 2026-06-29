import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from './upload.service';

@Module({
  providers: [UploadService, PrismaService],
  exports: [UploadService],
})
export class UploadModule {}
