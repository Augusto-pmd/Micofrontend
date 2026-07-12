import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';
import { paginate } from '../../utils/pagination';
import { getBuildingMap } from '../../utils/buildingCache';

export const ordersRouter = Router();

// El front (types/order.ts) espera status en MAYÚSCULAS (PENDING/CONFIRMED/CANCELED); en la
// base conviven minúsculas ('pending' al crear, 'cancelled' al cancelar) y mayúsculas (seed).
// Normalizamos SIEMPRE en la lectura — los datos guardados no se tocan.
function normalizarStatus(s: unknown): string {
  const v = String(s || '').toUpperCase();
  if (v === 'CANCELLED') return 'CANCELED';
  return v || 'PENDING';
}

// Enriquece SOLO los docs de la página actual (≤ limit), no toda la colección.
// buildings/branches vienen del cache (TTL), evitando releerlos por request.
async function enrichOrders(orders: any[]) {
  if (orders.length === 0) return orders;

  // Collect unique IDs (acotados al tamaño de página)
  const custIds = [...new Set(orders.map((o: any) => o.customerId).filter(Boolean))];
  const roomIds = [...new Set(orders.map((o: any) => o.storageRoomId).filter(Boolean))];

  const [buildings, custSnap, roomSnap] = await Promise.all([
    getBuildingMap(),
    custIds.length ? db.getAll(...custIds.map((id) => db.collection('customers').doc(id))) : Promise.resolve([] as any[]),
    roomIds.length ? db.getAll(...roomIds.map((id) => db.collection('storageRooms').doc(id))) : Promise.resolve([] as any[]),
  ]);

  const customers: Record<string, any> = {};
  (custSnap as any[]).forEach((d: any) => {
    if (d.exists) {
      const raw = { id: d.id, ...d.data() } as any;
      customers[d.id] = {
        ...raw,
        user: raw.user || { id: d.id, firstName: raw.firstName || '', lastName: raw.lastName || '', email: raw.email || '' },
      };
    }
  });

  const rooms: Record<string, any> = {};
  (roomSnap as any[]).forEach((d: any) => {
    if (d.exists) {
      const raw = { id: d.id, ...d.data() } as any;
      rooms[d.id] = { ...raw, building: buildings[raw.buildingId] || null };
    }
  });

  return orders.map((o: any) => ({
    ...o,
    // CASING del status normalizado a lo que espera el front (types/order.ts usa MAYÚSCULAS):
    // el backend guardaba 'pending'/'cancelled' en minúscula → los badges caían al fallback y
    // las canceladas no se reconocían. Se normaliza en la LECTURA (no se tocan datos guardados).
    status: normalizarStatus(o.status),
    // Alias campos del seed para que encajen con el tipo OrderCustomer
    customer: customers[o.customerId] || (o.customerName ? {
      id: o.customerId,
      fullName: o.customerName,
      user: { id: o.customerId, firstName: o.customerName?.split(' ')[0] || '', lastName: o.customerName?.split(' ').slice(1).join(' ') || '', email: '' },
      dni: o.customerDni || '',
      cuit: o.customerCuit || '',
      phone: o.customerPhone || '',
    } : null),
    storageRoom: rooms[o.storageRoomId] || (o.bauleraCodigo ? {
      id: o.storageRoomId,
      space: o.bauleraCodigo,
      floor: '',
      status: 'occupied',
      areaM2: String(o.m2 || ''),
      price: String(o.monthlyPrice || o.totalAmount || ''),
      building: buildings['edificio-a'] || null,
    } : null),
    // Ensure entryDate field is present
    entryDate: o.entryDate || o.startDate || o.createdAt,
    totalAmount: o.totalAmount || String(o.monthlyPrice || ''),
  }));
}

