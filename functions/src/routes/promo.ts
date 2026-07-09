import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { verifyToken } from '../middleware/verifyToken';
import { requireStaff } from '../middleware/requireStaff';

export const promoRouter = Router();

const COLL = 'promos';

const DEFAULTS = {
  active: false,
  type: 'text' as 'text' | 'image',
  imageData: '',          // data URL (base64) comprimido, o ''
  title: '',
  text: '',
  fontFamily: 'cond',     // cond | sans | mono
  color: '#0a0a0a',
  bgColor: '#ffffff',
  animation: 'fade',      // none | fade | slide | pulse | typewriter
  autoCloseSec: 5,
  ctaText: '',
  ctaLink: '',
  discountPct: 0,
  discountM2: [] as string[],
  startDate: '',   // 'YYYY-MM-DD' (vacio = sin limite)
  endDate: '',
};

function withinWindow(p: { startDate?: string; endDate?: string }): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (p.startDate && today < p.startDate) return false;
  if (p.endDate && today > p.endDate) return false;
  return true;
}

async function readPromo(branchId: string) {
  const doc = await db.collection(COLL).doc(branchId).get();
  return { ...DEFAULTS, ...(doc.exists ? doc.data() : {}), branchId };
}

// GET /promo?branchId= — promo activa para la web (publico).
// Si no esta activa, devuelve { active:false } sin el resto.
promoRouter.get('/', async (req: Request, res: Response) => {
  try {
    const branchId = (req.query['branchId'] as string) || 'nordelta';
    const p = await readPromo(branchId);
    if (!p.active || !withinWindow(p)) { res.json({ active: false, branchId }); return; }
    res.json(p);
  } catch (err) {
    console.error('GET /promo error:', err);
    res.status(500).json({ active: false });
  }
});

// GET /promo/branch/:branchId — config completa (admin)
promoRouter.get('/branch/:branchId', verifyToken, requireStaff, async (req: Request, res: Response) => {
  try {
    res.json(await readPromo(req.params.branchId));
  } catch (err) {
    console.error('GET /promo/branch error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /promo/branch/:branchId — guardar config (admin)
promoRouter.put('/branch/:branchId', verifyToken, requireStaff, async (req: Request, res: Response) => {
  try {
    const allowed = Object.keys(DEFAULTS);
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    await db.collection(COLL).doc(req.params.branchId).set(patch, { merge: true });
    res.json(await readPromo(req.params.branchId));
  } catch (err) {
    console.error('PUT /promo/branch error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
