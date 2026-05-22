import { Router, Request, Response } from 'express';
import { db, auth } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';

export const usersRouter = Router();

// GET /user/:id — get user profile
usersRouter.get('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    // Try operators collection first, then customers
    let doc = await db.collection('operators').doc(req.params['id']).get();
    if (!doc.exists) {
      doc = await db.collection('customers').doc(req.params['id']).get();
    }

    if (doc.exists) {
      res.json({ id: doc.id, ...doc.data() });
      return;
    }

    // Fall back to Firebase Auth profile
    const fbUser = await auth.getUser(req.params['id']);
    res.json({
      id: fbUser.uid,
      email: fbUser.email,
      firstName: fbUser.displayName?.split(' ')[0] ?? '',
      lastName: fbUser.displayName?.split(' ').slice(1).join(' ') ?? '',
      role: 'role-admin',
      isActive: !fbUser.disabled,
    });
  } catch (err) {
    console.error('GET /user/:id error:', err);
    res.status(404).json({ message: 'User not found' });
  }
});

// PUT /user/:id — update user profile
usersRouter.put('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, updatedAt: now };

    // Try operators first
    const opDoc = await db.collection('operators').doc(req.params['id']).get();
    const collection = opDoc.exists ? 'operators' : 'customers';

    await db.collection(collection).doc(req.params['id']).set(data, { merge: true });
    const updated = await db.collection(collection).doc(req.params['id']).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    console.error('PUT /user/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
