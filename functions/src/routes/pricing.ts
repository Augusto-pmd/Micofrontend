import { Router, Request, Response } from 'express';
import { getPricingByM2 } from '../services/pricing.service';

export const pricingPublicRouter = Router();

// GET /pricing — tabla de precios por medida (publico, lo lee la web)
pricingPublicRouter.get('/', async (req: Request, res: Response) => {
  try {
    const branchId = (req.query['branchId'] as string) || 'nordelta';
    const byM2 = await getPricingByM2(branchId);
    res.json({ branchId, byM2, updatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch pricing' });
  }
});
