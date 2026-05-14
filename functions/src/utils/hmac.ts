import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies the HMAC-SHA256 signature of a Mercado Pago webhook.
 * Uses timingSafeEqual to prevent timing attacks.
 */
export function verifyMpWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!signature) return false;

  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const signatureBuf = Buffer.from(signature, 'hex');

    if (expectedBuf.length !== signatureBuf.length) return false;

    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}
