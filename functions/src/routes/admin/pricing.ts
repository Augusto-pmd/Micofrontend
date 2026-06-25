import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';
import { getPricingByM2 } from '../../services/pricing.service';
import { FieldValue } from 'firebase-admin/firestore';

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
