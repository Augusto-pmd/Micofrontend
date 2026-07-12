import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { isStaffEmail } from '../../middleware/requireStaff';
import { sendAdminPasswordEmail } from '../../services/customerAuth.service';

export const authRouter = Router();

// POST /auth/forgot-password — mail para CREAR/CAMBIAR la contraseña del panel.
// El front lo llamaba desde siempre (pantalla "¿Olvidaste tu contraseña?") pero el endpoint no
// existía. SOLO manda el mail si el email es de staff (allowlist); la respuesta es SIEMPRE
// genérica para no revelar quién es staff. El link es de Firebase (seguro, un solo uso) y al
// terminar vuelve al login del panel. También sirve para que un usuario de Google se agregue
// contraseña (login por ambas vías).
authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  if (email && isStaffEmail(email)) {
    try { await sendAdminPasswordEmail(email); }
    catch (err) { console.error('POST /auth/forgot-password error:', err); }
  }
  // Genérico SIEMPRE (exista o no, sea staff o no)
  res.json({ message: 'Si el email corresponde a un usuario del panel, te enviamos las instrucciones para crear o cambiar tu contraseña.' });
});

// POST /auth/login — email/password login (checks Firestore users collection)
// For Google OAuth users this endpoint is not needed (they use Firebase ID tokens directly)
authRouter.post('/login', async (req: Request, res: Response) => {
  // En el emulador local: login admin de prueba (cualquier email/clave).
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    res.json({
      user: {
        id: 'emulator-admin',
        email: (req.body?.email as string) || 'admin@local',
        firstName: 'Emulador', lastName: 'Admin',
        role: { code: 'role-admin' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      token: 'emulator',
    });
    return;
  }

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
