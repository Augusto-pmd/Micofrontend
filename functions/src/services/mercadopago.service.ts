import { fetchWithTimeout } from '../utils/http';

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
  // Por defecto la idempotency key es el reservationId. Para REENVIAR un link de cobro sobre
  // la MISMA reserva (rebill) hay que pasar una key distinta, o MP devolvería la sub vieja.
  idempotencyKey?: string;
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
      'X-Idempotency-Key': params.idempotencyKey || params.reservationId,
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
  bauleraCodigo?: string;
}

// Pago UNICO (Checkout Pro) por el total de N meses. El cliente puede pagar por
// transferencia o tarjeta. Liga el pago a la reserva con external_reference con el
// marcador ONETIME (ruta SEPARADA de la suscripcion — no se cruzan ni en MP ni en el webhook).
export async function createCheckoutPreference(
  p: PreferenceParams
): Promise<{ preferenceId: string; initPoint: string }> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');

  const body = {
    items: [{ title: p.title, quantity: 1, unit_price: p.amount, currency_id: 'ARS' }],
    payer: { email: p.email },
    external_reference: p.bauleraCodigo ? `ONETIME MiContainer Baulera ${p.bauleraCodigo}` : `ONETIME ${p.reservationId}`,
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

// EXPIRA una preferencia de Checkout Pro: el link de pago único muere para quien lo abra después.
// Es el equivalente de cancelPlan para los pagos únicos (una preference no se puede "cancelar",
// pero sí vencer). Se usa al Dar de baja una venta de pago único que nunca se pagó (31/07: un solo
// link vivo por baulera, nunca dos cobrables a la vez).
export async function expirePreference(preferenceId: string): Promise<void> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');
  // Vencida hace 1 min, en el formato con offset que pide MP (-03:00 Argentina).
  const t = new Date(Date.now() - 60_000 - 3 * 3600_000); // hora local ART
  const pad = (n: number) => String(n).padStart(2, '0');
  const hasta = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}.000-03:00`;
  const res = await fetchWithTimeout(`${MP_API_BASE}/checkout/preferences/${encodeURIComponent(preferenceId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ expires: true, expiration_date_to: hasta }),
  }, 10000);
  if (!res.ok) { const txt = await res.text(); throw new Error(`MP preference expire ${res.status}: ${txt.slice(0, 200)}`); }
}

// PAGO ÚNICO de DEUDA (SPEC cobros-alineados §5). Checkout Pro por el monto adeudado, con
// external_reference "DEUDA <debtId>" para que el webhook sepa qué deuda marcar pagada. NO crea
// suscripción (la suscripción del cliente sigue viva sola, MP la recobra el mes siguiente).
export async function createDebtPreference(p: {
  debtId: string; title: string; amount: number; email: string; backUrl: string;
}): Promise<{ preferenceId: string; initPoint: string }> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');
  const body = {
    items: [{ title: p.title, quantity: 1, unit_price: p.amount, currency_id: 'ARS' }],
    payer: { email: p.email },
    external_reference: `DEUDA ${p.debtId}`,
    back_urls: { success: p.backUrl, pending: p.backUrl, failure: p.backUrl },
    auto_return: 'approved',
  };
  const res = await fetch(`${MP_API_BASE}/checkout/preferences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'X-Idempotency-Key': p.debtId },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MP debt preference ${res.status}: ${text.slice(0, 200)}`);
  const d = JSON.parse(text) as { id?: string; init_point?: string };
  if (!d.id || !d.init_point) throw new Error(`MP debt preference sin id/init_point: ${text.slice(0, 200)}`);
  return { preferenceId: d.id, initPoint: d.init_point };
}

