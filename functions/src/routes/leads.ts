import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { verifyToken } from '../middleware/verifyToken';

export const leadsRouter = Router();

// GET /leads?branchId= (admin) — contactos clasificados en clientes / no clientes
leadsRouter.get('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const branchId = req.query['branchId'] as string | undefined;
    let custQ: FirebaseFirestore.Query = db.collection('customers');
    if (branchId) custQ = custQ.where('branchId', '==', branchId);
    const [custSnap, wlSnap] = await Promise.all([
      custQ.get(),
      db.collection('waitlist').get(),
    ]);

    // DEDUPE por persona: customers guarda UN doc por contrato/venta (PALCARE tiene 3, etc.)
    // → sin esto la pantalla Avisos contaba "148 clientes" y podía mandarle el mismo mail
    // varias veces a la misma persona. Se unifica por email (o teléfono si no hay email).
    const vistos = new Set<string>();
    const clientes = custSnap.docs.map((d) => {
      const c = d.data() as Record<string, unknown>;
      const name = String(c.fullName || `${c.firstName || ''} ${c.lastName || ''}`).trim();
      return { id: d.id, name, email: String(c.email || ''), phone: String(c.phone || ''), m2: c.m2 ?? null };
    }).filter((c) => c.email || c.phone)
      .filter((c) => {
        const clave = (c.email || `tel:${c.phone}`).toLowerCase().trim();
        if (vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
      });

    const emails = new Set(clientes.map((c) => c.email.toLowerCase()).filter(Boolean));

    const noClientes = wlSnap.docs.map((d) => {
      const w = d.data() as Record<string, unknown>;
      return {
        id: d.id, name: String(w.name || ''), email: String(w.email || ''),
        phone: String(w.phone || ''), m2: w.m2 ?? null, branchId: (w.branchId as string) || null,
      };
    }).filter((w) => (w.email || w.phone) && !emails.has(w.email.toLowerCase()))
      .filter((w) => !branchId || !w.branchId || w.branchId === branchId);

    res.json({ clientes, noClientes });
  } catch (err) {
    console.error('GET /leads error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
