const MP_API_BASE = 'https://api.mercadopago.com';

interface CreateSubscriptionParams {
  reservationId: string;
  categoryLabel: string;
  m2: number;
  amount: number;
  email: string;
  backUrl: string;
  freeTrialMonths?: number;
  bauleraCodigo?: string;
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
    // external_reference con el CODIGO de baulera (ej "MiContainer Baulera A2-010") para
    // poder matchear la suscripcion <-> baulera despues (MP no expone el email). Si no hay
    // baulera puntual todavia, usa el reservationId (no rompe el matcheo por codigo).
    external_reference: params.bauleraCodigo ? `MiContainer Baulera ${params.bauleraCodigo}` : params.reservationId,
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


export interface MpSubscription {
  id: string;
  payerEmail: string;
  externalReference: string;
  reason: string;
  amount: number;            // monto CONFIGURADO (auto_recurring.transaction_amount) — puede no haberse cobrado
  status: string;
  lastCharged?: number;      // ULTIMO COBRO REAL (summarized.last_charged_amount)
  lastChargedDate?: string;
  lastModified?: string;     // fecha del ultimo cambio de la suscripcion (last_modified) — incluye cambios de monto
}

// Trae TODAS las suscripciones (preapprovals) de la cuenta con el status dado,
// paginando /preapproval/search. Fuente completa: incluye las creadas por el
// sistema (preapproval) Y las creadas a mano fuera del sistema.
export async function searchSubscriptions(status?: string): Promise<MpSubscription[]> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');
  const out: MpSubscription[] = [];
  const limit = 100;
  let offset = 0;
  for (let page = 0; page < 50; page++) {
    const sq = status ? `status=${encodeURIComponent(status)}&` : '';
    const url = `${MP_API_BASE}/preapproval/search?${sq}limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`MP search ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = await res.json() as { results?: Array<Record<string, unknown>>; paging?: { total?: number } };
    const results = data.results || [];
    for (const r of results) {
      const ar = (r['auto_recurring'] as Record<string, unknown>) || {};
      const payer = (r['payer'] as Record<string, unknown>) || {};
      out.push({
        id: String(r['id'] ?? ''),
        payerEmail: String(r['payer_email'] ?? payer['email'] ?? ''),
        externalReference: String(r['external_reference'] ?? ''),
        reason: String(r['reason'] ?? ''),
        amount: Number(ar['transaction_amount']) || 0,
        status: String(r['status'] ?? ''),
      });
    }
    offset += limit;
    const total = data.paging?.total ?? 0;
    if (results.length < limit || offset >= total) break;
  }
  return out;
}

// Completa el ULTIMO COBRO REAL de cada suscripcion (summarized.last_charged_amount del
// detalle GET /preapproval/{id}). El /search solo trae el monto configurado. Concurrencia acotada.
export async function enrichLastCharged(subs: MpSubscription[]): Promise<void> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return;
  const CONC = 8;
  for (let i = 0; i < subs.length; i += CONC) {
    const batch = subs.slice(i, i + CONC);
    await Promise.all(batch.map(async (s) => {
      try {
        const r = await fetch(`${MP_API_BASE}/preapproval/${encodeURIComponent(s.id)}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        if (!r.ok) return;
        const d = await r.json() as Record<string, unknown>;
        const sum = (d['summarized'] as Record<string, unknown>) || {};
        s.lastCharged = Number(sum['last_charged_amount']) || 0;
        s.lastChargedDate = String(sum['last_charged_date'] || '');
        s.lastModified = String(d['last_modified'] || '');
      } catch { /* si falla, queda sin ultimo cobro y cae al monto configurado */ }
    }));
  }
}


export interface MpPlan { id: string; reason: string; status: string; }

// Lista los planes de suscripcion (preapproval_plan) de la cuenta.
export async function searchPlans(): Promise<MpPlan[]> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');
  try {
    const res = await fetch(`${MP_API_BASE}/preapproval_plan/search?limit=100`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: Array<Record<string, unknown>> };
    return (data.results || []).map((r) => ({
      id: String(r['id'] ?? ''),
      reason: String(r['reason'] ?? ''),
      status: String(r['status'] ?? ''),
    }));
  } catch { return []; }
}
