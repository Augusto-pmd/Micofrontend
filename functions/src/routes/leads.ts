import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { verifyToken } from '../middleware/verifyToken';
import { requireStaff } from '../middleware/requireStaff';

export const leadsRouter = Router();

// GET /leads?branchId= (admin) — contactos clasificados en clientes / no clientes
leadsRouter.get('/', verifyToken, requireStaff, async (req: Request, res: Response) => {
  try {
    const branchId = req.query['branchId'] as string | undefined;
    let custQ: FirebaseFirestore.Query = db.collection('customers');
    if (branchId) custQ = custQ.where('branchId', '==', branchId);
    const [custSnap, wlSnap, roomSnap] = await Promise.all([
      custQ.get(),
      db.collection('waitlist').get(),
      db.collection('storageRooms').where('status', '==', 'occupied').get(),
    ]);

    // Bauleras ocupadas por cliente (customerId → doc de customer → email) para poder
    // FILTRAR el mailing por metros o por baulera (pedido Lucas 12/07).
    const emailByCustDoc = new Map<string, string>();
    custSnap.forEach((d) => {
      const e = String((d.data() as Record<string, unknown>).email || '').toLowerCase().trim();
      if (e) emailByCustDoc.set(d.id, e);
    });
    const roomsByEmail = new Map<string, Array<{ baulera: string; m2: number }>>();
    roomSnap.forEach((d) => {
      const r = d.data() as Record<string, unknown>;
      const email = emailByCustDoc.get(String(r.customerId || '')) ||
        String((r as any).tenantEmail || '').toLowerCase().trim();
      if (!email) return;
      const item = { baulera: String(r.space || r.name || d.id), m2: Number(r.areaM2) || 0 };
      if (!roomsByEmail.has(email)) roomsByEmail.set(email, []);
      roomsByEmail.get(email)!.push(item);
    });

    // DEDUPE por persona: customers guarda UN doc por contrato/venta (PALCARE tiene 3, etc.)
    // → sin esto la pantalla Avisos contaba "148 clientes" y podía mandarle el mismo mail
    // varias veces a la misma persona. Se unifica por email (o teléfono si no hay email).
    const vistos = new Set<string>();
    const clientes = custSnap.docs.map((d) => {
      const c = d.data() as Record<string, unknown>;
      const name = String(c.fullName || `${c.firstName || ''} ${c.lastName || ''}`).trim();
      const email = String(c.email || '');
      const rooms = roomsByEmail.get(email.toLowerCase().trim()) || [];
      return {
        id: d.id, name, email, phone: String(c.phone || ''),
        // bauleras + m2 REALES del inventario (para filtrar por metros / baulera):
        bauleras: rooms.map((r) => r.baulera),
        m2s: [...new Set(rooms.map((r) => r.m2).filter((n) => n > 0))],
        roomsInfo: rooms,
        m2: c.m2 ?? null,
      };
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
