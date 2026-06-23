import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';

// Endpoint PÚBLICO de disponibilidad de stock por m².
// Lo usa la web pública para saber qué medidas tienen unidades libres,
// deshabilitar las agotadas y sugerir una medida alternativa.
export const availabilityRouter = Router();

let cache: { data: any; expires: number } | null = null;
const TTL_MS = 30_000; // 30s — evita leer toda la colección en cada visita

// GET /availability/units — lista las bauleras LIBRES por m2 (codigos), para que
// el wizard ofrezca una unidad puntual (auto-asignar o elegir).
availabilityRouter.get('/units', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('storageRooms').where('status', '==', 'available').get();
    const byM2: Record<string, string[]> = {};
    snap.docs.forEach((d) => {
      const data = d.data() as any;
      const m2 = parseFloat(data.areaM2 || '0');
      if (!m2) return;
      const key = String(m2);
      if (!byM2[key]) byM2[key] = [];
      byM2[key].push(data.space || data.name || d.id);
    });
    Object.keys(byM2).forEach((k) => byM2[k].sort());
    res.json({ byM2, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('GET /availability/units error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

availabilityRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (cache && cache.expires > now) {
      res.json(cache.data);
      return;
    }
    const snap = await db
      .collection('storageRooms')
      .where('status', '==', 'available')
      .get();

    const byM2: Record<string, number> = {};
    snap.docs.forEach((d) => {
      const m2 = parseFloat((d.data() as any).areaM2 || '0');
      if (!m2) return;
      const key = String(m2);
      byM2[key] = (byM2[key] || 0) + 1;
    });

    const data = { total: snap.size, byM2, updatedAt: new Date().toISOString() };
    cache = { data, expires: now + TTL_MS };
    res.json(data);
  } catch (err) {
    console.error('GET /availability error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
