import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';

// Endpoint PÚBLICO de disponibilidad de stock por m².
// Lo usa la web pública para saber qué medidas tienen unidades libres,
// deshabilitar las agotadas y sugerir una medida alternativa.
export const availabilityRouter = Router();

let cache: { data: any; expires: number } | null = null;
const TTL_MS = 30_000; // 30s — evita leer toda la colección en cada visita

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
