const MP_API_BASE = 'https://api.mercadopago.com';

interface CreateSubscriptionParams {
  reservationId: string;
  categoryLabel: string;
  m2: number;
  amount: number;
  email: string;
  backUrl: string;
  freeTrialMonths?: number;
}

interface CreateSubscriptionResult {
  preapprovalId: string;
  initPoint: string;
}

export async function createSubscription(
  params: CreateSubscriptionParams
): Promise<CreateSubscriptionResult> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');

  const autoRecurring: Record<string, unknown> = {
    frequency: 1,
    frequency_type: 'months',
    transaction_amount: params.amount,
    currency_id: 'ARS',
  };
  if (params.freeTrialMonths && params.freeTrialMonths > 0) {
    // Mes(es) gratis: diferimos el primer cobro N meses con start_date. El cliente
    // autoriza hoy (no paga nada) y el primer debito cae dentro de N meses al monto real.
    const trialUntil = new Date();
    trialUntil.setMonth(trialUntil.getMonth() + params.freeTrialMonths);
    autoRecurring.start_date = trialUntil.toISOString();
  }

  const body = {
    reason: `Mi Container Baulera ${params.m2}m2`,
    auto_recurring: autoRecurring,
    payer_email: params.email,
    back_url: params.backUrl,
    status: 'pending',
  };

  console.log('[MP] Creating preapproval:', JSON.stringify({ ...body, payer_email: '***' }));

  const res = await fetch(`${MP_API_BASE}/preapproval`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-Idempotency-Key': params.reservationId,
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  console.log(`[MP] Status: ${res.status}, Body: ${rawText.slice(0, 500)}`);

  if (!res.ok) {
    let detail = rawText;
    try { detail = JSON.parse(rawText)?.message || rawText; } catch { /* keep raw */ }
    throw new Error(`MP ${res.status}: ${detail}`);
  }

  let data: { id?: string; init_point?: string };
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`MP returned invalid JSON: ${rawText.slice(0, 200)}`);
  }

  if (!data.id || !data.init_point) {
    throw new Error(`MP response missing id/init_point: ${rawText.slice(0, 200)}`);
  }

  return {
    preapprovalId: data.id,
    initPoint: data.init_point,
  };
}

export async function cancelSubscription(preapprovalId: string): Promise<void> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');

  const res = await fetch(`${MP_API_BASE}/preapproval/${preapprovalId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ status: 'cancelled' }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MP cancel error ${res.status}: ${text.slice(0, 200)}`);
  }
}

// Cambia el monto de una suscripcion activa (cambio de valor a clientes ya alquilados).
export async function updateSubscriptionAmount(preapprovalId: string, newAmount: number): Promise<void> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');
  const res = await fetch(`${MP_API_BASE}/preapproval/${preapprovalId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ auto_recurring: { transaction_amount: newAmount, currency_id: 'ARS' } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MP update amount ${res.status}: ${text.slice(0, 200)}`);
  }
}

interface PreferenceParams {
  reservationId: string;
  title: string;
  amount: number;
  email: string;
  backUrl: string;
}

// Pago UNICO (Checkout Pro) por el total de N meses. El cliente puede pagar por
// transferencia o tarjeta. Liga el pago a la reserva con external_reference.
export async function createCheckoutPreference(
  p: PreferenceParams
): Promise<{ preferenceId: string; initPoint: string }> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');

  const body = {
    items: [{ title: p.title, quantity: 1, unit_price: p.amount, currency_id: 'ARS' }],
    payer: { email: p.email },
    external_reference: p.reservationId,
    back_urls: { success: p.backUrl, pending: p.backUrl, failure: p.backUrl },
    auto_return: 'approved',
  };

  const res = await fetch(`${MP_API_BASE}/checkout/preferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-Idempotency-Key': p.reservationId,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MP preference ${res.status}: ${text.slice(0, 200)}`);
  let d: { id?: string; init_point?: string };
  try { d = JSON.parse(text); } catch { throw new Error(`MP preference invalid JSON: ${text.slice(0, 200)}`); }
  if (!d.id || !d.init_point) throw new Error(`MP preference missing id/init_point: ${text.slice(0, 200)}`);
  return { preferenceId: d.id, initPoint: d.init_point };
}

// Dado un payment id, devuelve su external_reference (= reservationId) para ubicar la reserva.
export async function getPaymentExternalReference(paymentId: string): Promise<string | null> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  try {
    const res = await fetch(`${MP_API_BASE}/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const d = await res.json() as { external_reference?: string; status?: string };
    if (d.status && d.status !== 'approved') return null;
    return d.external_reference ? String(d.external_reference) : null;
  } catch { return null; }
}