// PAGO ÚNICO de ALINEACIÓN ("gap") para MES GRATIS (SPEC cobros-alineados §4, decisión Lucas):
// como no se puede prorratear + mes gratis en una sola suscripción, la venta con mes gratis usa
// 2 links: (1) la suscripción/plan con free_trial hasta el 1° (queda anexada la cuenta) y (2) este
// pago único que cobra SOLO los días de diferencia (gap) para que el neto gratis sea 1 mes exacto.
// external_reference "GAP <reservationId>" → el webhook lo registra sin activar (activa la sub).
export async function createGapPreference(p: {
  reservationId: string; title: string; amount: number; email: string; backUrl: string;
}): Promise<{ preferenceId: string; initPoint: string }> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');
  const body = {
    items: [{ title: p.title, quantity: 1, unit_price: p.amount, currency_id: 'ARS' }],
    payer: { email: p.email },
    external_reference: `GAP ${p.reservationId}`,
    back_urls: { success: p.backUrl, pending: p.backUrl, failure: p.backUrl },
    auto_return: 'approved',
  };
  const res = await fetch(`${MP_API_BASE}/checkout/preferences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'X-Idempotency-Key': `gap-${p.reservationId}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MP gap preference ${res.status}: ${text.slice(0, 200)}`);
  const d = JSON.parse(text) as { id?: string; init_point?: string };
  if (!d.id || !d.init_point) throw new Error(`MP gap preference sin id/init_point: ${text.slice(0, 200)}`);
  return { preferenceId: d.id, initPoint: d.init_point };
}

// (getPaymentExternalReference ELIMINADA 12/07: 0 usos — superada por getPaymentDetail.)

// DETALLE de un pago para el webhook de cobros: monto/estado/fecha REALES + external_reference
// (= "MiContainer Baulera A2-010" o el reservationId). Sirve para registrar el cobro con el dato
// real (no el configurado) y para ubicar la reserva cuando data.id es el id del PAGO, no del preapproval.
export interface MpPaymentDetail { externalReference: string; amount: number; status: string; date: string; }
export async function getPaymentDetail(paymentId: string): Promise<MpPaymentDetail | null> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  try {
    const res = await fetchWithTimeout(`${MP_API_BASE}/v1/payments/${paymentId}`, {
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

// PLAN de suscripcion (preapproval_plan) con MES GRATIS (free_trial). Se crea 1 vez por medida
// y su init_point es el LINK DEL PLAN que se comparte al cliente (paga en la pagina de MP,
// sin tokenizacion). Ver docs/referencia/mercadopago-planes.md §1.5.
export interface MpPlanCreated { planId: string; initPoint: string; }
export type FreeTrialUnit = 'days' | 'months';
// billingDay (SPEC cobros-alineados §4, spike 13/07): el plan cobra ese día fijo del mes y MP
// PRORRATEA solo el primer cobro (billing_day_proportional) — verificado con prueba real:
// devuelve transaction_amount_proportional calculado. free_trial + billing_day conviven.
export async function createPlan(params: { m2: number; amount: number; freeTrialQty?: number; freeTrialUnit?: FreeTrialUnit; billingDay?: number; bauleraCodigo?: string }): Promise<MpPlanCreated> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');
  const q = Number(params.freeTrialQty) || 0;
  const unit: FreeTrialUnit = params.freeTrialUnit === 'days' ? 'days' : 'months';
  const unidad = unit === 'days' ? (q > 1 ? 'dias' : 'dia') : (q > 1 ? 'meses' : 'mes');
  // TÍTULO con el CÓDIGO de baulera (plan por baulera, 30/07): la suscripción HEREDA este título,
  // así el cliente ve SU baulera en el checkout. Como cada baulera tiene su propio plan, el código
  // nunca es el de otra. Si no viene código (fallback), queda genérico por medida.
  //
  // ⚠️ MP LIMITA `reason` A 60 CARACTERES (spike 29/07: 400 "Reason has more than 60 characters").
  // El formato largo "Mi Container Baulera A3-050 (1.5m2) (33 dias gratis) - cierra el 1" daba 66 y
  // MP rechazaba TODA venta con mes/días gratis (las sin trial daban 49 y pasaban). FORMATO
  // DECIDIDO POR LUCAS (29/07): se saca "Mi Container" (redundante: la cuenta ya es la nuestra) y el
  // sufijo " - cierra el 1". Queda CÓDIGO + METRAJE ADELANTE, que es lo que el cliente necesita ver
  // y lo que sobrevive al recorte visual del panel de MP:
  //   "Baulera A3-050 1.5m2 (33 dias gratis)" = 37 caracteres.
  // El METRAJE se conserva sí o sí porque planM2 (admin/pricing.ts) lo deduce del reason cuando el
  // plan no tiene doc local — sin eso, Tarifas queda ciega para esos planes.
  const cod = String(params.bauleraCodigo || '').trim();
  const reason = (`Baulera ${cod ? `${cod} ${params.m2}m2` : `${params.m2}m2`}` +
    (q > 0 ? ` (${q} ${unidad} gratis)` : '')).slice(0, 60); // el slice es el cinturón: MP nunca 400 por largo
  const autoRecurring: Record<string, unknown> = {
    frequency: 1,
    frequency_type: 'months',
    transaction_amount: params.amount,
    currency_id: 'ARS',
  };
  if (q > 0) autoRecurring['free_trial'] = { frequency: q, frequency_type: unit };
  if (params.billingDay) {
    autoRecurring['billing_day'] = params.billingDay;
    // PROPORCIONAL SIEMPRE (decisión Lucas 31/07). MP prorratea el PRIMER cobro para alinearlo al
    // billing_day y de ahí en más cobra el mes completo ese día:
    //  - Entrada paga (sin trial): cobra los días desde hoy hasta el 1° al autorizar.
    //  - Mes gratis (con trial): al terminar el trial cobra SOLO los días que faltan hasta el 1°.
    //    Ej: venta 31/07 + 15 días gratis → gratis hasta el 15/08 → proporcional 15/08→1/09 → 1/09
    //    y todos los 1°, mes completo.
    // Iba en FALSE con trial hasta el 31/07 porque esos mismos días los cobraba un SEGUNDO LINK de
    // pago único (el "gap") y salía cobrado dos veces. Ese segundo link ya no se genera, así que el
    // proporcional nativo de MP es ahora el único que cobra la entrada. Verificado en PROD el 14/07
    // (plan d45bbc07) que MP además lo AUTO-SETEA en true cuando mandás billing_day.
    autoRecurring['billing_day_proportional'] = true;
  }
  const body = {
    reason,
    auto_recurring: autoRecurring,
    back_url: 'https://micontainer.com/#/portal',
  };
  const res = await fetch(`${MP_API_BASE}/preapproval_plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MP plan ${res.status}: ${text.slice(0, 200)}`);
  let d: { id?: string; init_point?: string };
  try { d = JSON.parse(text); } catch { throw new Error(`MP plan invalid JSON: ${text.slice(0, 200)}`); }
  if (!d.id || !d.init_point) throw new Error(`MP plan sin id/init_point: ${text.slice(0, 200)}`);
  return { planId: d.id, initPoint: d.init_point };
}

// Actualiza monto + alineación al día fijo de un plan (upgrade de planes viejos sin billing_day
// y reprice de los alineados). Spike 13/07: el PUT de monto solo CONSERVA billing_day; acá lo
// mandamos explícito igual para poder "subir de nivel" un plan viejo. Fallback: monto solo.
export async function updatePlanBilling(planId: string, amount: number, billingDay = 1, proportional = true): Promise<void> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');
  // proportional SOLO en entrada paga (sin trial). Con MES GRATIS va FALSE EXPLÍCITO: MP lo
  // auto-setea true por default cuando hay billing_day (verificado en prod 14/07) — omitirlo
  // no alcanza, y si queda true el gap se cobraría por duplicado (MP prorratea + nuestro link 2).
  const ar: Record<string, unknown> = { transaction_amount: amount, currency_id: 'ARS', billing_day: billingDay, billing_day_proportional: proportional };
  const full = await fetch(`${MP_API_BASE}/preapproval_plan/${encodeURIComponent(planId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ auto_recurring: ar }),
  });
  if (full.ok) return;
  const t = await full.text();
  console.warn(`[MP] updatePlanBilling full-PUT fallo (${full.status}): ${t.slice(0, 160)} -> reintento solo monto`);
  await updatePlanAmount(planId, amount);
}

