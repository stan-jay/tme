import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DocumentScanReaderService } from './document-scan-reader.service';
import { MockOcrProvider } from './mock-ocr.provider';
import { OCR_PROVIDER } from './ocr-provider';
import { TabularFileReaderService } from './tabular-file-reader.service';

@Module({
  imports: [ConfigModule],
  providers: [
    DocumentScanReaderService,
    MockOcrProvider,
    TabularFileReaderService,
    { provide: OCR_PROVIDER, useExisting: MockOcrProvider },
  ],
  exports: [DocumentScanReaderService, TabularFileReaderService],
})
export class IngestionModule {}
