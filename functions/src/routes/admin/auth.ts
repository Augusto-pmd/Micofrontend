import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';

export const authRouter = Router();

// POST /auth/login — email/password login (checks Firestore users collection)
// For Google OAuth users this endpoint is not needed (they use Firebase ID tokens directly)
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ message: 'Email and password are required' });
    return;
  }

  try {
    // Look up user in Firestore
    const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();

    if (snapshot.empty) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    // Basic role check — customers cannot use the admin panel
    if (userData.role === 'role-customer') {
      res.status(403).json({ message: 'Customers cannot access the admin panel' });
      return;
    }

    // Return mock token for email/password (real auth goes through Firebase)
    res.json({
      user: {
        id: userDoc.id,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: { code: userData.role ?? 'role-operator' },
        createdAt: userData.createdAt,
        updatedAt: userData.updatedAt,
      },
      token: 'use-google-oauth',
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
