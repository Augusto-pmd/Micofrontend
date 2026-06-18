import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';
import { paginate } from '../../utils/pagination';

export const customersRouter = Router();

// Tope de seguridad para el path de búsqueda en memoria (substring no es
// indexable en Firestore). A esta escala (cientos-miles) es aceptable.
const SEARCH_SCAN_CAP = 3000;

// Normaliza un doc de cliente al formato que espera el frontend
function normalizeCustomer(raw: any) {
  // Si ya tiene estructura user anidada, dejarlo como está
  if (raw.user) return raw;
  // Si tiene firstName/lastName planos (formato seed), construir el user wrapper
  return {
    ...raw,
    fullName: raw.fullName || `${raw.firstName || ''} ${raw.lastName || ''}`.trim(),
    user: {
      id:        raw.id || raw.userId || '',
      firstName: raw.firstName || '',
      lastName:  raw.lastName  || '',
      email:     raw.email     || '',
      createdAt: raw.createdAt || '',
      updatedAt: raw.updatedAt || '',
    },
  };
}

// GET /customer
// Soporta dos modos:
//  - Navegación normal → paginación en Firestore (count + limit/cursor), eficiente.
//  - Con ?search= → fallback en memoria acotado (substring no es indexable).
// Acepta ?cursor=<id> para paginación por cursor; mantiene page/limit/total/totalPages.
customersRouter.get('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 10;
    const cursor = req.query['cursor'] as string | undefined;
    const search = (req.query['search'] as string | undefined)?.toLowerCase();

    // ── Path de búsqueda: escaneo acotado en memoria ──────────────────
    if (search) {
      const snapshot = await db
        .collection('customers')
        .orderBy('createdAt', 'desc')
        .limit(SEARCH_SCAN_CAP)
        .get();
      if (snapshot.size === SEARCH_SCAN_CAP) {
        console.warn(`[customers] búsqueda alcanzó el tope de ${SEARCH_SCAN_CAP} docs`);
      }
      let all = snapshot.docs.map((d) => normalizeCustomer({ id: d.id, ...d.data() })) as any[];
      all = all.filter((c: any) =>
        c.user?.firstName?.toLowerCase().includes(search) ||
        c.user?.lastName?.toLowerCase().includes(search) ||
        c.user?.email?.toLowerCase().includes(search) ||
        c.firstName?.toLowerCase().includes(search) ||
        c.dni?.toLowerCase().includes(search) ||
        c.fullName?.toLowerCase().includes(search)
      );
      const total = all.length;
      const start = (page - 1) * limit;
      const data = all.slice(start, start + limit);
      res.json({
        data,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        nextCursor: null, // el cursor no aplica al modo búsqueda
      });
      return;
    }

    // ── Path normal: paginación en Firestore ──────────────────────────
    const baseQuery = db.collection('customers').orderBy('createdAt', 'desc');
    const result = await paginate('customers', baseQuery, { page, limit, cursor });
    const data = result.docs.map((d) => normalizeCustomer({ id: d.id, ...d.data() }));

    res.json({
      data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      nextCursor: result.nextCursor,
    });
  } catch (err) {
    console.error('GET /customer error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /customer/:id
customersRouter.get('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('customers').doc(req.params['id']).get();
    if (!doc.exists) {
      res.status(404).json({ message: 'Customer not found' });
      return;
    }
    res.json(normalizeCustomer({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('GET /customer/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /customer
customersRouter.post('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, isActive: req.body.isActive ?? true, createdAt: now, updatedAt: now };
    const ref = await db.collection('customers').add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) {
    console.error('POST /customer error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /customer/:id
customersRouter.put('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, updatedAt: now };
    await db.collection('customers').doc(req.params['id']).set(data, { merge: true });
    const updated = await db.collection('customers').doc(req.params['id']).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    console.error('PUT /customer/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /customer/:id
// PUT /customer/:id/approve — valida el cliente/asignacion (compra online o presencial).
// El admin la llama por PATCH; el middleware la convierte a PUT.
customersRouter.put('/:id/approve', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    await db.collection('customers').doc(req.params['id']).set(
      { status: 'approved', approvedAt: now, isActive: true, updatedAt: now },
      { merge: true },
    );
    const updated = await db.collection('customers').doc(req.params['id']).get();
    res.json(normalizeCustomer({ id: updated.id, ...updated.data() }));
  } catch (err) {
    console.error('approve customer error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

customersRouter.delete('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    await db.collection('customers').doc(req.params['id']).delete();
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    console.error('DELETE /customer/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
