import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { isStaffEmail, staffEmails, requireStaff } from '../../middleware/requireStaff';
import { requireAuth } from '../../middleware/requireAuth';
import { sendAdminPasswordEmail } from '../../services/customerAuth.service';

export const authRouter = Router();

// POST /auth/is-staff { email } → { staff: boolean } — FUENTE ÚNICA de la allowlist.
// El login del panel consulta acá en vez de mantener una lista duplicada en el front
// (antes había 2 listas a sincronizar a mano → riesgo de "entra pero todo le da 403").
// Devuelve SOLO un booleano (no expone la lista).
authRouter.post('/is-staff', (req: Request, res: Response) => {
  const email = String(((req.body || {}) as { email?: string }).email || '');
  res.json({ staff: isStaffEmail(email) });
});

// GET /auth/staff — usuarios con acceso al panel + su rol (para la pantalla Operadores).
// Cruza la allowlist con la colección operators (si el email tiene doc de operador, usa ese rol;
// si no, es admin por allowlist). También lista operadores fuera de la allowlist (no pueden entrar).
authRouter.get('/staff', requireAuth, requireStaff, async (_req: Request, res: Response) => {
  try {
    const opSnap = await db.collection('operators').get();
    const ops = new Map<string, { id: string; name: string; role: string }>();
    opSnap.forEach((d) => {
      const o = d.data() as Record<string, unknown>;
      const e = String(o.email || '').toLowerCase().trim();
      if (!e) return;
      ops.set(e, {
        id: d.id,
        name: String(o.fullName || `${o.firstName || ''} ${o.lastName || ''}`).trim(),
        role: String(o.role || 'role-operator'),
      });
    });
    const usuarios: Array<{ email: string; name: string; role: string; origen: string; puedeEntrar: boolean }> = [];
    for (const e of staffEmails()) {
      const op = ops.get(e);
      usuarios.push({
        email: e,
        name: op?.name || '',
        role: op?.role || 'role-admin',
        origen: op ? 'allowlist + operador' : 'allowlist',
        puedeEntrar: true,
      });
    }
    ops.forEach((op, e) => {
      if (!usuarios.some((u) => u.email === e)) {
        usuarios.push({ email: e, name: op.name, role: op.role, origen: 'solo operador', puedeEntrar: isStaffEmail(e) });
      }
    });
    res.json({ dominioPermitido: '@micontainer.com (cualquier casilla del dominio entra)', usuarios });
  } catch (err) {
    console.error('GET /auth/staff error:', err);
    res.status(500).json({ error: 'No se pudo listar los usuarios del panel' });
  }
});

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

// (POST /auth/login ELIMINADO 12/07: era el login simbólico pre-Firebase — devolvía token
// 'use-google-oauth' sin validar la contraseña. El login real es Firebase Auth en el front;
// este router conserva /is-staff, /staff y /forgot-password.)
