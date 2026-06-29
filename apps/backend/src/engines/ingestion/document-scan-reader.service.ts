import { Inject, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { basename } from 'path';
import type { SaleInvoice, SJBLEntity } from '@tme/shared';
import { OCR_PROVIDER, type OcrProvider, type OcrResult } from './ocr-provider';

export interface ScanEvidence {
  field: string;
  value: unknown;
  confidence: number;
  source: 'filename' | 'embedded-text' | 'ocr' | 'placeholder';
  page?: number;
  boundingBox?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  note: string;
}

export interface ScanExtractionResult {
  sourceKind: 'pdf' | 'image';
  extractionMode: 'embedded-text' | 'ocr' | 'ocr-required';
  ocr?: {
    provider: string;
    status: 'available' | 'unavailable';
    averageConfidence: number;
    blockCount: number;
  };
  confidence: number;
  entities: SJBLEntity[];
  evidence: ScanEvidence[];
  warnings: string[];
}

/**
 * Scan/document ingestion seam.
 *
 * This deliberately avoids pretending we have OCR when no OCR engine is
 * configured. PDFs with embedded text can produce a low-risk draft; images and
 * scanned PDFs produce an evidence-rich placeholder that must be reviewed or
 * passed to a future OCR worker.
 */
@Injectable()
export class DocumentScanReaderService {
  constructor(@Inject(OCR_PROVIDER) private readonly ocr: OcrProvider) {}

  async extract(filePath: string, extension: string): Promise<ScanExtractionResult> {
    const buffer = await fs.readFile(filePath);
    const sourceKind = extension === '.pdf' ? 'pdf' : 'image';
    const embeddedText = sourceKind === 'pdf' ? extractPdfText(buffer) : '';
    const evidence: ScanEvidence[] = [];
    const warnings: string[] = [];

    if (!embeddedText.trim()) {
      const ocr = await this.ocr.extract({ filePath, extension, buffer });
      warnings.push(...ocr.warnings);
      if (ocr.status === 'available' && ocr.fullText.trim()) {
        const draft = draftFromRecognizedText(ocr.fullText, evidence, {
          source: 'ocr',
          blocks: ocr.blocks,
        });
        return buildDraftResult({
          sourceKind,
          extractionMode: 'ocr',
          ocr,
          evidence,
          warnings,
          draft,
        });
      }

      warnings.push(
        sourceKind === 'pdf'
          ? 'PDF appears to be scanned or contains no extractable text; OCR is required before trusted import.'
          : 'Image extraction requires an OCR engine; no business fields were trusted automatically.',
      );
      return {
        sourceKind,
        extractionMode: 'ocr-required',
        ocr: {
          provider: ocr.provider,
          status: ocr.status,
          averageConfidence: ocr.averageConfidence,
          blockCount: ocr.blocks.length,
        },
        confidence: 0.15,
        entities: [
          {
            id: 'scan-draft-1',
            type: 'sale_invoice',
            externalSource: 'document-scan',
            metadata: {
              originalFile: basename(filePath),
              extractionMode: 'ocr-required',
              reviewRequired: true,
            },
          } as unknown as SJBLEntity,
        ],
        evidence: [
          {
            field: 'document',
            value: basename(filePath),
            confidence: 0.15,
            source: 'placeholder',
            note: 'OCR worker has not extracted structured values yet.',
          },
        ],
        warnings,
      };
    }

    const draft = draftFromRecognizedText(embeddedText, evidence, { source: 'embedded-text' });
    return buildDraftResult({
      sourceKind,
      extractionMode: 'embedded-text',
      evidence,
      warnings,
      draft,
    });
  }
}

function draftFromRecognizedText(
  text: string,
  evidence: ScanEvidence[],
  options: {
    source: 'embedded-text' | 'ocr';
    blocks?: OcrResult['blocks'];
  },
): Partial<SaleInvoice> {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const invoiceNumber = match(normalized, /(?:invoice|inv)[\s#:-]*([a-z0-9-]+)/i);
  const date = match(normalized, /(?:date|invoice date)[\s:-]*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  const subtotal = money(match(normalized, /(?:subtotal|sub total)[\s:]*([0-9,.]+)/i));
  const tax = money(match(normalized, /(?:vat|tax)[\s:]*([0-9,.]+)/i));
  const total = money(match(normalized, /(?:^|\s)(?:total|amount due)[\s:]*([0-9,.]+)/i));
  const customerName = match(normalized, /(?:bill to|customer)[\s:]*([a-z0-9 .,'&-]{3,80})/i);

  pushEvidence(evidence, 'invoiceNumber', invoiceNumber, confidenceFor(options, 'invoice'), options);
  pushEvidence(evidence, 'date', date, confidenceFor(options, 'date'), options);
  pushEvidence(evidence, 'subtotal', subtotal, confidenceFor(options, 'subtotal'), options);
  pushEvidence(evidence, 'tax', tax, confidenceFor(options, 'vat'), options);
  pushEvidence(evidence, 'total', total, confidenceFor(options, 'total'), options);
  pushEvidence(evidence, 'customerId', customerName, confidenceFor(options, 'customer'), options);

  const fallbackTotal = total ?? subtotal ?? 0;
  const fallbackTax = tax ?? 0;
  const fallbackSubtotal = subtotal ?? Math.max(0, fallbackTotal - fallbackTax);
  return {
    id: 'scan-invoice-1',
    type: 'sale_invoice',
    invoiceNumber: invoiceNumber || 'REVIEW-INVOICE-NUMBER',
    customerId: customerName ? customerName.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'REVIEW-CUSTOMER',
    date: normalizeDate(date) || new Date().toISOString().slice(0, 10),
    items: [
      {
        productId: 'scan-line-1',
        description: 'Scanned document line pending review',
        quantity: 1,
        unitPrice: fallbackSubtotal,
        total: fallbackSubtotal,
      },
    ],
    subtotal: fallbackSubtotal,
    tax: fallbackTax,
    total: fallbackTotal,
    status: 'draft',
    metadata: {
      extractionMode: options.source,
      reviewRequired: true,
    },
  };
}

function buildDraftResult(input: {
  sourceKind: 'pdf' | 'image';
  extractionMode: 'embedded-text' | 'ocr';
  ocr?: OcrResult;
  draft: Partial<SaleInvoice>;
  evidence: ScanEvidence[];
  warnings: string[];
}): ScanExtractionResult {
  const requiredMissing = ['invoiceNumber', 'customerId', 'date', 'subtotal', 'tax', 'total'].filter(
    (field) => input.draft[field as keyof SaleInvoice] === undefined,
  );
  if (requiredMissing.length) {
    input.warnings.push(`Draft invoice is missing: ${requiredMissing.join(', ')}`);
  }
  const evidenceConfidence = input.evidence.length
    ? input.evidence.reduce((sum, item) => sum + item.confidence, 0) / input.evidence.length
    : 0.25;
  const confidence = input.ocr
    ? round((evidenceConfidence + input.ocr.averageConfidence) / 2)
    : round(evidenceConfidence);
  return {
    sourceKind: input.sourceKind,
    extractionMode: input.extractionMode,
    ocr: input.ocr
      ? {
          provider: input.ocr.provider,
          status: input.ocr.status,
          averageConfidence: input.ocr.averageConfidence,
          blockCount: input.ocr.blocks.length,
        }
      : undefined,
    confidence,
    entities: [input.draft as unknown as SJBLEntity],
    evidence: input.evidence,
    warnings: input.warnings,
  };
}

function extractPdfText(buffer: Buffer): string {
  // Minimal embedded-text extraction for proof of path. Full OCR/PDF text
  // parsing belongs behind this service boundary.
  const text = buffer.toString('latin1');
  return text
    .match(/\(([^()]{2,200})\)/g)
    ?.map((segment) => segment.slice(1, -1))
    .join(' ') ?? '';
}

function match(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1]?.trim();
}

function money(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = value.split(/[/-]/).map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return undefined;
  const [day, month, year] = parts;
  const fullYear = year < 100 ? 2000 + year : year;
  return `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function pushEvidence(
  evidence: ScanEvidence[],
  field: string,
  value: unknown,
  confidence: number,
  options: { source: 'embedded-text' | 'ocr'; blocks?: OcrResult['blocks'] },
): void {
  if (value === undefined || value === null || value === '') return;
  const block = options.blocks?.find((candidate) => candidate.text.toLowerCase().includes(fieldHint(field)));
  evidence.push({
    field,
    value,
    confidence,
    source: options.source,
    page: block?.page,
    boundingBox: block?.boundingBox,
    note:
      options.source === 'ocr'
        ? 'Extracted from OCR text; reviewer confirmation required.'
        : 'Extracted by deterministic embedded-text pattern; reviewer confirmation required.',
  });
}

function confidenceFor(options: { source: 'embedded-text' | 'ocr'; blocks?: OcrResult['blocks'] }, hint: string): number {
  if (options.source === 'embedded-text') return hint === 'customer' ? 0.45 : 0.7;
  const block = options.blocks?.find((candidate) => candidate.text.toLowerCase().includes(hint));
  return block ? round(block.confidence) : 0.55;
}

function fieldHint(field: string): string {
  if (field === 'invoiceNumber') return 'invoice';
  if (field === 'customerId') return 'customer';
  return field.toLowerCase();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
