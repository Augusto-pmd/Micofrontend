import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { verifyToken } from '../middleware/verifyToken';
import { requireStaff } from '../middleware/requireStaff';

// Lista de espera: cuando una medida no tiene stock, el cliente se anota y se
// lo contacta/notifica cuando se libera una unidad de esa medida.
export const waitlistRouter = Router();

// POST /waitlist (PÚBLICO) — anotarse.
waitlistRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { email, name, phone, m2, category, branchId, type, desiredDate, duration } = req.body || {};
    if (!email && !phone) {
      res.status(400).json({ message: 'Se requiere email o telefono' });
      return;
    }
    const now = new Date().toISOString();
    const ref = await db.collection('waitlist').add({
      email: email || null,
      name: name || null,
      phone: phone || null,
      m2: m2 ?? null,
      category: category || null,
      branchId: branchId || null,
      type: type === 'futuro' ? 'futuro' : 'sin_stock',  // futuro = reserva diferida con fecha
      desiredDate: desiredDate || null,
      duration: duration ?? null,
      status: 'waiting',
      createdAt: now,
      notifiedAt: null,
    });
    res.status(201).json({ id: ref.id, message: 'Anotado en lista de espera' });
  } catch (err) {
    console.error('POST /waitlist error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /waitlist (ADMIN) — listar anotados.
waitlistRouter.get('/', verifyToken, requireStaff, async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('waitlist').orderBy('createdAt', 'desc').get();
    res.json({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error('GET /waitlist error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /waitlist/:id (ADMIN) — eliminar un anotado.
waitlistRouter.delete('/:id', verifyToken, requireStaff, async (req: Request, res: Response) => {
  try {
    await db.collection('waitlist').doc(req.params['id']).delete();
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /waitlist/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
