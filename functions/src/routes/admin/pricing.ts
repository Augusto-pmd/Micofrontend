import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';
import { requireStaff } from '../../middleware/requireStaff';
import { getPricingByM2 } from '../../services/pricing.service';
import { FieldValue } from 'firebase-admin/firestore';
import { updateSubscriptionAmount, searchSubscriptions, searchSubscriptionsCached, invalidateSubsCache, getLastChargedMap, getLastChargeAttempt, searchPlans, MpSubscription } from '../../services/mercadopago.service';
import { logAudit } from '../../services/audit.service';

export const pricingRouter = Router();

const PRICING_DOC = 'config';
const PRICING_COLLECTION = 'pricingEngine';

// GET /pricing-engine
pricingRouter.get('/', verifyToken, async (_req: Request, res: Response) => {
  try {
    const doc = await db.collection(PRICING_COLLECTION).doc(PRICING_DOC).get();
    if (!doc.exists) {
      res.json({ basePrice: 0, pricePerM2: 0, discounts: [], updatedAt: null });
      return;
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error('GET /pricing-engine error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /pricing-engine
pricingRouter.put('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, updatedAt: now };
    await db.collection(PRICING_COLLECTION).doc(PRICING_DOC).set(data, { merge: true });
    const updated = await db.collection(PRICING_COLLECTION).doc(PRICING_DOC).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    console.error('PUT /pricing-engine error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /pricing-engine/room/:id — override de precio por baulera (priceOverride / lockPrice)
pricingRouter.put('/room/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { priceOverride, lockPrice } = req.body as { priceOverride?: number | null; lockPrice?: boolean };
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (priceOverride === null || priceOverride === undefined || (priceOverride as unknown) === '') {
      patch.priceOverride = null;
    } else {
      const n = Number(priceOverride);
      patch.priceOverride = Number.isFinite(n) && n > 0 ? n : null;
    }
    if (lockPrice !== undefined) patch.lockPrice = !!lockPrice;
    await db.collection('storageRooms').doc(id).set(patch, { merge: true });
    const updated = await db.collection('storageRooms').doc(id).get();
    res.json({ id, ...updated.data() });
  } catch (err) {
    console.error('PUT /pricing-engine/room error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /pricing-engine/branch/:branchId — tabla de precios por medida de una sucursal
pricingRouter.get('/branch/:branchId', verifyToken, async (req: Request, res: Response) => {
  try {
    const byM2 = await getPricingByM2(req.params.branchId);
    res.json({ branchId: req.params.branchId, byM2 });
  } catch (err) {
    console.error('GET /pricing-engine/branch error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /pricing-engine/branch/:branchId — guardar precios por medida de una sucursal
pricingRouter.put('/branch/:branchId', verifyToken, async (req: Request, res: Response) => {
  try {
    const { byM2, effectiveDate } = req.body as { byM2?: Record<string, number>; effectiveDate?: string };
    const today = new Date().toISOString().slice(0, 10);
    if (effectiveDate && String(effectiveDate) > today) {
      await db.collection('pricing').doc(req.params.branchId).set(
        { scheduled: FieldValue.arrayUnion({ effectiveDate, byM2: byM2 || {} }), updatedAt: today }, { merge: true });
    } else {
      await db.collection('pricing').doc(req.params.branchId).set(
        { byM2: byM2 || {}, updatedAt: today }, { merge: true });
    }
    const merged = await getPricingByM2(req.params.branchId);
    res.json({ branchId: req.params.branchId, byM2: merged, effectiveDate: effectiveDate || today });
  } catch (err) {
    console.error('PUT /pricing-engine/branch error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// ============================================================================
// Cambio de valor a suscripciones EXISTENTES (clientes ya alquilados) - HIBRIDO
// Fuente de suscripciones: Mercado Pago (/preapproval/search) => TODAS las activas.
// Fuente de MEDIDA (quien alquila que medida): la ASIGNACION real en la base
// (reservations para online/Vender; reservationOrders + customers para los
// cargados a mano/sync). Se linkea la suscripcion MP con el cliente por EMAIL.
// NO se matchea por monto: dos medidas pueden tener el mismo precio, y un
// cliente puede estar a un precio viejo. Dedup por preapprovalId (1 sub = 1 cambio).
// Solo cambia montos de suscripciones que YA existen; nunca crea cobros ni reasigna.
// Protegido con requireStaff.
// ============================================================================

interface ResLite { reservationId: string; m2: number; customerName: string; customerEmail: string; monthly: number; }
interface RentedUnit { m2: number; name: string; email: string; dni: string; monthly: number; code: string; }
interface Target {
  id: string;              // preapprovalId (unico)
  cliente: string;
  email: string;
  actual: number;          // ULTIMO COBRO REAL de MP (summarized.last_charged_amount), NO el precio web
  actualFecha?: string;    // fecha del ULTIMO COBRO real (summarized.last_charged_date)
  sinCobro?: boolean;      // true = nunca se cobro; "actual" es el configurado, no un cobro real
  configurado: number;     // monto configurado hoy en MP. Si === nuevo => NO se toca ni se notifica
  desde?: string;          // fecha del ultimo CAMBIO de la suscripcion en MP (last_modified)
  nuevo: number;
  origen: 'sistema' | 'mp';
  reservationId: string | null;
  m2: number;
}
interface NoMatch { name: string; email: string; dni: string; monthly: number; motivo: string; }

async function notifyPriceChange(to: string, name: string, oldAmount: number, newAmount: number): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return;
  const from = process.env.RESEND_FROM || 'Mi Container <comercial@micontainer.com>';
  const fmt = (n: number) => '$' + Number(n).toLocaleString('es-AR');
  const html = `<p>Hola ${name || ''},</p>`
    + `<p>Te informamos que el valor de tu alquiler en Mi Container se actualizara de <b>${fmt(oldAmount)}</b> a <b>${fmt(newAmount)}</b> por mes, a partir de tu proximo cobro.</p>`
    + `<p>Ante cualquier duda, escribinos. Gracias por elegirnos.</p>`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: [to], subject: 'Actualizacion de tu suscripcion - Mi Container', html }),
    });
  } catch { /* no romper el flujo por un mail */ }
}

// Mapa preapprovalId -> reserva activa del sistema (online/Vender).
async function buildReservationMap(): Promise<Map<string, ResLite>> {
  const snap = await db.collection('reservations').where('status', '==', 'active').get();
  const map = new Map<string, ResLite>();
  snap.forEach((d) => {
    const r = d.data() as Record<string, unknown>;
    const pid = r['mpPreapprovalId'];
    if (pid && r['mpSubscriptionStatus'] !== 'cancelled') {
      map.set(String(pid), {
        reservationId: d.id,
        m2: Number(r['m2']) || 0,
        customerName: String(r['customerName'] || ''),
        customerEmail: String(r['customerEmail'] || ''),
        monthly: Number(r['monthly']) || 0,
      });
    }
  });
  return map;
}

// Mapa reservationId -> código de baulera. Resuelve suscripciones cuyo external_reference es el
// reservationId ("MC-XXXX") en vez del código, para matchear igual por código de baulera.
async function buildResIdToCodeMap(): Promise<Map<string, string>> {
  const snap = await db.collection('reservations').get();
  const map = new Map<string, string>();
  snap.forEach((d) => {
    const r = d.data() as Record<string, unknown>;
    const code = String(r['bauleraCodigo'] || String(r['storageRoomId'] || '').split('__').pop() || '').trim();
    if (code) map.set(d.id, code);
  });
  return map;
}

// Unidades alquiladas segun la asignacion real (reservationOrders + customers por email).
// La MEDIDA sale de storageRooms (misma fuente que la tabla de Tarifas), unida por
// storageRoomId. Asi cada baulera usa su medida REAL de inventario y no el m2 mal
// tipeado del detalle de facturacion (ej: 5.10 vs 5.00). 8 sigue siendo 8 y 8.1 = 8.1.
async function buildRentedUnits(): Promise<RentedUnit[]> {
  // customers: indices para linkear el email por varias vias (id, contrato, dni, nombre).
  const custSnap = await db.collection('customers').get();
  const emailById = new Map<string, string>();
  const emailByContract = new Map<string, string>();
  const emailByName = new Map<string, string>();
  const emailByDni = new Map<string, string>();
  const dniById = new Map<string, string>();
  custSnap.forEach((d) => {
    const c = d.data() as Record<string, unknown>;
    const email = String(c['email'] || '').trim().toLowerCase();
    const dni = String(c['dni'] || '').replace(/[^0-9]/g, '');
    if (dni) dniById.set(d.id, dni);
    if (!email) return;
    emailById.set(d.id, email);
    const cn = c['contractNumber'];
    if (cn) emailByContract.set(String(cn), email);
    (Array.isArray(c['contractNumbers']) ? c['contractNumbers'] as unknown[] : [])
      .forEach((x) => emailByContract.set(String(x), email));
    const nm = String(c['fullName'] || '').trim().toLowerCase();
    if (nm) emailByName.set(nm, email);
    if (dni) emailByDni.set(dni, email);
  });
  // storageRoomId -> customerId (desde ordenes)
  const custByRoom = new Map<string, string>();
  const ordSnap = await db.collection('reservationOrders').get();
  ordSnap.forEach((d) => {
    const o = d.data() as Record<string, unknown>;
    const rid = String(o['storageRoomId'] || '');
    const cid = String(o['customerId'] || '');
    if (rid && cid) custByRoom.set(rid, cid);
  });
  // Inventario REAL: bauleras OCUPADAS (fuente de que esta alquilado).
  const roomSnap = await db.collection('storageRooms').where('status', '==', 'occupied').get();
  const units: RentedUnit[] = [];
  roomSnap.forEach((d) => {
    const r = d.data() as Record<string, unknown>;
    const m2 = Number(r['areaM2']) || 0;
    if (!m2) return;
    const name = String(r['currentTenant'] || '');
    const cn = r['contractNumber'] ? String(r['contractNumber']) : '';
    const cid = custByRoom.get(d.id);
    // Email: primero el que quedo en la baulera; si no, por orden/contrato/dni/nombre.
    const roomEmail = String(r['tenantEmail'] || '').trim().toLowerCase();
    const roomDni = String(r['tenantDni'] || '').replace(/[^0-9]/g, '');
    const dni = roomDni || (cid ? dniById.get(cid) || '' : '');
    let email = roomEmail;
    if (!email && cid) email = emailById.get(cid) || '';
    if (!email && cn) email = emailByContract.get(cn) || '';
    if (!email && dni) email = emailByDni.get(dni) || '';
    if (!email && name) email = emailByName.get(name.trim().toLowerCase()) || '';
    units.push({ m2, name, email, dni, monthly: Number(r['price']) || 0, code: String(r['space'] || r['name'] || '') });
  });
  return units;
}

// Arma targets de UNA medida. usedSub se comparte entre medidas (dedup global).
function computeMeasure(
  subs: MpSubscription[], resMap: Map<string, ResLite>, units: RentedUnit[],
  m2: number, newAmount: number, usedSub: Set<string>, resIdToCode: Map<string, string>,
): { targets: Target[]; noMatch: NoMatch[] } {
  const targets: Target[] = [];
  const noMatch: NoMatch[] = [];
  // "actual" = ULTIMO COBRO REAL (lastCharged). Si nunca se cobro, cae al configurado y marca sinCobro.
  const realAmount = (s: MpSubscription) => (s.lastCharged && s.lastCharged > 0) ? s.lastCharged : s.amount;
  const noCharge = (s: MpSubscription) => !(s.lastCharged && s.lastCharged > 0);

  // 1) Suscripciones del sistema (reservations) con m2 === medida => confiable.
  for (const s of subs) {
    if (!s.id || usedSub.has(s.id)) continue;
    const res = resMap.get(s.id);
    if (res && res.m2 === m2) {
      usedSub.add(s.id);
      targets.push({
        id: s.id, cliente: res.customerName, email: res.customerEmail || s.payerEmail,
        actual: realAmount(s), sinCobro: noCharge(s), configurado: s.amount, desde: s.lastModified || '', nuevo: newAmount, origen: 'sistema', reservationId: res.reservationId, m2,
      });
    }
  }

  // 2) Unidades de esta medida linkeadas a MP. Primero por external_reference (codigo de
  //    baulera; confiable porque MP NO expone el email), y si no, fallback por email.
  // Canonicaliza el codigo de baulera para matchear todos los formatos por igual:
  // "A2-025" = "A2-25" = "A2025" = "A0013" -> normaliza fila + unidad SIN ceros a la izquierda.
  // (MP guarda "A2-25" pero el inventario "A2-025"; sin esto no matcheaban.)
  const canon = (c: string): string => {
    const s = String(c || '').toUpperCase();
    const m = s.match(/([A-Z]\d)\D*0*(\d+)/); // fila (A2) + unidad sin ceros izq
    return m ? m[1] + m[2] : s.replace(/[^A-Z0-9]/g, '');
  };
  // Extrae el codigo del external_reference ("MiContainer Baulera A2-010" -> "A2-010"; o "...A0013" -> "A0013").
  // Requiere guion, o 3+ digitos si no hay guion (evita falsos como "m2").
  const codeOf = (ext: string): string => { const m = String(ext || '').match(/[A-Za-z]\d+-\d+|[A-Za-z]\d{3,}/); return m ? canon(m[0]) : ''; };
  const byCode = new Map<string, MpSubscription[]>();
  const byEmail = new Map<string, MpSubscription[]>();
  for (const s of subs) {
    if (usedSub.has(s.id) || resMap.has(s.id)) continue; // solo subs libres (no tomadas por el sistema)
    // Código por external_reference; si no lo tiene (ej. guarda el reservationId "MC-XXXX"),
    // se resuelve por la base: reservationId -> baulera. Así matchea igual por CÓDIGO DE BAULERA.
    let c = codeOf(s.externalReference);
    if (!c) { const raw = resIdToCode.get((s.externalReference || '').trim()); if (raw) c = canon(raw); }
    if (c) { if (!byCode.has(c)) byCode.set(c, []); byCode.get(c)!.push(s); }
    const e = s.payerEmail.trim().toLowerCase();
    if (e) { if (!byEmail.has(e)) byEmail.set(e, []); byEmail.get(e)!.push(s); }
  }
  for (const u of units) {
    if (u.m2 !== m2) continue;
    // a) por codigo de baulera (external_reference -> space), robusto a formato con/sin guion
    const c = canon(u.code);
    const codeCands = c ? (byCode.get(c) || []).filter((s) => !usedSub.has(s.id)) : [];
    if (codeCands.length) {
      const pick = codeCands[0];
      usedSub.add(pick.id);
      targets.push({ id: pick.id, cliente: u.name || u.code, email: u.email || pick.payerEmail, actual: realAmount(pick), sinCobro: noCharge(pick), configurado: pick.amount, desde: pick.lastModified || '', nuevo: newAmount, origen: 'mp', reservationId: null, m2 });
      continue;
    }
    // b) fallback por email
    const e = (u.email || '').trim().toLowerCase();
    if (!e) { noMatch.push({ name: u.name || u.code, email: '', dni: u.dni, monthly: u.monthly, motivo: `sin suscripcion MP para baulera ${u.code || '?'} y cliente sin email` }); continue; }
    const cands = (byEmail.get(e) || []).filter((s) => !usedSub.has(s.id));
    if (!cands.length) { noMatch.push({ name: u.name || u.code, email: e, dni: u.dni, monthly: u.monthly, motivo: `sin suscripcion MP (baulera ${u.code || '?'})` }); continue; }
    const pick = (u.monthly > 0 && cands.find((s) => s.amount === u.monthly)) || cands[0];
    usedSub.add(pick.id);
    targets.push({ id: pick.id, cliente: u.name, email: e, actual: realAmount(pick), sinCobro: noCharge(pick), configurado: pick.amount, desde: pick.lastModified || '', nuevo: newAmount, origen: 'mp', reservationId: null, m2 });
  }
  return { targets, noMatch };
}

async function applyTarget(t: Target, notify: boolean): Promise<void> {
  await updateSubscriptionAmount(t.id, t.nuevo);
  if (t.reservationId) {
    await db.collection('reservations').doc(t.reservationId).update({ monthly: t.nuevo });
    const orderRef = db.collection('reservationOrders').doc(`order-online-${t.reservationId}`);
    const orderSnap = await orderRef.get();
    if (orderSnap.exists) await orderRef.set({ monthlyPrice: t.nuevo, updatedAt: new Date().toISOString() }, { merge: true });
  }
  if (notify) await notifyPriceChange(t.email, t.cliente, t.actual, t.nuevo);
}

async function runTargets(targets: Target[], notify: boolean): Promise<{ actualizados: string[]; errores: Array<{ id: string; error: string }> }> {
  const actualizados: string[] = [];
  const errores: Array<{ id: string; error: string }> = [];
  for (const t of targets) {
    try { await applyTarget(t, notify); actualizados.push(t.id); }
    catch (e) { errores.push({ id: t.id, error: String(e).slice(0, 200) }); }
  }
  return { actualizados, errores };
}

// POST /pricing-engine/reprice/:branchId  (una medida)
// body: { m2, newAmount, dryRun (default true), notify }
pricingRouter.post('/reprice/:branchId', verifyToken, requireStaff, async (req: Request, res: Response) => {
  try {
    const branchId = req.params['branchId'];
    const body = req.body as { m2?: number; newAmount?: number; dryRun?: boolean; notify?: boolean };
    const m2n = Number(body.m2);
    const newAmount = Number(body.newAmount);
    const dryRun = body.dryRun !== false;
    const notify = body.notify === true;
    if (!m2n || !(newAmount > 0)) { res.status(400).json({ error: 'm2 y newAmount (>0) requeridos' }); return; }

    const [allSubs, resMap, units, plans, resIdToCode] = await Promise.all([searchSubscriptionsCached(), buildReservationMap(), buildRentedUnits(), searchPlans(), buildResIdToCodeMap()]);
    const subs = allSubs.filter((s) => s.status === 'authorized' || s.status === 'pending');
    const { targets, noMatch } = computeMeasure(subs, resMap, units, m2n, newAmount, new Set<string>(), resIdToCode);
    // Último cobro real + fecha SOLO de las matcheadas (pocas), sin saturar MP.
    const lc = await getLastChargedMap(targets.map((t) => t.id));
    for (const t of targets) { const x = lc.get(t.id); if (x) { if (x.lastCharged > 0) { t.actual = x.lastCharged; t.sinCobro = false; } if (x.lastModified) t.desde = x.lastModified; if (x.lastChargedDate) t.actualFecha = x.lastChargedDate; } }

    if (dryRun) {
      const uMed = units.filter((u) => u.m2 === m2n);
      const byStatus: Record<string, number> = {};
      allSubs.forEach((s) => { byStatus[s.status] = (byStatus[s.status] || 0) + 1; });
      res.json({
        dryRun: true, m2: m2n, newAmount, total: targets.length,
        cambian: targets.filter((t) => t.configurado !== t.nuevo).length,
        yaEnPrecio: targets.filter((t) => t.configurado === t.nuevo).length,
        afectados: targets.map((t) => ({ ...t, cambia: t.configurado !== t.nuevo })), sinMatch: noMatch.length, noMatch,
        debug: {
          ocupadasTotal: units.length,
          unidadesMedida: uMed.length,
          conEmail: uMed.filter((u) => u.email).length,
          emailsMedida: uMed.map((u) => u.email).filter(Boolean).slice(0, 12),
          subsMp: allSubs.length,
          subsActivas: subs.length,
          subsPorEstado: byStatus,
          subsMpEmails: allSubs.map((s) => s.payerEmail).filter(Boolean).slice(0, 12),
          planes: plans.length,
          planesInfo: plans.map((pl) => `${pl.reason || pl.id} (${pl.status})`).slice(0, 6),
        },
      });
      return;
    }
    const { actualizados, errores } = await runTargets(targets.filter((t) => t.configurado !== t.nuevo), notify);
    invalidateSubsCache(); // el apply cambió montos → refrescar snapshot en el próximo preview
    await logAudit({
      actor: (req as unknown as { email?: string }).email || 'admin',
      action: 'cambio_valor_suscripciones', entity: 'pricing', entityId: branchId,
      detail: { m2: m2n, newAmount, actualizados: actualizados.length, errores: errores.length, notify },
    });
    res.json({ dryRun: false, m2: m2n, newAmount, actualizados: actualizados.length, errores });
  } catch (err) {
    console.error('POST /pricing-engine/reprice error:', err);
    res.status(500).json({ error: 'No se pudo actualizar las suscripciones' });
  }
});

// POST /pricing-engine/reprice-all/:branchId  (general, todas las medidas)
// body: { items: [{ m2, newAmount }], dryRun (default true), notify }
pricingRouter.post('/reprice-all/:branchId', verifyToken, requireStaff, async (req: Request, res: Response) => {
  try {
    const branchId = req.params['branchId'];
    const body = req.body as { items?: Array<{ m2?: number; newAmount?: number }>; dryRun?: boolean; notify?: boolean };
    const items = Array.isArray(body.items) ? body.items : [];
    const dryRun = body.dryRun !== false;
    const notify = body.notify === true;
    if (!items.length) { res.status(400).json({ error: 'items requeridos' }); return; }

    const [allSubs, resMap, units, resIdToCode] = await Promise.all([searchSubscriptionsCached(), buildReservationMap(), buildRentedUnits(), buildResIdToCodeMap()]);
    const subs = allSubs.filter((s) => s.status === 'authorized' || s.status === 'pending');
    const usedSub = new Set<string>();
    const targets: Target[] = [];
    const noMatch: NoMatch[] = [];
    for (const it of items) {
      const m2n = Number(it.m2);
      const nn = Number(it.newAmount);
      if (!m2n || !(nn > 0)) continue;
      const r = computeMeasure(subs, resMap, units, m2n, nn, usedSub, resIdToCode);
      for (const t of r.targets) { if (t.configurado !== t.nuevo) targets.push(t); }
      noMatch.push(...r.noMatch);
    }
    // Último cobro real + fecha SOLO de las que cambian (pocas), sin saturar MP.
    const lc = await getLastChargedMap(targets.map((t) => t.id));
    for (const t of targets) { const x = lc.get(t.id); if (x) { if (x.lastCharged > 0) { t.actual = x.lastCharged; t.sinCobro = false; } if (x.lastModified) t.desde = x.lastModified; if (x.lastChargedDate) t.actualFecha = x.lastChargedDate; } }

    if (dryRun) { res.json({ dryRun: true, total: targets.length, afectados: targets, sinMatch: noMatch.length, noMatch }); return; }
    const { actualizados, errores } = await runTargets(targets.filter((t) => t.configurado !== t.nuevo), notify);
    invalidateSubsCache(); // el apply cambió montos → refrescar snapshot en el próximo preview
    await logAudit({
      actor: (req as unknown as { email?: string }).email || 'admin',
      action: 'cambio_valor_suscripciones_masivo', entity: 'pricing', entityId: branchId,
      detail: { medidas: items.length, actualizados: actualizados.length, errores: errores.length, notify },
    });
    res.json({ dryRun: false, total: targets.length, actualizados: actualizados.length, errores });
  } catch (err) {
    console.error('POST /pricing-engine/reprice-all error:', err);
    res.status(500).json({ error: 'No se pudo actualizar las suscripciones' });
  }
});

// GET /pricing-engine/find-sub?amount=233000&q=A2-032 — busca suscripciones MP activas por
// monto (±5%) o por texto en el external_reference. Para reconciliar altas manuales
// (encontrar el preapprovalId de un cliente que pagó pero quedó sin link).
pricingRouter.get('/find-sub', verifyToken, requireStaff, async (req: Request, res: Response) => {
  try {
    const amount = Number(req.query['amount']) || 0;
    const q = String(req.query['q'] || '').toLowerCase();
    // TODOS los estados (incl. cancelled/paused) para reconciliacion — cada estado en 1 pagina.
    const byStatus = await Promise.all(['authorized', 'pending', 'paused', 'cancelled'].map((st) => searchSubscriptions(st)));
    const subs = byStatus.flat();
    const hits = subs
      .filter((s) => (amount ? Math.abs(s.amount - amount) <= amount * 0.05 : true)
                  && (q ? (s.externalReference || '').toLowerCase().includes(q) : true))
      .map((s) => ({ id: s.id, ref: s.externalReference, amount: s.amount, status: s.status }));
    res.json({ count: hits.length, hits });
  } catch (err) {
    console.error('GET /pricing-engine/find-sub error:', err);
    res.status(500).json({ error: 'No se pudo buscar' });
  }
});

// GET /pricing-engine/roster/:branchId — PADRÓN read-only de todas las bauleras: quién la tiene,
// cómo paga (MP vs efectivo/sin-MP), precio de inventario, monto MP y último cobro real.
// Reusa la MISMA lógica del reprice (buildRentedUnits + matcheo por código de baulera) → NO
// modifica nada (no toca precios ni suscripciones). Solo lee y arma el padrón.
pricingRouter.get('/roster/:branchId', verifyToken, requireStaff, async (_req: Request, res: Response) => {
  try {
    const [allSubs, units, resIdToCode] = await Promise.all([
      searchSubscriptionsCached(), buildRentedUnits(), buildResIdToCodeMap(),
    ]);
    const subs = allSubs.filter((s) => s.status === 'authorized' || s.status === 'pending');
    // Mismo canon/codeOf que computeMeasure (robusto a formatos y ceros a la izquierda).
    const canon = (c: string): string => {
      const s = String(c || '').toUpperCase();
      const m = s.match(/([A-Z]\d)\D*0*(\d+)/);
      return m ? m[1] + m[2] : s.replace(/[^A-Z0-9]/g, '');
    };
    const codeOf = (ext: string): string => { const m = String(ext || '').match(/[A-Za-z]\d+-\d+|[A-Za-z]\d{3,}/); return m ? canon(m[0]) : ''; };
    const byCode = new Map<string, MpSubscription[]>();
    const byEmail = new Map<string, MpSubscription[]>();
    for (const s of subs) {
      let c = codeOf(s.externalReference);
      if (!c) { const raw = resIdToCode.get((s.externalReference || '').trim()); if (raw) c = canon(raw); }
      if (c) { if (!byCode.has(c)) byCode.set(c, []); byCode.get(c)!.push(s); }
      const e = s.payerEmail.trim().toLowerCase();
      if (e) { if (!byEmail.has(e)) byEmail.set(e, []); byEmail.get(e)!.push(s); }
    }
    const used = new Set<string>();
    const ocupadas: Array<Record<string, unknown>> = [];
    for (const u of units) {
      const c = canon(u.code);
      let sub = c ? (byCode.get(c) || []).find((s) => !used.has(s.id)) : undefined;
      if (!sub) { const e = (u.email || '').trim().toLowerCase(); if (e) sub = (byEmail.get(e) || []).find((s) => !used.has(s.id)); }
      if (sub) used.add(sub.id);
      ocupadas.push({
        baulera: u.code, m2: u.m2, cliente: u.name, email: u.email, dni: u.dni,
        metodo: sub ? 'MP' : 'efectivo/sin-MP',
        precioInventario: u.monthly,
        mpConfigurado: sub ? sub.amount : null,
        subId: sub ? sub.id : null,
        ultimoCobro: null as number | null, ultimoCobroFecha: null as string | null,
        configuradoDesde: sub ? (sub.lastModified || null) : null, // fecha del último cambio de la sub (para reconciliar)
      });
    }
    // Último cobro real solo de las que tienen MP.
    const withSub = ocupadas.filter((r) => r['subId']);
    const lc = await getLastChargedMap(withSub.map((r) => String(r['subId'])));
    for (const r of withSub) { const x = lc.get(String(r['subId'])); if (x) { r['ultimoCobro'] = x.lastCharged || null; r['ultimoCobroFecha'] = x.lastChargedDate || null; } }
    // Bauleras NO ocupadas (vacías/anuladas) para completar el padrón.
    const allRooms = await db.collection('storageRooms').get();
    const vacias: Array<Record<string, unknown>> = [];
    allRooms.forEach((d) => { const r = d.data() as Record<string, unknown>; if (r['status'] !== 'occupied') vacias.push({ baulera: String(r['space'] || r['name'] || d.id), m2: Number(r['areaM2']) || 0, status: String(r['status'] || '') }); });
    const conMP = ocupadas.filter((r) => r['metodo'] === 'MP').length;
    res.json({ ocupadasTotal: ocupadas.length, conMP, sinMP: ocupadas.length - conMP, vaciasTotal: vacias.length, ocupadas, vacias });
  } catch (err) {
    console.error('GET /pricing-engine/roster error:', err);
    res.status(500).json({ error: 'No se pudo armar el roster' });
  }
});

// GET /pricing-engine/cobros-rechazados/:branchId — READ-ONLY. Bauleras ocupadas cuyo ULTIMO
// intento de cobro en MP salio RECHAZADO (payment 'rejected' o intento en 'recycling' = MP
// reintentando). Regla de negocio: 10 DIAS de plazo para regularizar desde el rechazo ->
// devuelve diasTranscurridos / diasRestantes / vencido. Alimenta el titileo del dashboard e
// Inventario. Estrategia B (pull a MP, mismo matcheo por codigo que el reprice): cubre TODAS
// las suscripciones, incluso las legacy creadas en MP antes de que exista la web (sin reserva).
// El estado se recalcula en cada consulta -> si el cliente paga, deja de figurar solo.
const PLAZO_REGULARIZAR_DIAS = 10;
// Cache 10 min: la consulta hace ~77 llamadas a MP (~30s). El estado "rechazado" no cambia
// minuto a minuto; asi el menu/inventario cargan al toque. ?refresh=1 fuerza recalcular.
let _rechazadosCache: { at: number; data: Record<string, unknown> } | null = null;
pricingRouter.get('/cobros-rechazados/:branchId', verifyToken, requireStaff, async (req: Request, res: Response) => {
  try {
    if (req.query['refresh'] !== '1' && _rechazadosCache && Date.now() - _rechazadosCache.at < 10 * 60_000) {
      res.json({ ..._rechazadosCache.data, cacheado: true });
      return;
    }
    const [allSubs, units, resIdToCode] = await Promise.all([
      searchSubscriptionsCached(), buildRentedUnits(), buildResIdToCodeMap(),
    ]);
    const subs = allSubs.filter((s) => s.status === 'authorized' || s.status === 'pending');
    // Mismo canon/codeOf del reprice (robusto a formatos y ceros a la izquierda).
    const canon = (c: string): string => {
      const s = String(c || '').toUpperCase();
      const m = s.match(/([A-Z]\d)\D*0*(\d+)/);
      return m ? m[1] + m[2] : s.replace(/[^A-Z0-9]/g, '');
    };
    const codeOf = (ext: string): string => { const m = String(ext || '').match(/[A-Za-z]\d+-\d+|[A-Za-z]\d{3,}/); return m ? canon(m[0]) : ''; };
    const byCode = new Map<string, MpSubscription[]>();
    const byEmail = new Map<string, MpSubscription[]>();
    for (const s of subs) {
      let c = codeOf(s.externalReference);
      if (!c) { const raw = resIdToCode.get((s.externalReference || '').trim()); if (raw) c = canon(raw); }
      if (c) { if (!byCode.has(c)) byCode.set(c, []); byCode.get(c)!.push(s); }
      const e = s.payerEmail.trim().toLowerCase();
      if (e) { if (!byEmail.has(e)) byEmail.set(e, []); byEmail.get(e)!.push(s); }
    }
    const used = new Set<string>();
    const matched: Array<{ u: RentedUnit; sub: MpSubscription }> = [];
    for (const u of units) {
      const c = canon(u.code);
      let sub = c ? (byCode.get(c) || []).find((s) => !used.has(s.id)) : undefined;
      if (!sub) { const e = (u.email || '').trim().toLowerCase(); if (e) sub = (byEmail.get(e) || []).find((s) => !used.has(s.id)); }
      if (sub) { used.add(sub.id); matched.push({ u, sub }); }
    }
    // Ultimo intento de cobro SOLO de las matcheadas, en grupos chicos (mismo patron que
    // getLastChargedMap) para no saturar MP.
    const rechazados: Array<Record<string, unknown>> = [];
    let sinDato = 0;
    const CONC = 3;
    for (let i = 0; i < matched.length; i += CONC) {
      await Promise.all(matched.slice(i, i + CONC).map(async ({ u, sub }) => {
        const att = await getLastChargeAttempt(sub.id);
        if (!att) { sinDato++; return; }
        const rechazado = att.payStatus === 'rejected' || att.status === 'recycling';
        if (!rechazado) return;
        const t = att.date ? Date.parse(att.date) : NaN;
        const dias = Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : null;
        rechazados.push({
          baulera: u.code, m2: u.m2, cliente: u.name, email: u.email,
          subId: sub.id, monto: att.amount || sub.amount,
          fechaRechazo: att.date ? att.date.slice(0, 10) : '',
          diasTranscurridos: dias,
          diasRestantes: dias == null ? null : Math.max(0, PLAZO_REGULARIZAR_DIAS - dias),
          vencido: dias != null && dias > PLAZO_REGULARIZAR_DIAS,
          mpEstado: att.status, mpDetalle: att.payDetail, reintentos: att.retries ?? null,
        });
      }));
    }
    rechazados.sort((a, b) => String(a['baulera']).localeCompare(String(b['baulera'])));
    const payload = { total: rechazados.length, plazoDias: PLAZO_REGULARIZAR_DIAS, revisadas: matched.length, sinDato, rechazados };
    _rechazadosCache = { at: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    console.error('GET /pricing-engine/cobros-rechazados error:', err);
    res.status(500).json({ error: 'No se pudo consultar los cobros rechazados' });
  }
});
