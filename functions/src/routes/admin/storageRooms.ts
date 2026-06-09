import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';
import { paginate } from '../../utils/pagination';
import { getBuildingMap } from '../../utils/buildingCache';

export const storageRoomsRouter = Router();

const SEARCH_SCAN_CAP = 3000;

// Trae los clientes (tenants) de una lista de contractNumbers, en chunks de 10
// (límite del operador 'in' de Firestore). Solo para los docs de la página.
async function tenantsByContract(contractNums: string[]): Promise<Record<string, any>> {
  const map: Record<string, any> = {};
  const unique = [...new Set(contractNums.filter(Boolean))];
  if (unique.length === 0) return map;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 10) chunks.push(unique.slice(i, i + 10));

  const snaps = await Promise.all(
    chunks.map((chunk) =>
      db.collection('customers').where('contractNumber', 'in', chunk).get()
    )
  );
  snaps.forEach((snap) => {
    snap.docs.forEach((d) => {
      const cust = { id: d.id, ...d.data() } as any;
      if (cust.contractNumber) map[cust.contractNumber] = cust;
      if (Array.isArray(cust.contractNumbers)) {
        cust.contractNumbers.forEach((cn: string) => { map[cn] = cust; });
      }
    });
  });
  return map;
}

// Enriquece rooms con building (cache) + tenant. Acotado a la página.
async function enrichRooms(rawRooms: any[], buildings: Record<string, any>) {
  const contractNums = rawRooms
    .filter((r: any) => r.contractNumber)
    .map((r: any) => r.contractNumber as string);
  const tenantMap = await tenantsByContract(contractNums);

  return rawRooms.map((raw: any) => ({
    ...raw,
    building: buildings[raw.buildingId] || null,
    tenant: raw.contractNumber
      ? (tenantMap[raw.contractNumber] || { fullName: raw.currentTenant, contractNumber: raw.contractNumber })
      : null,
  }));
}

// GET /storage-room
// Pagina en Firestore (orderBy name) y enriquece solo la página. Acepta
// ?cursor=<id>. Con ?search= cae a escaneo acotado en memoria.
storageRoomsRouter.get('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 10;
    const cursor = req.query['cursor'] as string | undefined;
    const status = req.query['status'] as string | undefined;
    const branchId = req.query['branchId'] as string | undefined;
    const buildingId = req.query['buildingId'] as string | undefined;
    const search = (req.query['search'] as string | undefined)?.toLowerCase();

    const buildings = await getBuildingMap();

    // where() ANTES de orderBy para usar índice compuesto
    let baseQuery: FirebaseFirestore.Query = db.collection('storageRooms');
    if (status) baseQuery = baseQuery.where('status', '==', status);
    if (branchId) baseQuery = baseQuery.where('branchId', '==', branchId);
    if (buildingId) baseQuery = baseQuery.where('buildingId', '==', buildingId);

    // ── Path de búsqueda: escaneo acotado en memoria ──────────────────
    if (search) {
      const snap = await baseQuery.limit(SEARCH_SCAN_CAP).get();
      if (snap.size === SEARCH_SCAN_CAP) {
        console.warn(`[storageRooms] búsqueda alcanzó el tope de ${SEARCH_SCAN_CAP} docs`);
      }
      let rawRooms = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      rawRooms = rawRooms.filter((r: any) =>
        r.name?.toLowerCase().includes(search) ||
        r.space?.toLowerCase().includes(search) ||
        r.currentTenant?.toLowerCase().includes(search) ||
        String(r.areaM2 || '').includes(search)
      );
      const total = rawRooms.length;
      const start = (page - 1) * limit;
      const pageRooms = rawRooms.slice(start, start + limit);
      const data = await enrichRooms(pageRooms, buildings);
      res.json({ data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)), nextCursor: null });
      return;
    }

    // ── Path normal: paginación en Firestore ──────────────────────────
    baseQuery = baseQuery.orderBy('name', 'asc');
    const result = await paginate('storageRooms', baseQuery, { page, limit, cursor });
    const rawRooms = result.docs.map((d) => ({ id: d.id, ...d.data() } as any));
    const data = await enrichRooms(rawRooms, buildings);

    res.json({
      data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      nextCursor: result.nextCursor,
    });
  } catch (err) {
    console.error('GET /storage-room error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /storage-room/:id
storageRoomsRouter.get('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const [doc, buildings] = await Promise.all([
      db.collection('storageRooms').doc(req.params['id']).get(),
      getBuildingMap(),
    ]);
    if (!doc.exists) {
      res.status(404).json({ message: 'Storage room not found' });
      return;
    }
    const raw = { id: doc.id, ...doc.data() } as any;
    // Get tenant if occupied
    let tenant = null;
    if (raw.contractNumber) {
      const custSnap = await db.collection('customers')
        .where('contractNumber', '==', raw.contractNumber).limit(1).get();
      if (!custSnap.empty) tenant = { id: custSnap.docs[0].id, ...custSnap.docs[0].data() };
    }
    const result = { ...raw, building: buildings[raw.buildingId] || null, tenant };
    res.json(result);
  } catch (err) {
    console.error('GET /storage-room/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /storage-room
storageRoomsRouter.post('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, createdAt: now, updatedAt: now };
    const ref = await db.collection('storageRooms').add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) {
    console.error('POST /storage-room error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /storage-room/:id
storageRoomsRouter.put('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, updatedAt: now };
    await db.collection('storageRooms').doc(req.params['id']).set(data, { merge: true });
    const updated = await db.collection('storageRooms').doc(req.params['id']).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    console.error('PUT /storage-room/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /storage-room/:id
storageRoomsRouter.delete('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    await db.collection('storageRooms').doc(req.params['id']).delete();
    res.json({ message: 'Storage room deleted' });
  } catch (err) {
    console.error('DELETE /storage-room/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
