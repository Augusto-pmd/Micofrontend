import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';

export const ordersRouter = Router();

async function enrichOrders(orders: any[]) {
  if (orders.length === 0) return orders;

  // Collect unique IDs
  const custIds = [...new Set(orders.map((o: any) => o.customerId).filter(Boolean))];
  const roomIds = [...new Set(orders.map((o: any) => o.storageRoomId).filter(Boolean))];

  // Fetch customers and rooms in parallel
  const [custSnap, roomSnap, bldSnap, brSnap] = await Promise.all([
    custIds.length ? db.getAll(...custIds.map(id => db.collection('customers').doc(id))) : Promise.resolve([]),
    roomIds.length ? db.getAll(...roomIds.map(id => db.collection('storageRooms').doc(id))) : Promise.resolve([]),
    db.collection('buildings').get(),
    db.collection('branches').get(),
  ]);

  const branches: Record<string, any> = {};
  (brSnap as any).docs.forEach((d: any) => { branches[d.id] = { id: d.id, ...d.data() }; });
  const buildings: Record<string, any> = {};
  (bldSnap as any).docs.forEach((d: any) => {
    const b = { id: d.id, ...d.data() } as any;
    b.branch = branches[b.branchId] || null;
    buildings[d.id] = b;
  });

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
ordersRouter.get('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 10;
    const status = req.query['status'] as string | undefined;
    const customerId = req.query['customerId'] as string | undefined;

    let query: FirebaseFirestore.Query = db.collection('reservationOrders').orderBy('createdAt', 'desc');
    if (status) query = query.where('status', '==', status);
    if (customerId) query = query.where('customerId', '==', customerId);

    const snapshot = await query.get();
    const raw = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const all = await enrichOrders(raw);
    const total = all.length;
    const start = (page - 1) * limit;
    const data = all.slice(start, start + limit);

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
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
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error('GET /reservation-order/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /reservation-order
ordersRouter.post('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, status: req.body.status ?? 'pending', createdAt: now, updatedAt: now };
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
