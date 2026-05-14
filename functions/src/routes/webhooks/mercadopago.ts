import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { getReservationByMpPreapprovalId, updateReservation, MpSubscriptionStatus } from '../../models/reservation.model';
import { createPayment } from '../../models/payment.model';
import { verifyMpWebhookSignature } from '../../utils/hmac';

export const mpWebhookRouter = Router();

const PAYMENT_APPROVED_TYPES = ['subscription_authorized_payment', 'payment'];
const SUBSCRIPTION_CANCELLED_TYPES = ['subscription_preapproval'];

mpWebhookRouter.post('/', async (req: Request, res: Response) => {
  const signature = req.headers['x-signature'] as string;
  const secret = process.env.MP_WEBHOOK_SECRET ?? '';
  const rawBody = JSON.stringify(req.body);

  if (secret && !verifyMpWebhookSignature(rawBody, signature, secret)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Respond 200 immediately (MP expects response < 5s)
  res.status(200).json({ received: true });

  // Process asynchronously without blocking the response
  processWebhook(req.body).catch((err) =>
    console.error('[mp-webhook] Processing error:', err)
  );
});

async function processWebhook(body: Record<string, unknown>): Promise<void> {
  const type = body.type as string;
  const data = body.data as Record<string, unknown> | undefined;

  if (PAYMENT_APPROVED_TYPES.includes(type)) {
    const preapprovalId = data?.id as string | undefined;
    if (!preapprovalId) return;

    const reservation = await getReservationByMpPreapprovalId(preapprovalId);
    if (!reservation) {
      console.warn('[mp-webhook] Reservation not found for preapprovalId:', preapprovalId);
      return;
    }

    if (reservation.status === 'pending_payment') {
      await updateReservation(reservation.id, {
        status: 'active',
        mpSubscriptionStatus: 'authorized',
      });
    }

    const period = new Date().toISOString().slice(0, 7);
    await createPayment({
      id: `${String(data?.id)}-${period}`,
      reservationId: reservation.id,
      userUid: reservation.userUid,
      mpPreapprovalId: preapprovalId,
      mpPaymentId: String(data?.id),
      type: reservation.status === 'pending_payment' ? 'initial' : 'recurring_payment',
      amount: reservation.monthly,
      currency: 'ARS',
      status: 'approved',
      period,
    });

    return;
  }

  if (SUBSCRIPTION_CANCELLED_TYPES.includes(type)) {
    const preapprovalId = data?.id as string | undefined;
    if (!preapprovalId) return;

    const reservation = await getReservationByMpPreapprovalId(preapprovalId);
    if (!reservation) return;

    const dataWithStatus = data as Record<string, unknown> | undefined;
    const newStatus = dataWithStatus?.status === 'cancelled' ? 'cancelled' : 'payment_failed';

    await updateReservation(reservation.id, {
      status: newStatus,
      mpSubscriptionStatus: ((dataWithStatus?.status as MpSubscriptionStatus) ?? 'cancelled') as MpSubscriptionStatus,
      cancelledAt: admin.firestore.Timestamp.now(),
    });

    console.log(`[mp-webhook] Reservation ${reservation.id} → ${newStatus}`);
  }
}
