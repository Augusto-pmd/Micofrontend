import { Router, Request, Response } from 'express';
import { db, auth } from '../config/firebase';
import { sendActivationEmail, sendPasswordRecoveryEmail } from '../services/customerAuth.service';

export const portalRouter = Router();

// POST /portal/activate { email } — el cliente pide su link para crear O recuperar la contraseña.
// El MAIL correcto según el caso (pedido de Lucas 12/07):
//   - email ya VERIFICADO (ya activó su cuenta antes) → "Recuperá tu contraseña"
//   - primera vez (sin verificar / sin cuenta)        → "Bienvenido, activá tu cuenta"
// Respuesta SIEMPRE generica (no revela si el email existe o no).
portalRouter.post('/activate', async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) { res.status(400).json({ error: 'Falta el email' }); return; }
    const snap = await db.collection('customers').where('email', '==', email).limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0].data() as any;
      const nombre = d.fullName || d.firstName || '';
      let yaActivada = false;
      try { yaActivada = (await auth.getUserByEmail(email)).emailVerified === true; } catch { /* sin cuenta aún */ }
      if (yaActivada) await sendPasswordRecoveryEmail(email, nombre);
      else await sendActivationEmail(email, nombre);
    }
    res.json({ ok: true, message: 'Si el email está registrado, te enviamos el link por correo.' });
  } catch (err) {
    console.error('POST /portal/activate error:', err);
    res.status(500).json({ error: 'No se pudo procesar' });
  }
});
