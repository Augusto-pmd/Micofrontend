import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifica la firma de un webhook de Mercado Pago segun su esquema REAL:
 *   - header  x-signature:  "ts=<ts>,v1=<hmac_hex>"
 *   - header  x-request-id: <request-id>
 *   - query   data.id:      <id del recurso>
 *   - manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"  (omite los ausentes; data.id en minuscula)
 *   - v1 esperado = HMAC-SHA256(manifest, secret) en hex
 * Usa timingSafeEqual para evitar timing attacks. Devuelve false si falta algo o no matchea.
 */
export function verifyMpWebhookSignature(opts: {
  xSignature: string;
  xRequestId: string;
  dataId: string;
  secret: string;
}): boolean {
  const { xSignature, xRequestId, dataId, secret } = opts;
  if (!xSignature || !secret) return false;

  try {
    // x-signature: "ts=1699999999,v1=abcdef..."
    const parts: Record<string, string> = {};
    for (const seg of xSignature.split(',')) {
      const i = seg.indexOf('=');
      if (i > 0) parts[seg.slice(0, i).trim()] = seg.slice(i + 1).trim();
    }
    const ts = parts['ts'];
    const v1 = parts['v1'];
    if (!ts || !v1) return false;

    let manifest = '';
    if (dataId) manifest += `id:${String(dataId).toLowerCase()};`;
    if (xRequestId) manifest += `request-id:${xRequestId};`;
    manifest += `ts:${ts};`;

    const expected = createHmac('sha256', secret).update(manifest).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(v1, 'hex');
    if (a.length === 0 || a.length !== b.length) return false;

    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
