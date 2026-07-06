import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';
import { getPricingByM2 } from '../../services/pricing.service';
import { FieldValue } from 'firebase-admin/firestore';
import { updateSubscriptionAmount } from '../../services/mercadopago.service';
import { logAudit } from '../../services/audit.service';

export const pricingRouter = Router();

const PRICING_DOC = 'config';
const PRICING_COLLECTION = 'pricingEngine';

// GET /pricing-engine
pricingRouter.get('/', verifyToken, async (_req: Request, res: Response) => {
  try {
    const doc = await db.collection(PRICING_COLLECTION).doc(PRICING_DOC).get();
    if (!doc.exists) {
      // Return defaults if not yet configured
      res.json({
        basePrice: 0,
        pricePerM2: 0,
        discounts: [],
        updatedAt: null,
      });
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
      // Programar a futuro: se guarda como cambio pendiente, no pisa el precio actual
      await db.collection('pricing').doc(req.params.branchId).set(
        { scheduled: FieldValue.arrayUnion({ effectiveDate, byM2: byM2 || {} }), updatedAt: today }, { merge: true });
    } else {
      // Aplica ya
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


// -- Cambio de valor a suscripciones EXISTENTES (clientes ya alquilados) --
// POST /pricing-engine/reprice/:branchId  body: { m2, newAmount, dryRun (default true), notify }
// dryRun=true  -> devuelve la lista de afectados, NO ejecuta nada (vista previa).
// dryRun=false -> aplica: PUT /preapproval por cada suscripcion + actualiza contrato + audita (+ notifica).
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

pricingRouter.post('/reprice/:branchId', verifyToken, async (req: Request, res: Response) => {
  try {
    const branchId = req.params['branchId'];
    const body = req.body as { m2?: number; newAmount?: number; dryRun?: boolean; notify?: boolean };
    const m2n = Number(body.m2);
    const amount = Number(body.newAmount);
    const dryRun = body.dryRun !== false;
    const notify = body.notify === true;
    if (!m2n || !(amount > 0)) { res.status(400).json({ error: 'm2 y newAmount (>0) requeridos' }); return; }
    const snap = await db.collection('reservations').where('status', '==', 'active').get();
    const targets: Array<{ id: string; preapprovalId: string; cliente: string; email: string; actual: number; nuevo: number }> = [];
    snap.forEach((d) => {
      const r = d.data() as Record<string, unknown>;
      if (Number(r['m2']) === m2n && r['sucursalId'] === branchId && r['mpPreapprovalId'] && r['mpSubscriptionStatus'] !== 'cancelled') {
        targets.push({
          id: d.id,
          preapprovalId: String(r['mpPreapprovalId']),
          cliente: String(r['customerName'] || ''),
          email: String(r['customerEmail'] || ''),
          actual: Number(r['monthly']) || 0,
          nuevo: amount,
        });
      }
    });
    if (dryRun) {
      res.json({ dryRun: true, m2: m2n, newAmount: amount, total: targets.length, afectados: targets });
      return;
    }
    const actualizados: string[] = [];
    const errores: Array<{ id: string; error: string }> = [];
    for (const t of targets) {
      try {
        await updateSubscriptionAmount(t.preapprovalId, amount);
        await db.collection('reservations').doc(t.id).update({ monthly: amount });
        const orderRef = db.collection('reservationOrders').doc(`order-online-${t.id}`);
        const orderSnap = await orderRef.get();
        if (orderSnap.exists) await orderRef.set({ monthlyPrice: amount, updatedAt: new Date().toISOString() }, { merge: true });
        if (notify) await notifyPriceChange(t.email, t.cliente, t.actual, amount);
        actualizados.push(t.id);
      } catch (e) {
        errores.push({ id: t.id, error: String(e).slice(0, 200) });
      }
    }
    await logAudit({
      actor: (req as unknown as { email?: string }).email || 'admin',
      action: 'cambio_valor_suscripciones',
      entity: 'pricing',
      entityId: branchId,
      detail: { m2: m2n, newAmount: amount, actualizados: actualizados.length, errores: errores.length, notify },
    });
    res.json({ dryRun: false, m2: m2n, newAmount: amount, actualizados: actualizados.length, errores });
  } catch (err) {
    console.error('POST /pricing-engine/reprice error:', err);
    res.status(500).json({ error: 'No se pudo actualizar las suscripciones' });
  }
});