// GET /reservation-order
// Pagina en Firestore y enriquece SOLO la página actual (antes traía toda la
// colección y hacía 1000+ lecturas de join). Acepta ?cursor=<id>.
ordersRouter.get('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 10;
    const cursor = req.query['cursor'] as string | undefined;
    const status = req.query['status'] as string | undefined;
    const customerId = req.query['customerId'] as string | undefined;
    const search = (req.query['search'] as string | undefined)?.toLowerCase().trim();

    // ── Búsqueda server-side (antes se ignoraba: el buscador solo filtraba la página cargada
    // y "no encontraba" órdenes existentes). Escaneo acotado + enriquecido + filtro por
    // cliente/contrato/baulera/id.
    if (search) {
      const SCAN_CAP = 1000;
      const snap = await db.collection('reservationOrders').orderBy('createdAt', 'desc').limit(SCAN_CAP).get();
      if (snap.size === SCAN_CAP) console.warn(`[orders] búsqueda alcanzó el tope de ${SCAN_CAP} docs`);
      const rawAll = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const enrichedAll = await enrichOrders(rawAll);
      const hits = enrichedAll.filter((o: any) =>
        String(o.id || '').toLowerCase().includes(search) ||
        String(o.contractNumber || '').toLowerCase().includes(search) ||
        String(o.bauleraCodigo || '').toLowerCase().includes(search) ||
        String(o.customer?.fullName || '').toLowerCase().includes(search) ||
        String(o.customer?.email || '').toLowerCase().includes(search) ||
        String(o.customer?.dni || '').toLowerCase().includes(search) ||
        String(o.storageRoom?.space || o.storageRoom?.name || '').toLowerCase().includes(search)
      );
      const total = hits.length;
      const start = (page - 1) * limit;
      res.json({ data: hits.slice(start, start + limit), total, page, limit, totalPages: Math.ceil(total / limit) });
      return;
    }

    // where() ANTES de orderBy para que el índice compuesto aplique
    let baseQuery: FirebaseFirestore.Query = db.collection('reservationOrders');
    if (status) {
      // La base tiene casing mixto ('pending' del create, 'CONFIRMED' del seed, 'cancelled' del
      // cancel) → el filtro matchea todas las variantes del status pedido.
      const s = String(status);
      const variantes = [...new Set([s, s.toLowerCase(), s.toUpperCase(),
        s.toUpperCase() === 'CANCELED' ? 'cancelled' : '', s.toLowerCase() === 'cancelled' ? 'CANCELED' : ''].filter(Boolean))];
      baseQuery = baseQuery.where('status', 'in', variantes);
    }
    if (customerId) baseQuery = baseQuery.where('customerId', '==', customerId);
    baseQuery = baseQuery.orderBy('createdAt', 'desc');

    const result = await paginate('reservationOrders', baseQuery, { page, limit, cursor });
    const raw = result.docs.map((d) => ({ id: d.id, ...d.data() }));
    const data = await enrichOrders(raw); // solo ≤ limit docs

    res.json({
      data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      nextCursor: result.nextCursor,
    });
  } catch (err) {
    console.error('GET /reservation-order error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /reservation-order/:id
ordersRouter.get('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('reservationOrders').doc(req.params['id']).get();
    if (!doc.exists) {
      res.status(404).json({ message: 'Order not found' });
      return;
    }
    // #7: enriquecer el detalle igual que el listado -> trae cliente, baulera
    // (storageRoom) y ubicacion (building + branch). Antes devolvia la orden cruda.
    const [enriched] = await enrichOrders([{ id: doc.id, ...doc.data() }]);
    res.json(enriched);
  } catch (err) {
    console.error('GET /reservation-order/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /reservation-order/customer/:customerId — ordenes (enriquecidas) de un cliente.
// #2: el admin lo usa para mostrar las bauleras contratadas de cada cliente.
ordersRouter.get('/customer/:customerId', verifyToken, async (req: Request, res: Response) => {
  try {
    const snap = await db.collection('reservationOrders')
      .where('customerId', '==', req.params['customerId'])
      .get();
    const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const data = await enrichOrders(raw);
    res.json(data);
  } catch (err) {
    console.error('GET /reservation-order/customer/:customerId error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /reservation-order
ordersRouter.post('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data: any = { ...req.body, status: req.body.status ?? 'pending', createdAt: now, updatedAt: now };
    // totalAmount: el form de crear NO lo manda → antes la orden nacía sin monto y el admin
    // mostraba $NaN hasta editarla. Se completa desde el precio real de la baulera elegida.
    if (!data.totalAmount && data.storageRoomId) {
      try {
        const room = await db.collection('storageRooms').doc(String(data.storageRoomId)).get();
        const precio = room.exists ? Number((room.data() as any).price) || 0 : 0;
        if (precio > 0) { data.totalAmount = String(precio); data.monthlyPrice = precio; }
      } catch { /* sin precio: queda como antes */ }
    }
    const ref = await db.collection('reservationOrders').add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) {
    console.error('POST /reservation-order error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /reservation-order/:id
ordersRouter.put('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, updatedAt: now };
    await db.collection('reservationOrders').doc(req.params['id']).set(data, { merge: true });
    const updated = await db.collection('reservationOrders').doc(req.params['id']).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    console.error('PUT /reservation-order/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /reservation-order/:id
ordersRouter.delete('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    await db.collection('reservationOrders').doc(req.params['id']).delete();
    res.json({ message: 'Order deleted' });
  } catch (err) {
    console.error('DELETE /reservation-order/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /reservation-order/:id/cancel
ordersRouter.post('/:id/cancel', verifyToken, async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('reservationOrders').doc(req.params['id']).get();
    if (!doc.exists) {
      res.status(404).json({ message: 'Order not found' });
      return;
    }
    const now = new Date().toISOString();
    await db.collection('reservationOrders').doc(req.params['id']).set(
      { status: 'cancelled', cancelledAt: now, updatedAt: now },
      { merge: true }
    );
    res.json({ message: 'Order cancelled' });
  } catch (err) {
    console.error('POST /reservation-order/:id/cancel error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
