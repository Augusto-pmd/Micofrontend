import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';

export const ordersRouter = Router();

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
    const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
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
