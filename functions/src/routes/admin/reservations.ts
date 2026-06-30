import { Router, Response } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { db } from '../../config/firebase';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { assignRoomForReservation, holdRoomForReservation } from '../../services/assignment.service';
import { getReservation, createReservation } from '../../models/reservation.model';
import { createSubscription } from '../../services/mercadopago.service';
import { getPricingByM2, recurringFor } from '../../services/pricing.service';
import { generateReservationId } from '../../utils/generateId';
import { logAudit } from '../../services/audit.service';

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
        storageRoomId: data['storageRoomId'] || null,
        bauleraCodigo: data['bauleraCodigo'] || null,
        heldUntil:    data['heldUntil'] || null,
        source:       data['source'] || 'online',
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

// POST /admin/reservations/sell — VENTA MANUAL: crea reserva + link de pago MP
// Recibe cliente + baulera + desde/hasta + meses promo + descuento.
adminReservationsRouter.post('/sell', requireAuth, async (req, res: Response) => {
  try {
    const {
      sucursalId = 'nordelta', category = 'Baulera', m2,
      storageRoomId, bauleraCodigo,
      name = '', email = '', phone = '', dni = '',
      startDate, endDate, durationMonths,
      promoMonths = 0, discountPct = 0, priceOverride,
    } = req.body || {};

    if (!email) { res.status(400).json({ error: 'Falta el email del cliente' }); return; }
    if (!m2)    { res.status(400).json({ error: 'Falta la medida (m2)' }); return; }

    // Duración en meses: explícita o calculada desde fechas
    let duration = Number(durationMonths) || 0;
    if (!duration && startDate && endDate) {
      const d1 = new Date(startDate).getTime();
      const d2 = new Date(endDate).getTime();
      if (d2 > d1) duration = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24 * 30)));
    }
    if (!duration) duration = 1;

    // Precio: override manual del admin si viene; si no, la tarifa por medida (con dto 12m)
    const byM2 = await getPricingByM2(sucursalId);
    let monthlyNum = Number(priceOverride) > 0
      ? Number(priceOverride)
      : (recurringFor(byM2, Number(m2), duration) ?? 0);
    if (!(monthlyNum > 0)) {
      res.status(400).json({ error: `No hay precio cargado para ${m2}m². Cargalo en Tarifas o poné un precio manual.` });
      return;
    }

    // Descuento manual (%)
    const disc = Number(discountPct) || 0;
    if (disc > 0) monthlyNum = Math.round(monthlyNum * (1 - disc / 100));

    const id = generateReservationId();
    const uid = `manual_${crypto.createHash('sha1').update(String(email).toLowerCase()).digest('hex').slice(0, 16)}`;

    // Reservar (hold) la baulera 20 min antes de cobrar (evita doble venta y asegura la correcta)
    const hold = await holdRoomForReservation({ reservationId: id, branchId: sucursalId, m2: Number(m2), targetRoomId: storageRoomId || undefined });
    if (!hold.ok) {
      res.status(409).json({ error: hold.reason === 'sin_stock' ? `Sin stock de ${m2}m2. Ofrece otra medida.` : 'No se pudo reservar la baulera', code: hold.reason, alternativasByM2: hold.alternativasByM2 || {} });
      return;
    }

    // Suscripción Mercado Pago (el emulador la saltea)
    let preapprovalId: string;
    let initPoint: string;
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      preapprovalId = `emu-${id}`;
      initPoint = `https://www.mercadopago.com.ar/subscriptions/emulator-demo?ref=${id}`;
    } else {
      ({ preapprovalId, initPoint } = await createSubscription({
        reservationId: id,
        categoryLabel: category,
        m2: Number(m2),
        amount: monthlyNum,
        email: String(email),
        backUrl: 'https://micontainer.com/#/portal',
        freeTrialMonths: Number(promoMonths) || 0,
      }));
    }

    await createReservation({
      id,
      userUid: uid,
      sucursalId,
      category,
      m2: Number(m2),
      monthly: monthlyNum,
      firstMonth: Number(promoMonths) > 0 ? 0 : monthlyNum,
      startDate: startDate || new Date().toISOString().slice(0, 10),
      duration,
      addons: [],
      promosApplied: [],
      status: 'pending_payment',
      mpPreapprovalId: preapprovalId,
      mpInitPoint: initPoint,
      mpSubscriptionStatus: 'pending',
      faceEnrollStatus: 'not_started',
      faceEnrollAttempts: 0,
      customerName: name || undefined,
      customerEmail: email || undefined,
      customerPhone: phone || undefined,
      customerDni: dni || undefined,
      storageRoomId: hold.roomId,
      // extras (se persisten por spread)
      bauleraCodigo: hold.bauleraCodigo || bauleraCodigo || undefined,
      endDate: endDate || undefined,
      promoMonths: Number(promoMonths) || 0,
      discountPct: disc,
      source: 'manual_admin',
    } as any);

    await logAudit({
      actor: (req as any).email || (req as any).uid || 'admin',
      via: (req.body?.via as string) || 'admin',
      action: 'link_generado',
      entity: 'reservation',
      entityId: id,
      branchId: sucursalId,
      detail: { cliente: name, email, baulera: hold.bauleraCodigo, m2: Number(m2), monthly: monthlyNum, heldUntil: hold.heldUntil, promoMonths: Number(promoMonths) || 0, discountPct: disc },
    });
    res.status(201).json({ reservationId: id, initPoint, preapprovalId, monthly: monthlyNum, duration });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /admin/reservations/sell error:', err);
    res.status(500).json({ error: 'No se pudo generar la venta', detail: message });
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

// POST /admin/reservations/:id/assign-room — asignar/reasignar baulera puntual a una reserva
adminReservationsRouter.post('/:id/assign-room', requireAuth, async (req, res: Response) => {
  try {
    const reservation = await getReservation(req.params.id);
    if (!reservation) { res.status(404).json({ error: 'Reservation not found' }); return; }

    // si ya tenia baulera asignada, liberarla antes de reasignar
    if (reservation.storageRoomId) {
      await db.collection('storageRooms').doc(reservation.storageRoomId).set({
        status: 'available', customerId: null, currentTenant: null,
        reservationId: null, updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

    const targetRoomId = (req.body?.storageRoomId as string) || undefined;
    const roomId = await assignRoomForReservation(reservation, targetRoomId);
    if (!roomId) {
      res.status(409).json({ error: `Sin baulera libre de ${reservation.m2}m2` });
      return;
    }
    await logAudit({
      actor: (req as any).email || (req as any).uid || 'admin',
      via: (req.body?.via as string) || 'admin',
      action: 'reasignar_baulera',
      entity: 'reservation',
      entityId: req.params.id,
      detail: { storageRoomId: roomId },
    });
    res.json({ message: 'Assigned', storageRoomId: roomId });
  } catch (err) {
    console.error('POST /admin/reservations/:id/assign-room error:', err);
    res.status(500).json({ error: 'Could not assign room' });
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