// Actualiza el monto de un plan (cuando cambia la tarifa de la medida).
export async function updatePlanAmount(planId: string, amount: number): Promise<void> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');
  // Con TIMEOUT (31/07): el reprice llama a esta función en serie, una vez por plan, dentro de una
  // función que corta a los 60s. Con `fetch` pelado, UNA conexión colgada con MP se comía el
  // presupuesto entero y el cambio de tarifa moría a mitad de camino.
  const res = await fetchWithTimeout(`${MP_API_BASE}/preapproval_plan/${encodeURIComponent(planId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ auto_recurring: { transaction_amount: amount, currency_id: 'ARS' } }),
  }, 10000);
  if (!res.ok) { const t = await res.text(); throw new Error(`MP plan update ${res.status}: ${t.slice(0, 200)}`); }
}

// Cancela un PLAN: su link muere para FUTUROS suscriptos. Los YA suscriptos no se tocan
// (sus preapprovals siguen cobrando normal).
export async function cancelPlan(planId: string): Promise<void> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');
  const res = await fetch(`${MP_API_BASE}/preapproval_plan/${encodeURIComponent(planId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ status: 'cancelled' }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`MP plan cancel ${res.status}: ${t.slice(0, 200)}`); }
}

// Detalle de un preapproval — para CASAR una sub creada via LINK de plan con su venta pendiente.
export interface MpPreapprovalDetail { status: string; planId: string; externalReference: string; payerEmail: string; payerId: string; }
export async function getPreapprovalDetail(preapprovalId: string): Promise<MpPreapprovalDetail | null> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  try {
    const res = await fetchWithTimeout(`${MP_API_BASE}/preapproval/${encodeURIComponent(preapprovalId)}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const d = await res.json() as Record<string, unknown>;
    return {
      status: String(d['status'] || ''),
      planId: String(d['preapproval_plan_id'] || ''),
      externalReference: String(d['external_reference'] || ''),
      payerEmail: String(d['payer_email'] || ''),
      payerId: String(d['payer_id'] || ''),
    };
  } catch { return null; }
}

// Estampa el external_reference (codigo de baulera) en una sub YA creada (las de link de plan
// nacen sin el). Si MP no lo permite, devuelve false y el matcheo queda por mpPreapprovalId.
export async function setPreapprovalExternalReference(preapprovalId: string, ref: string): Promise<boolean> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return false;
  try {
    const res = await fetchWithTimeout(`${MP_API_BASE}/preapproval/${encodeURIComponent(preapprovalId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ external_reference: ref }),
    });
    return res.ok;
  } catch { return false; }
}

