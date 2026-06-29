import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OcrProvider, OcrResult } from './ocr-provider';

/**
 * Deterministic development OCR provider.
 *
 * Real providers (Tesseract, Textract, Google Vision, Azure Document
 * Intelligence) should implement OcrProvider. This mock is intentionally
 * config-gated so production never silently trusts fake OCR.
 */
@Injectable()
export class MockOcrProvider implements OcrProvider {
  readonly id = 'mock-ocr';

  constructor(private readonly config: ConfigService) {}

  async extract(): Promise<OcrResult> {
    const enabled = this.config.get<string>('OCR_PROVIDER') === 'mock';
    const text = this.config.get<string>('MOCK_OCR_TEXT') || DEFAULT_MOCK_TEXT;
    if (!enabled) {
      return {
        provider: this.id,
        status: 'unavailable',
        fullText: '',
        averageConfidence: 0,
        blocks: [],
        warnings: ['No OCR provider is configured. Set OCR_PROVIDER=mock for local development or attach a real OCR provider.'],
      };
    }
    const blocks = text
      .split(/\n+/)
      .map((line, index) => line.trim())
      .filter(Boolean)
      .map((line, index) => ({
        text: line,
        confidence: 0.82,
        page: 1,
        boundingBox: { left: 0.08, top: 0.08 + index * 0.06, width: 0.84, height: 0.04 },
      }));
    return {
      provider: this.id,
      status: 'available',
      fullText: text,
      averageConfidence: 0.82,
      blocks,
      warnings: ['Mock OCR is for development only; reviewer confirmation is required.'],
    };
  }
}

const DEFAULT_MOCK_TEXT = [
  'Invoice MOCK-1001',
  'Customer Mock Retail Ltd',
  'Date 2026-06-27',
  'Subtotal 120',
  'VAT 18',
  'Total 138',
].join('\n');
