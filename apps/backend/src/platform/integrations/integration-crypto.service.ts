import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

interface EncryptedEnvelope {
  version: 1;
  keyId: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

@Injectable()
export class IntegrationCryptoService {
  private readonly key: Buffer;
  readonly keyId: string;

  constructor(config: ConfigService) {
    const encoded = config.get<string>('INTEGRATION_ENCRYPTION_KEY');
    this.keyId = config.get<string>('INTEGRATION_ENCRYPTION_KEY_ID') || 'local-v1';
    if (!encoded) throw new Error('INTEGRATION_ENCRYPTION_KEY is required');
    this.key = Buffer.from(encoded, 'base64');
    if (this.key.length !== 32) {
      throw new Error('INTEGRATION_ENCRYPTION_KEY must decode to exactly 32 bytes');
    }
  }

  encrypt(value: Record<string, unknown>): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    const envelope: EncryptedEnvelope = {
      version: 1,
      keyId: this.keyId,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
    return Buffer.from(JSON.stringify(envelope)).toString('base64');
  }

  decrypt(encrypted: string | null): Record<string, unknown> {
    if (!encrypted) return {};
    const envelope = JSON.parse(
      Buffer.from(encrypted, 'base64').toString('utf8'),
    ) as EncryptedEnvelope;
    if (envelope.version !== 1 || envelope.keyId !== this.keyId) {
      throw new Error(`Unsupported integration encryption key ${envelope.keyId}`);
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(envelope.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8')) as Record<string, unknown>;
  }
}
