import { Router, Response } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { db } from '../../config/firebase';
import { logAudit } from '../../services/audit.service';

export const adminCancellationsRouter = Router();

// GET /admin/cancellations?pending=true — bajas de suscripcion
adminCancellationsRouter.get('/', requireAuth, async (req, res: Response) => {
  try {
    const pendingOnly = req.query['pending'] === 'true';
    const snap = await db.collection('reservations').where('status', '==', 'cancelled').limit(200).get();
    let docs = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        customerName: x['customerName'] || '',
        customerEmail: x['customerEmail'] || '',
        customerPhone: x['customerPhone'] || '',
        m2: x['m2'] ?? null,
        storageRoomId: x['storageRoomId'] || null,
        bauleraCodigo: x['bauleraCodigo'] || null,
        cancelledBy: x['cancelledBy'] || 'cliente',
        bajaGestionada: x['bajaGestionada'] === true,
        bajaDecision: x['bajaDecision'] || null,
        cancelledAt: x['cancelledAt']?.toDate?.()?.toISOString() || null,
      };
    });
    docs.sort((a, b) => String(b.cancelledAt || '').localeCompare(String(a.cancelledAt || '')));
    if (pendingOnly) docs = docs.filter((r) => !r.bajaGestionada);
    res.json({ data: docs, total: docs.length });
  } catch (err) {
    console.error('GET /admin/cancellations error:', err);
    res.status(500).json({ error: 'Could not list cancellations' });
  }
});

// POST /admin/cancellations/:id/resolve — marcar gestionada + decision/nota
adminCancellationsRouter.post('/:id/resolve', requireAuth, async (req, res: Response) => {
  try {
    const decision = (req.body?.decision as string) || '';
    const nota = (req.body?.nota as string) || '';
    await db.collection('reservations').doc(req.params.id).update({
      bajaGestionada: true,
      bajaDecision: decision,
      bajaNota: nota,
      bajaGestionadaAt: new Date().toISOString(),
    });
    await logAudit({
      actor: (req as any).email || (req as any).uid || 'admin',
      via: 'admin',
      action: 'gestion_baja',
      entity: 'reservation',
      entityId: req.params.id,
      detail: { decision, nota },
    });
    res.json({ message: 'ok' });
  } catch (err) {
    console.error('POST /admin/cancellations/:id/resolve error:', err);
    res.status(500).json({ error: 'Could not resolve cancellation' });
  }
});
