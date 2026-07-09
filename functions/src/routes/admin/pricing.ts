import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';
import { requireStaff } from '../../middleware/requireStaff';
import { getPricingByM2 } from '../../services/pricing.service';
import { FieldValue } from 'firebase-admin/firestore';
import { updateSubscriptionAmount, searchSubscriptions, enrichSubscriptionEmails, searchPlans, MpSubscription } from '../../services/mercadopago.service';
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
interface RentedUnit { m2: number; name: string; email: string; dni: string; monthly: number; }
interface Target {
  id: string;              // preapprovalId (unico)
  cliente: string;
  email: string;
  actual: number;          // monto actual real en MP
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
    units.push({ m2, name, email, dni, monthly: Number(r['price']) || 0 });
  });
  return units;
}

// Arma targets de UNA medida. usedSub se comparte entre medidas (dedup global).
function computeMeasure(
  subs: MpSubscription[], resMap: Map<string, ResLite>, units: RentedUnit[],
  m2: number, newAmount: number, usedSub: Set<string>,
): { targets: Target[]; noMatch: NoMatch[] } {
  const targets: Target[] = [];
  const noMatch: NoMatch[] = [];

  // 1) Suscripciones del sistema (reservations) con m2 === medida => confiable.
  for (const s of subs) {
    if (!s.id || usedSub.has(s.id)) continue;
    const res = resMap.get(s.id);
    if (res && res.m2 === m2) {
      usedSub.add(s.id);
      targets.push({
        id: s.id, cliente: res.customerName, email: res.customerEmail || s.payerEmail,
        actual: s.amount, nuevo: newAmount, origen: 'sistema', reservationId: res.reservationId, m2,
      });
    }
  }

  // 2) Manuales: unidades de esta medida linkeadas a MP por email.
  const byEmail = new Map<string, MpSubscription[]>();
  for (const s of subs) {
    if (usedSub.has(s.id) || resMap.has(s.id)) continue; // solo subs manuales libres
    const e = s.payerEmail.trim().toLowerCase();
    if (!e) continue;
    if (!byEmail.has(e)) byEmail.set(e, []);
    byEmail.get(e)!.push(s);
  }
  for (const u of units) {
    if (u.m2 !== m2) continue;
    const e = (u.email || '').trim().toLowerCase();
    if (!e) { noMatch.push({ name: u.name, email: '', dni: u.dni, monthly: u.monthly, motivo: 'cliente sin email en la base' }); continue; }
    const cands = (byEmail.get(e) || []).filter((s) => !usedSub.has(s.id));
    if (!cands.length) { noMatch.push({ name: u.name, email: e, dni: u.dni, monthly: u.monthly, motivo: 'sin suscripcion MP con ese email' }); continue; }
    const pick = (u.monthly > 0 && cands.find((s) => s.amount === u.monthly)) || cands[0];
    usedSub.add(pick.id);
    targets.push({
      id: pick.id, cliente: u.name, email: e,
      actual: pick.amount, nuevo: newAmount, origen: 'mp', reservationId: null, m2,
    });
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

    const [allSubs, resMap, units, plans] = await Promise.all([searchSubscriptions(), buildReservationMap(), buildRentedUnits(), searchPlans()]);
    const subs = allSubs.filter((s) => s.status === 'authorized');
    await enrichSubscriptionEmails(subs); // completa payer_email via detalle (el search no lo trae)
    const { targets, noMatch } = computeMeasure(subs, resMap, units, m2n, newAmount, new Set<string>());

    if (dryRun) {
      const uMed = units.filter((u) => u.m2 === m2n);
      const byStatus: Record<string, number> = {};
      allSubs.forEach((s) => { byStatus[s.status] = (byStatus[s.status] || 0) + 1; });
      res.json({
        dryRun: true, m2: m2n, newAmount, total: targets.length, afectados: targets, sinMatch: noMatch.length, noMatch,
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
    const { actualizados, errores } = await runTargets(targets, notify);
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

    const [allSubs, resMap, units] = await Promise.all([searchSubscriptions(), buildReservationMap(), buildRentedUnits()]);
    const subs = allSubs.filter((s) => s.status === 'authorized');
    await enrichSubscriptionEmails(subs); // completa payer_email via detalle (el search no lo trae)
    const usedSub = new Set<string>();
    const targets: Target[] = [];
    const noMatch: NoMatch[] = [];
    for (const it of items) {
      const m2n = Number(it.m2);
      const nn = Number(it.newAmount);
      if (!m2n || !(nn > 0)) continue;
      const r = computeMeasure(subs, resMap, units, m2n, nn, usedSub);
      for (const t of r.targets) { if (t.actual !== t.nuevo) targets.push(t); }
      noMatch.push(...r.noMatch);
    }

    if (dryRun) { res.json({ dryRun: true, total: targets.length, afectados: targets, sinMatch: noMatch.length, noMatch }); return; }
    const { actualizados, errores } = await runTargets(targets, notify);
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
