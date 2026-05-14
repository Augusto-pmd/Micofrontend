import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { createReservation, getUserReservations, getReservation, updateReservation } from '../models/reservation.model';
import { createSubscription, cancelSubscription } from '../services/mercadopago.service';
import { generateReservationId } from '../utils/generateId';
import * as admin from 'firebase-admin';

export const reservationsRouter = Router();

const REQUIRED_FIELDS = ['sucursalId', 'category', 'm2', 'monthly', 'firstMonth', 'startDate', 'duration'];

const BACK_URL = 'https://augusto-pmd.github.io/Micofrontend/#/portal';

// POST /reservations — create reservation + start MP subscription
reservationsRouter.post('/', requireAuth, async (req, res: Response) => {
  const { uid, email } = req as AuthenticatedRequest;

  // Validate required fields
  const missing = REQUIRED_FIELDS.filter((f) => req.body[f] === undefined);
  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    return;
  }

  const {
    sucursalId, category, m2, monthly, firstMonth,
    startDate, duration, addons = [], promosApplied = [],
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

    // Save reservation to Firestore
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
      mpSubscriptionStatus: 'pending',
      faceEnrollStatus: 'not_started',
      faceEnrollAttempts: 0,
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
