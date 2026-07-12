import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';

export const operatorsRouter = Router();

// GET /operator
operatorsRouter.get('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 10;

    const snapshot = await db.collection('operators').orderBy('createdAt', 'desc').get();
    const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const total = all.length;
    const start = (page - 1) * limit;
    const data = all.slice(start, start + limit);

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('GET /operator error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /operator/user/:userId — busca el operador por su userId de auth. El front (OrderCreate)
// llama a esta ruta desde siempre, pero NO existía: caía en GET /:id con id="user" → 404.
// OJO: debe declararse ANTES de '/:id' para que Express no la pise.
operatorsRouter.get('/user/:userId', verifyToken, async (req: Request, res: Response) => {
  try {
    const uid = req.params['userId'];
    const snap = await db.collection('operators').where('userId', '==', uid).limit(1).get();
    if (snap.empty) { res.status(404).json({ message: 'Operator not found for user' }); return; }
    const d = snap.docs[0];
    res.json({ id: d.id, ...d.data() });
  } catch (err) {
    console.error('GET /operator/user/:userId error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /operator/:id
operatorsRouter.get('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('operators').doc(req.params['id']).get();
    if (!doc.exists) {
      res.status(404).json({ message: 'Operator not found' });
      return;
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error('GET /operator/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /operator
operatorsRouter.post('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = {
      ...req.body,
      role: req.body.role ?? 'role-operator',
      isActive: req.body.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await db.collection('operators').add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) {
    console.error('POST /operator error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /operator/:id
operatorsRouter.put('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, updatedAt: now };
    await db.collection('operators').doc(req.params['id']).set(data, { merge: true });
    const updated = await db.collection('operators').doc(req.params['id']).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    console.error('PUT /operator/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /operator/:id
operatorsRouter.delete('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    await db.collection('operators').doc(req.params['id']).delete();
    res.json({ message: 'Operator deleted' });
  } catch (err) {
    console.error('DELETE /operator/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
