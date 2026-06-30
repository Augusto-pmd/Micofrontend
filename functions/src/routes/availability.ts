import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { releaseExpiredHolds } from '../services/assignment.service';

// Endpoint PUBLICO de disponibilidad por m2 (por sucursal).
export const availabilityRouter = Router();

const cacheByBranch = new Map<string, { data: unknown; expires: number }>();
const TTL_MS = 30_000;

function freeRoomsQuery(branchId?: string): FirebaseFirestore.Query {
  let q: FirebaseFirestore.Query = db.collection('storageRooms').where('status', '==', 'available');
  if (branchId) q = q.where('branchId', '==', branchId);
  return q;
}

// GET /availability/units?branchId= — bauleras LIBRES por m2 (codigos)
availabilityRouter.get('/units', async (req: Request, res: Response) => {
  try {
    const branchId = req.query['branchId'] as string | undefined;
    const snap = await freeRoomsQuery(branchId).get();
    const byM2: Record<string, string[]> = {};
    snap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const m2 = parseFloat(String(data.areaM2 || '0'));
      if (!m2) return;
      const key = String(m2);
      if (!byM2[key]) byM2[key] = [];
      byM2[key].push(String(data.space || data.name || d.id));
    });
    Object.keys(byM2).forEach((k) => byM2[k].sort());
    res.json({ byM2, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('GET /availability/units error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /availability?branchId= — conteo de libres por m2
availabilityRouter.get('/', async (req: Request, res: Response) => {
  try {
    const branchId = req.query['branchId'] as string | undefined;
    const key = branchId || 'all';
    const now = Date.now();
    const cached = cacheByBranch.get(key);
    if (cached && cached.expires > now) { res.json(cached.data); return; }

    await releaseExpiredHolds(branchId).catch(() => {});
    const snap = await freeRoomsQuery(branchId).get();
    const byM2: Record<string, number> = {};
    snap.docs.forEach((d) => {
      const m2 = parseFloat(String((d.data() as Record<string, unknown>).areaM2 || '0'));
      if (!m2) return;
      const k = String(m2);
      byM2[k] = (byM2[k] || 0) + 1;
    });
    const data = { total: snap.size, byM2, updatedAt: new Date().toISOString() };
    cacheByBranch.set(key, { data, expires: now + TTL_MS });
    res.json(data);
  } catch (err) {
    console.error('GET /availability error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
