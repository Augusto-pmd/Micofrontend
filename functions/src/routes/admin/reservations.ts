import { Router, Response } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { db } from '../../config/firebase';
import * as admin from 'firebase-admin';

export const adminReservationsRouter = Router();

// GET /admin/reservations — lista todas las reservas (MP + manuales)
adminReservationsRouter.get('/', requireAuth, async (req, res: Response) => {
  try {
    const limit  = parseInt(req.query['limit']  as string) || 50;
    const status = req.query['status'] as string | undefined;
    const search = (req.query['search'] as string || '').toLowerCase();

    let query: admin.firestore.Query = db.collection('reservations')
      .orderBy('createdAt', 'desc');

    if (status) query = query.where('status', '==', status);

    const snap = await query.limit(limit).get();

    let docs = snap.docs.map(d => {
      const data = d.data();
      return {
        id:                   d.id,
        status:               data['status'],
        mpSubscriptionStatus: data['mpSubscriptionStatus'],
        mpPreapprovalId:      data['mpPreapprovalId'],
        // Cliente
        customerName:  data['customerName']  || '',
        customerEmail: data['customerEmail'] || '',
        customerPhone: data['customerPhone'] || '',
        customerDni:   data['customerDni']   || '',
        userUid:       data['userUid']       || '',
        // Reserva
        sucursalId:   data['sucursalId'],
        category:     data['category'],
        m2:           data['m2'],
        monthly:      data['monthly'],
        firstMonth:   data['firstMonth'],
        startDate:    data['startDate'],
        duration:     data['duration'],
        addons:       data['addons'] || [],
        promosApplied: data['promosApplied'] || [],
        // Timestamps
        createdAt: data['createdAt']?.toDate?.()?.toISOString() || null,
        cancelledAt: data['cancelledAt']?.toDate?.()?.toISOString() || null,
      };
    });

    // Filtro de búsqueda en memoria (nombre, email, id)
    if (search) {
      docs = docs.filter(r =>
        r.id.toLowerCase().includes(search) ||
        r.customerName.toLowerCase().includes(search) ||
        r.customerEmail.toLowerCase().includes(search) ||
        r.customerDni.toLowerCase().includes(search)
      );
    }

    res.json({
      data:  docs,
      total: docs.length,
    });
  } catch (err) {
    console.error('Error listing reservations:', err);
    res.status(500).json({ error: 'Could not list reservations' });
  }
});

// GET /admin/reservations/:id
adminReservationsRouter.get('/:id', requireAuth, async (req, res: Response) => {
  try {
    const snap = await db.collection('reservations').doc(req.params.id).get();
    if (!snap.exists) { res.status(404).json({ error: 'Not found' }); return; }
    const d = snap.data()!;
    res.json({
      id: snap.id,
      ...d,
      createdAt:   d['createdAt']?.toDate?.()?.toISOString()   || null,
      cancelledAt: d['cancelledAt']?.toDate?.()?.toISOString() || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not get reservation' });
  }
});

// PATCH /admin/reservations/:id — actualizar status o asignar espacio
adminReservationsRouter.patch('/:id', requireAuth, async (req, res: Response) => {
  try {
    const allowed = ['status', 'mpSubscriptionStatus', 'storageRoomId', 'notes'];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' }); return;
    }
    await db.collection('reservations').doc(req.params.id).update(patch);
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update reservation' });
  }
});

// DELETE /admin/reservations/:id — eliminar una solicitud/reserva (ej. pendiente sin pagar)
adminReservationsRouter.delete('/:id', requireAuth, async (req, res: Response) => {
  try {
    await db.collection('reservations').doc(req.params.id).delete();
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('DELETE /admin/reservations/:id error:', err);
    res.status(500).json({ error: 'Could not delete reservation' });
  }
});