// HISTORIAL REAL de cobros de una suscripcion (para el portal del cliente). Trae todos los
// authorized_payments y los mapea a {period, date, amount, status}. status: 'approved' (cobrado) /
// 'rejected' (rebotado / en reintento) / 'pending'. Cache 5 min por preapproval para no pegarle a
// MP en cada refresh del cliente.
export interface MpCharge { period: string; date: string; amount: number; status: 'approved' | 'rejected' | 'pending'; }
const _histCache = new Map<string, { at: number; data: MpCharge[] }>();
export async function getChargeHistory(preapprovalId: string): Promise<MpCharge[]> {
  const cached = _histCache.get(preapprovalId);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.data;
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return [];
  try {
    const res = await fetch(`${MP_API_BASE}/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const d = await res.json() as { results?: Array<Record<string, unknown>> };
    const rows = Array.isArray(d.results) ? d.results : [];
    const out: MpCharge[] = rows.map((r) => {
      const pay = (r['payment'] as Record<string, unknown>) || {};
      const payStatus = String(pay['status'] || '');
      const attempt = String(r['status'] || '');
      const date = String(r['date_created'] || r['last_modified'] || '');
      let status: MpCharge['status'] = 'pending';
      if (payStatus === 'approved') status = 'approved';
      else if (payStatus === 'rejected' || attempt === 'recycling') status = 'rejected';
      return { period: date.slice(0, 7), date, amount: Number(r['transaction_amount']) || 0, status };
    }).filter((c) => c.period);
    out.sort((a, b) => b.date.localeCompare(a.date));
    const trimmed = out.slice(0, 12);
    _histCache.set(preapprovalId, { at: Date.now(), data: trimmed });
    return trimmed;
  } catch { return []; }
}

// Estado REAL de una suscripcion (preapproval). El webhook de subscription_preapproval NO trae el
// status en el body (MP manda solo {id}); hay que pedirselo a MP. Devuelve 'authorized' | 'paused'
// | 'pending' | 'cancelled' o null si no se pudo.
export async function getSubscriptionStatus(preapprovalId: string): Promise<string | null> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  try {
    const res = await fetchWithTimeout(`${MP_API_BASE}/preapproval/${encodeURIComponent(preapprovalId)}`, {
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
  planId?: string;           // preapproval_plan_id: presente si la sub NACIÓ de un plan (mes gratis)
  dateCreated?: string;      // date_created: para barrer pendings viejas (checkouts abandonados)
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
        lastModified: String(r['last_modified'] ?? ''), // fecha del ultimo cambio de la sub (para reconciliar)
        planId: String(r['preapproval_plan_id'] ?? ''), // no-vacío = la sub nació de un plan (mes gratis)
        dateCreated: String(r['date_created'] ?? ''),
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

export interface MpPlan { id: string; reason: string; status: string; amount: number; trial: string; initPoint: string; }

// Lista los planes de suscripcion (preapproval_plan) de la cuenta, con su MONTO REAL
// (auto_recurring.transaction_amount) para poder compararlo contra la tarifa vigente.
//
// PAGINA (31/07). Antes pedía UNA sola página de 100 y devolvía eso: los planes que quedaban afuera
// NO se sincronizaban y el endpoint respondía OK igual, así que un plan de un cliente activo podía
// quedarse con el precio viejo sin que nadie se enterara. Con un plan por venta (decisión 30/07) la
// cuenta de MP suma un plan por cada click de Vender, así que pasar de 100 es cuestión de tiempo.
// Ahora recorre las páginas que hagan falta y CACHEA el resultado, para no pegarle a MP de nuevo en
// cada pantalla que lo use.
const MAX_PAGINAS_PLANES = 20; // 2000 planes; tope de seguridad para que un bug no cicle para siempre
let _plansCache: { at: number; data: MpPlan[] } | null = null;
export function invalidatePlansCache(): void { _plansCache = null; }

export async function searchPlans(ttlMs = 120000): Promise<MpPlan[]> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');
  const now = Date.now();
  if (_plansCache && (now - _plansCache.at) < ttlMs) return _plansCache.data;
  const out: MpPlan[] = [];
  const vistos = new Set<string>();
  try {
    for (let pagina = 0; pagina < MAX_PAGINAS_PLANES; pagina++) {
      const res = await fetch(`${MP_API_BASE}/preapproval_plan/search?limit=100&offset=${pagina * 100}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      // Si una página falla, devolvemos lo que ya juntamos en vez de perder todo: es mejor un
      // resultado parcial que un [] silencioso (que es lo que hacía antes con cualquier error).
      if (!res.ok) break;
      const data = await res.json() as { results?: Array<Record<string, unknown>> };
      const rows = data.results || [];
      for (const r of rows) {
        const ar = (r['auto_recurring'] as Record<string, unknown>) || {};
        const ft = ar['free_trial'] as Record<string, unknown> | undefined;
        const id = String(r['id'] ?? '');
        if (!id || vistos.has(id)) continue; // dedup por si una página se solapa
        vistos.add(id);
        out.push({
          id,
          reason: String(r['reason'] ?? ''),
          status: String(r['status'] ?? ''),
          amount: Number(ar['transaction_amount']) || 0,
          trial: ft ? `${Number(ft['frequency']) || ''} ${String(ft['frequency_type'] || '')}`.trim() : '',
          initPoint: String(r['init_point'] ?? ''),
        });
      }
      if (rows.length < 100) break; // última página
    }
  } catch { /* nos quedamos con lo juntado hasta acá */ }
  _plansCache = { at: now, data: out };
  return out;
}
