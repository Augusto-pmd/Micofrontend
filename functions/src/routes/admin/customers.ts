import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';

export const customersRouter = Router();

// GET /customer
customersRouter.get('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 10;
    const search = (req.query['search'] as string | undefined)?.toLowerCase();

    const snapshot = await db.collection('customers').orderBy('createdAt', 'desc').get();
    let all = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    if (search) {
      all = all.filter((c: any) =>
        c.firstName?.toLowerCase().includes(search) ||
        c.lastName?.toLowerCase().includes(search) ||
        c.email?.toLowerCase().includes(search) ||
        c.dni?.toLowerCase().includes(search)
      );
    }

    const total = all.length;
    const start = (page - 1) * limit;
    const data = all.slice(start, start + limit);

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
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
    res.json({ id: doc.id, ...doc.data() });
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
customersRouter.delete('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    await db.collection('customers').doc(req.params['id']).delete();
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    console.error('DELETE /customer/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
