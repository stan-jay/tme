import { ConfigService } from '@nestjs/config';
import { IntegrationCryptoService } from './integration-crypto.service';

describe('IntegrationCryptoService', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const service = new IntegrationCryptoService(
    new ConfigService({
      INTEGRATION_ENCRYPTION_KEY: key,
      INTEGRATION_ENCRYPTION_KEY_ID: 'test-v1',
    }),
  );

  it('encrypts authenticated secret envelopes without leaking plaintext', () => {
    const encrypted = service.encrypt({ apiKey: 'super-secret', clientSecret: 'another-secret' });
    expect(encrypted).not.toContain('super-secret');
    expect(service.decrypt(encrypted)).toEqual({
      apiKey: 'super-secret',
      clientSecret: 'another-secret',
    });
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = service.encrypt({ apiKey: 'super-secret' });
    const envelope = JSON.parse(Buffer.from(encrypted, 'base64').toString('utf8'));
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -2)}AA`;
    const tampered = Buffer.from(JSON.stringify(envelope)).toString('base64');
    expect(() => service.decrypt(tampered)).toThrow();
  });
});
