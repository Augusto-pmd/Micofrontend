import { Router, Response } from 'express';
import { requireAuth, optionalAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { createReservation, getUserReservations, getReservation, updateReservation } from '../models/reservation.model';
import { createSubscription, cancelSubscription } from '../services/mercadopago.service';
import { generateReservationId } from '../utils/generateId';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

export const reservationsRouter = Router();

const REQUIRED_FIELDS = ['sucursalId', 'category', 'm2', 'monthly', 'firstMonth', 'startDate', 'duration'];

const BACK_URL = 'https://micontainer.com/#/portal';

// POST /reservations — create reservation + start MP subscription
// Auth is OPTIONAL: logged-in users get linked to their Firebase uid;
// guests are identified by a deterministic uid derived from their email.
reservationsRouter.post('/', optionalAuth, async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  // Resolve uid and email: prefer auth token, fall back to form body
  const bodyEmail: string = (req.body.email ?? '').trim().toLowerCase();
  const uid: string  = authReq.uid   || `guest_${crypto.createHash('sha1').update(bodyEmail).digest('hex').slice(0, 16)}`;
  const email: string = authReq.email || bodyEmail;

  if (!email) {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  // Validate required fields
  const missing = REQUIRED_FIELDS.filter((f) => req.body[f] === undefined);
  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    return;
  }

  const {
    sucursalId, category, m2, monthly, firstMonth,
    startDate, duration, addons = [], promosApplied = [],
    name = '', phone = '', dni = '',
  } = req.body;

  try {
    const id = generateReservationId();

    // Create subscription in Mercado Pago
    const { preapprovalId, initPoint } = await createSubscription({
      reservationId: id,
      categoryLabel: category,
      m2,
      amount: monthly,
      email,
      backUrl: BACK_URL,
    });

    // Save reservation to Firestore (includes guest contact info)
    await createReservation({
      id,
      userUid: uid,
      sucursalId,
      category,
      m2,
      monthly,
      firstMonth,
      startDate,
      duration,
      addons,
      promosApplied,
      status: 'pending_payment',
      mpPreapprovalId: preapprovalId,
      mpInitPoint: initPoint,          // guardamos el link para poder retomar el pago
      mpSubscriptionStatus: 'pending',
      faceEnrollStatus: 'not_started',
      faceEnrollAttempts: 0,
      // Guest contact info (populated from form when not logged in)
      customerName:  name  || undefined,
      customerEmail: email || undefined,
      customerPhone: phone || undefined,
      customerDni:   dni   || undefined,
    });

    res.status(201).json({ reservationId: id, initPoint });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error creating reservation:', err);
    res.status(500).json({ error: 'Could not create reservation', detail: message });
  }
});

// GET /reservations — list client's reservations
reservationsRouter.get('/', requireAuth, async (req, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  try {
    const reservations = await getUserReservations(uid);
    res.json({ reservations });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Could not fetch reservations' });
  }
});

// GET /reservations/:id — reservation detail
reservationsRouter.get('/:id', requireAuth, async (req, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  try {
    const reservation = await getReservation(req.params.id);
    if (!reservation) {
      res.status(404).json({ error: 'Reservation not found' });
      return;
    }
    if (reservation.userUid !== uid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json({ reservation });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Could not fetch reservation' });
  }
});

// POST /reservations/:id/cancel — cancel reservation
reservationsRouter.post('/:id/cancel', requireAuth, async (req, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  try {
    const reservation = await getReservation(req.params.id);
    if (!reservation) {
      res.status(404).json({ error: 'Reservation not found' });
      return;
    }
    if (reservation.userUid !== uid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (reservation.status === 'cancelled') {
      res.status(409).json({ error: 'Already cancelled' });
      return;
    }

    // Cancel in MP
    if (reservation.mpPreapprovalId) {
      await cancelSubscription(reservation.mpPreapprovalId);
    }

    await updateReservation(req.params.id, {
      status: 'cancelled',
      cancelledAt: admin.firestore.Timestamp.now(),
    });

    res.json({ message: 'Reservation cancelled' });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Could not cancel reservation' });
  }
});
