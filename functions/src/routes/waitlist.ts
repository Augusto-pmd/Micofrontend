import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { verifyToken } from '../middleware/verifyToken';

// Lista de espera: cuando una medida no tiene stock, el cliente se anota y se
// lo contacta/notifica cuando se libera una unidad de esa medida.
export const waitlistRouter = Router();

// POST /waitlist (PÚBLICO) — anotarse.
waitlistRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { email, name, phone, m2, category, branchId } = req.body || {};
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
waitlistRouter.get('/', verifyToken, async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection('waitlist').orderBy('createdAt', 'desc').get();
    res.json({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error('GET /waitlist error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
