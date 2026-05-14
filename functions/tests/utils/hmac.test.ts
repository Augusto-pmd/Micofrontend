import { verifyMpWebhookSignature } from '../../src/utils/hmac';

describe('verifyMpWebhookSignature', () => {
  const secret = 'test-secret-key';

  it('should return true for a valid signature', () => {
    const body = '{"id":"12345","type":"payment"}';
    const { createHmac } = require('crypto');
    const validSig = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyMpWebhookSignature(body, validSig, secret)).toBe(true);
  });

  it('should return false for an invalid signature', () => {
    const body = '{"id":"12345","type":"payment"}';
    expect(verifyMpWebhookSignature(body, 'invalid-signature', secret)).toBe(false);
  });

  it('should return false for empty signature', () => {
    expect(verifyMpWebhookSignature('{}', '', secret)).toBe(false);
  });
});
