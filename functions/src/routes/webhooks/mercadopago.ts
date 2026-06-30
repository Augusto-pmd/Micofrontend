import { Router, Request, Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../../config/firebase';
import { getReservationByMpPreapprovalId, updateReservation, MpSubscriptionStatus } from '../../models/reservation.model';
import { createPayment } from '../../models/payment.model';
import { verifyMpWebhookSignature } from '../../utils/hmac';
import { assignRoomForReservation } from '../../services/assignment.service';
import { logAudit } from '../../services/audit.service';
import { sendActivationEmail } from '../../services/customerAuth.service';

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
      // Asignar baulera puntual + ocuparla + crear la venta
      const assignedRoom = await assignRoomForReservation({ ...reservation, status: 'active' }, reservation.storageRoomId);
      if (assignedRoom) {
        console.log(`[mp-webhook] Reservation ${reservation.id} -> baulera ${assignedRoom}`);
      } else {
        console.warn(`[mp-webhook] sin baulera libre de ${reservation.m2}m2 para ${reservation.id}`);
      }
      // Auditoría: alta efectiva tras el pago
      await logAudit({
        actor: reservation.customerEmail || reservation.userUid || 'cliente',
        via: 'mercadopago',
        action: 'alta_suscripcion',
        entity: 'reservation',
        entityId: reservation.id,
        branchId: reservation.sucursalId,
        detail: { cliente: reservation.customerName || '', baulera: assignedRoom || reservation.storageRoomId || null, monthly: reservation.monthly },
      });
      // Onboarding del portal: mail de activacion (crear contraseña + confirmar email)
      if (reservation.customerEmail) {
        try { await sendActivationEmail(reservation.customerEmail, reservation.customerName || ''); }
        catch (e) { console.warn('[mp-webhook] activation email fail', e); }
      }
    }

    const eventDate = (body.date_created as string) ?? new Date().toISOString();
    const period = eventDate.slice(0, 7);
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

    const rawStatus = data?.status as string;
    const VALID_MP_STATUSES: MpSubscriptionStatus[] = ['pending', 'authorized', 'paused', 'cancelled'];
    const mpStatus: MpSubscriptionStatus = VALID_MP_STATUSES.includes(rawStatus as MpSubscriptionStatus)
      ? (rawStatus as MpSubscriptionStatus)
      : 'cancelled';
    const newStatus = rawStatus === 'cancelled' ? 'cancelled' : 'payment_failed';

    // La baja vino por MP (la inicia el cliente desde su cuenta). Si en el futuro el
    // admin cancela desde el panel, ese flujo marcara cancelledBy='admin' antes.
    const cancelledBy = (reservation as any).cancelledBy || 'cliente';

    await updateReservation(reservation.id, {
      status: newStatus,
      mpSubscriptionStatus: mpStatus,
      cancelledAt: Timestamp.now(),
      cancelledBy,
      bajaGestionada: newStatus === 'cancelled' ? false : undefined,
    } as any);

    // Si quedo cancelada, liberar la baulera para que vuelva a estar disponible
    if (newStatus === 'cancelled' && reservation.storageRoomId) {
      await db.collection('storageRooms').doc(reservation.storageRoomId).set({
        status: 'available',
        customerId: null,
        currentTenant: null,
        reservationId: null,
        heldUntil: null,
        heldByReservationId: null,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

    // Auditoría de la baja
    await logAudit({
      actor: reservation.customerEmail || reservation.userUid || 'cliente',
      via: 'mercadopago',
      role: cancelledBy === 'admin' ? 'admin' : 'cliente',
      action: 'baja_suscripcion',
      entity: 'reservation',
      entityId: reservation.id,
      branchId: reservation.sucursalId,
      detail: {
        cliente: reservation.customerName || '',
        baulera: reservation.storageRoomId || null,
        dadaDeBajaPor: cancelledBy,
        mpStatus: rawStatus,
      },
    });

    console.log(`[mp-webhook] Reservation ${reservation.id} → ${newStatus} (por ${cancelledBy})`);
  }
}
