export interface OcrTextBlock {
  text: string;
  confidence: number;
  page?: number;
  boundingBox?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface OcrResult {
  provider: string;
  status: 'available' | 'unavailable';
  fullText: string;
  averageConfidence: number;
  blocks: OcrTextBlock[];
  warnings: string[];
}

export interface OcrProvider {
  readonly id: string;
  extract(input: {
    filePath: string;
    extension: string;
    buffer: Buffer;
  }): Promise<OcrResult>;
}

export const OCR_PROVIDER = Symbol('OCR_PROVIDER');
