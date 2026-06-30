import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { sendActivationEmail } from '../services/customerAuth.service';

export const portalRouter = Router();

// POST /portal/activate { email } — el cliente pide su link de activacion (crear contraseña).
// Respuesta SIEMPRE generica (no revela si el email existe o no).
portalRouter.post('/activate', async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) { res.status(400).json({ error: 'Falta el email' }); return; }
    const snap = await db.collection('customers').where('email', '==', email).limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0].data() as any;
      await sendActivationEmail(email, d.fullName || d.firstName || '');
    }
    res.json({ ok: true, message: 'Si el email está registrado, te enviamos el link para activar tu cuenta.' });
  } catch (err) {
    console.error('POST /portal/activate error:', err);
    res.status(500).json({ error: 'No se pudo procesar' });
  }
});
