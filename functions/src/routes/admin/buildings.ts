import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';

export const buildingsRouter = Router();

// GET /building
buildingsRouter.get('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 10;
    const branchId = req.query['branchId'] as string | undefined;

    let query: FirebaseFirestore.Query = db.collection('buildings');
    if (branchId) {
      query = query.where('branchId', '==', branchId);
    }

    const snapshot = await query.get();
    const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const total = all.length;
    const start = (page - 1) * limit;
    const data = all.slice(start, start + limit);

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('GET /building error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /building/:id
buildingsRouter.get('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('buildings').doc(req.params['id']).get();
    if (!doc.exists) {
      res.status(404).json({ message: 'Building not found' });
      return;
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error('GET /building/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /building
buildingsRouter.post('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, createdAt: now, updatedAt: now };
    const ref = await db.collection('buildings').add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) {
    console.error('POST /building error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /building/:id
buildingsRouter.put('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, updatedAt: now };
    await db.collection('buildings').doc(req.params['id']).set(data, { merge: true });
    const updated = await db.collection('buildings').doc(req.params['id']).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    console.error('PUT /building/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /building/:id
buildingsRouter.delete('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    await db.collection('buildings').doc(req.params['id']).delete();
    res.json({ message: 'Building deleted' });
  } catch (err) {
    console.error('DELETE /building/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
