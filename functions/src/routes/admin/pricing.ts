import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';

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
