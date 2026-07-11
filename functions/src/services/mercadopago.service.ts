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
    reason: params.bauleraCodigo ? `Mi Container Baulera ${params.bauleraCodigo}` : `Mi Container Baulera ${params.m2}m2`,
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

// DETALLE de un pago para el webhook de cobros: monto/estado/fecha REALES + external_reference
// (= "MiContainer Baulera A2-010" o el reservationId). Sirve para registrar el cobro con el dato
// real (no el configurado) y para ubicar la reserva cuando data.id es el id del PAGO, no del preapproval.
export interface MpPaymentDetail { externalReference: string; amount: number; status: string; date: string; }
export async function getPaymentDetail(paymentId: string): Promise<MpPaymentDetail | null> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  try {
    const res = await fetch(`${MP_API_BASE}/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const d = await res.json() as { external_reference?: string; transaction_amount?: number; status?: string; date_approved?: string; date_created?: string };
    return {
      externalReference: d.external_reference ? String(d.external_reference) : '',
      amount: Number(d.transaction_amount) || 0,
      status: String(d.status || ''),
      date: String(d.date_approved || d.date_created || ''),
    };
  } catch { return null; }
}

// ULTIMO intento de cobro recurrente de una suscripcion (authorized_payments de MP). Sirve para
// detectar PAGOS RECHAZADOS: MP reintenta el debito durante el plazo de regularizacion y el intento
// queda en 'recycling' (o el payment interno en 'rejected'). Devuelve el intento mas reciente.
export interface MpChargeAttempt {
  status: string;      // estado del authorized_payment: scheduled | processed | recycling | ...
  payStatus: string;   // estado del payment interno: approved | rejected | ...
  payDetail: string;   // status_detail del payment (ej. cc_rejected_insufficient_amount)
  amount: number;
  date: string;        // date_created del intento
  retries?: number;    // reintentos (retry_attempt) si MP lo informa
}
export async function getLastChargeAttempt(preapprovalId: string): Promise<MpChargeAttempt | null> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  try {
    const res = await fetch(`${MP_API_BASE}/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const d = await res.json() as { results?: Array<Record<string, unknown>> };
    const rows = Array.isArray(d.results) ? d.results : [];
    if (!rows.length) return null;
    rows.sort((a, b) => String(b['date_created'] || '').localeCompare(String(a['date_created'] || '')));
    const r = rows[0];
    const pay = (r['payment'] as Record<string, unknown>) || {};
    return {
      status: String(r['status'] || ''),
      payStatus: String(pay['status'] || ''),
      payDetail: String(pay['status_detail'] || ''),
      amount: Number(r['transaction_amount']) || 0,
      date: String(r['date_created'] || r['last_modified'] || ''),
      retries: Number(r['retry_attempt']) || undefined,
    };
  } catch { return null; }
}

// Estado REAL de una suscripcion (preapproval). El webhook de subscription_preapproval NO trae el
// status en el body (MP manda solo {id}); hay que pedirselo a MP. Devuelve 'authorized' | 'paused'
// | 'pending' | 'cancelled' o null si no se pudo.
export async function getSubscriptionStatus(preapprovalId: string): Promise<string | null> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  try {
    const res = await fetch(`${MP_API_BASE}/preapproval/${encodeURIComponent(preapprovalId)}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const d = await res.json() as { status?: string };
    return d.status ? String(d.status) : null;
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

// Trae el ULTIMO COBRO REAL (summarized.last_charged_amount) + fecha del ultimo cambio
// (last_modified) SOLO de los ids dados (las que matchean, pocas) — NO de todas las suscripciones,
// para no saturar MP (eso desestabilizaba el matcheo). Devuelve un mapa id -> {lastCharged, lastModified}.
export async function getLastChargedMap(ids: string[]): Promise<Map<string, { lastCharged: number; lastModified: string; lastChargedDate: string }>> {
  const map = new Map<string, { lastCharged: number; lastModified: string; lastChargedDate: string }>();
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return map;
  const CONC = 3; // grupos chicos (3 por vez) para no saturar MP — tarda unos seg más pero es confiable
  for (let i = 0; i < ids.length; i += CONC) {
    const batch = ids.slice(i, i + CONC);
    await Promise.all(batch.map(async (id) => {
      try {
        const r = await fetch(`${MP_API_BASE}/preapproval/${encodeURIComponent(id)}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        if (!r.ok) return;
        const d = await r.json() as Record<string, unknown>;
        const sum = (d['summarized'] as Record<string, unknown>) || {};
        map.set(id, { lastCharged: Number(sum['last_charged_amount']) || 0, lastModified: String(d['last_modified'] || ''), lastChargedDate: String(sum['last_charged_date'] || '') });
      } catch { /* si falla, queda el configurado */ }
    }));
  }
  return map;
}


// Cache del snapshot de suscripciones. MP /preapproval/search devuelve el set de forma
// inconsistente entre llamadas seguidas -> sin cache el matcheo varía (riesgo de error de
// asignación entre el preview y el apply). Cache corto + dedup por id lo estabiliza.
let _subsCache: { at: number; data: MpSubscription[] } | null = null;
export function invalidateSubsCache(): void { _subsCache = null; }
export async function searchSubscriptionsCached(ttlMs = 120000): Promise<MpSubscription[]> {
  const now = Date.now();
  if (_subsCache && (now - _subsCache.at) < ttlMs) return _subsCache.data;
  // Traer por estado: authorized (~81) y pending (~25) entran en UNA página c/u (limit 100),
  // así no hay paginación que se corte por throttling de MP -> snapshot completo y estable.
  // (Antes se traía TODO —incl. ~60 cancelled— y paginaba, lo que devolvía sets incompletos.)
  const [auth, pend] = await Promise.all([searchSubscriptions('authorized'), searchSubscriptions('pending')]);
  const seen = new Set<string>();
  const unique = [...auth, ...pend].filter((s) => !!s.id && !seen.has(s.id) && !!seen.add(s.id)); // dedup por id
  _subsCache = { at: now, data: unique };
  return unique;
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
