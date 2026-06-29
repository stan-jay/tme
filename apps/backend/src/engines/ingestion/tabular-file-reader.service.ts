import { Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import * as XLSX from 'xlsx';

/**
 * File ingestion adapter.
 *
 * This is deliberately not a "connector": it has one capability—reading
 * tabular files into source records. Mapping those records into SJBL belongs
 * to a separate language capability.
 */
@Injectable()
export class TabularFileReaderService {
  private readonly logger = new Logger(TabularFileReaderService.name);

  readExcel(filePath: string): unknown[] {
    return this.readWorkbook(filePath, true);
  }

  readCsv(filePath: string): unknown[] {
    return this.readWorkbook(filePath, false);
  }

  private readWorkbook(filePath: string, cellDates: boolean): unknown[] {
    if (!existsSync(filePath)) {
      this.logger.warn(`Tabular source not found: ${filePath}`);
      return [];
    }
    const workbook = XLSX.readFile(filePath, { cellDates, raw: !cellDates });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(firstSheet, { defval: null });
  }
}
