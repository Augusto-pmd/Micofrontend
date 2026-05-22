import { Router, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';
import { Request } from 'express';

export const branchesRouter = Router();

// GET /branch
branchesRouter.get('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 10;

    const snapshot = await db.collection('branches').orderBy('createdAt', 'desc').get();
    const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const total = all.length;
    const start = (page - 1) * limit;
    const data = all.slice(start, start + limit);

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('GET /branch error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /branch/:id
branchesRouter.get('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('branches').doc(req.params['id']).get();
    if (!doc.exists) {
      res.status(404).json({ message: 'Branch not found' });
      return;
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error('GET /branch/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /branch
branchesRouter.post('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, createdAt: now, updatedAt: now };
    const ref = await db.collection('branches').add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) {
    console.error('POST /branch error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /branch/:id
branchesRouter.put('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, updatedAt: now };
    await db.collection('branches').doc(req.params['id']).set(data, { merge: true });
    const updated = await db.collection('branches').doc(req.params['id']).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    console.error('PUT /branch/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /branch/:id
branchesRouter.delete('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    await db.collection('branches').doc(req.params['id']).delete();
    res.json({ message: 'Branch deleted' });
  } catch (err) {
    console.error('DELETE /branch/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
