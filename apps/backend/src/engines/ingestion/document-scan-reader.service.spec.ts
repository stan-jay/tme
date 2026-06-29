import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConfigService } from '@nestjs/config';
import { DocumentScanReaderService } from './document-scan-reader.service';
import { MockOcrProvider } from './mock-ocr.provider';

describe('DocumentScanReaderService', () => {
  function buildService(values: Record<string, string | undefined> = {}) {
    const config = { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
    return new DocumentScanReaderService(new MockOcrProvider(config));
  }

  it('marks images as OCR-required and emits a review placeholder', async () => {
    const service = buildService();
    const filePath = join(tmpdir(), `tme-scan-${Date.now()}.png`);
    await fs.writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    try {
      const result = await service.extract(filePath, '.png');
      expect(result.sourceKind).toBe('image');
      expect(result.extractionMode).toBe('ocr-required');
      expect(result.ocr?.status).toBe('unavailable');
      expect(result.entities[0].type).toBe('sale_invoice');
      expect(result.warnings[0]).toContain('OCR');
    } finally {
      await fs.unlink(filePath).catch(() => undefined);
    }
  });

  it('extracts a draft invoice from simple embedded PDF text', async () => {
    const service = buildService();
    const filePath = join(tmpdir(), `tme-scan-${Date.now()}.pdf`);
    const pdfLike = Buffer.from(
      '%PDF-1.4\n(Invoice INV-9) (Customer Akosua Retail) (Date 2026-06-27) (Subtotal 100) (VAT 15) (Total 115)\n%%EOF',
      'latin1',
    );
    await fs.writeFile(filePath, pdfLike);
    try {
      const result = await service.extract(filePath, '.pdf');
      expect(result.extractionMode).toBe('embedded-text');
      expect(result.entities[0]).toMatchObject({
        type: 'sale_invoice',
        invoiceNumber: 'INV-9',
        total: 115,
      });
      expect(result.evidence.some((item) => item.field === 'invoiceNumber')).toBe(true);
    } finally {
      await fs.unlink(filePath).catch(() => undefined);
    }
  });

  it('uses the configured OCR provider when an image has no embedded text', async () => {
    const service = buildService({
      OCR_PROVIDER: 'mock',
      MOCK_OCR_TEXT: 'Invoice IMG-7\nCustomer Scan Retail\nDate 2026-06-27\nSubtotal 80\nVAT 12\nTotal 92',
    });
    const filePath = join(tmpdir(), `tme-scan-${Date.now()}.jpg`);
    await fs.writeFile(filePath, Buffer.from([0xff, 0xd8, 0x00, 0xff, 0xd9]));
    try {
      const result = await service.extract(filePath, '.jpg');
      expect(result.extractionMode).toBe('ocr');
      expect(result.ocr).toMatchObject({ provider: 'mock-ocr', status: 'available' });
      expect(result.entities[0]).toMatchObject({
        invoiceNumber: 'IMG-7',
        total: 92,
      });
      expect(result.evidence.some((item) => item.source === 'ocr')).toBe(true);
    } finally {
      await fs.unlink(filePath).catch(() => undefined);
    }
  });
});
