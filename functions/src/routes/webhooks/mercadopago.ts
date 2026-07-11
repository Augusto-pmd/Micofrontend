import { Router, Request, Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../../config/firebase';
import { getReservationByMpPreapprovalId, getReservation, getReservationByBauleraCodigo, updateReservation, MpSubscriptionStatus } from '../../models/reservation.model';
import { createPayment, PaymentStatus } from '../../models/payment.model';
import { verifyMpWebhookSignature } from '../../utils/hmac';
import { assignRoomForReservation } from '../../services/assignment.service';
import { logAudit } from '../../services/audit.service';
import { sendActivationEmail } from '../../services/customerAuth.service';
import { getPaymentDetail, getSubscriptionStatus, getPreapprovalDetail, setPreapprovalExternalReference, MpPaymentDetail } from '../../services/mercadopago.service';
import { Reservation } from '../../models/reservation.model';

export const mpWebhookRouter = Router();

const PAYMENT_APPROVED_TYPES = ['subscription_authorized_payment', 'payment'];
const SUBSCRIPTION_CANCELLED_TYPES = ['subscription_preapproval'];

mpWebhookRouter.post('/', async (req: Request, res: Response) => {
  const xSignature = (req.headers['x-signature'] as string) || '';
  const xRequestId = (req.headers['x-request-id'] as string) || '';
  const dataId = String((req.query['data.id'] ?? req.query['id'] ?? (req.body?.data as { id?: string } | undefined)?.id ?? '') || '');
  const secret = process.env.MP_WEBHOOK_SECRET ?? '';

  // MODO MONITOR de firma: el calculo VIEJO estaba mal (hasheaba el body) y venia 401-eando a
  // TODOS los eventos reales de MP (verificado en Cloud Logging: 34 POST de MP en 4 dias, todos
  // 401 -> cobros sin procesar). Ahora verificamos con el esquema REAL de MP y LOGUEAMOS el
  // resultado, pero NO bloqueamos todavia: asi (a) MP vuelve a procesar YA y (b) confirmamos la
  // firma con trafico real. PASO 2 (cuando el log diga "firma OK" consistente): reactivar el 401.
  if (secret) {
    const ok = verifyMpWebhookSignature({ xSignature, xRequestId, dataId, secret });
    const kind = String(req.body?.type || req.query?.['type'] || '?');
    console.log(`[mp-webhook] firma ${ok ? 'OK' : 'MISMATCH'} (type=${kind}, data.id=${dataId})`);
    // if (!ok) { res.status(401).json({ error: 'Invalid signature' }); return; }  // <- enforce (PASO 2)
  }

  // Responder 200 rapido (MP espera < 5s)
  res.status(200).json({ received: true });

  // Procesar async sin bloquear la respuesta
  processWebhook(req.body).catch((err) =>
    console.error('[mp-webhook] Processing error:', err)
  );
});

async function processWebhook(body: Record<string, unknown>): Promise<void> {
  const type = body.type as string;
  const data = body.data as Record<string, unknown> | undefined;

  if (PAYMENT_APPROVED_TYPES.includes(type)) {
    const eventId = data?.id as string | undefined; // en los cobros MP manda el id del PAGO, no del preapproval
    if (!eventId) return;

    // Resolver la reserva de forma robusta:
    // 1) por preapprovalId (el 1er evento suele venir asi);
    // 2) si no, se pide el pago a MP y se resuelve por external_reference
    //    (reservationId "MC-XXXX" o "MiContainer Baulera A2-010" -> codigo de baulera).
    let reservation = await getReservationByMpPreapprovalId(eventId);
    let paid: MpPaymentDetail | null = null;
    if (!reservation) {
      paid = await getPaymentDetail(eventId);
      // El marcador "ONETIME " es de la ruta de pago único — se quita para resolver la reserva.
      const ext = (paid?.externalReference || '').trim().replace(/^ONETIME\s+/i, '');
      if (ext) {
        if (/^MC-/i.test(ext)) reservation = await getReservation(ext);
        else { const m = ext.match(/[A-Za-z]\d+-?\d+/); if (m) reservation = await getReservationByBauleraCodigo(m[0]); }
      }
    }
    if (!reservation) {
      console.warn('[mp-webhook] Reservation not found for payment/preapproval:', eventId);
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

    // Registrar el cobro con monto/estado/fecha REALES de MP (si se pudo traer el pago);
    // si no, cae al configurado (comportamiento anterior) para no perder el registro.
    const eventDate = paid?.date || (body.date_created as string) || new Date().toISOString();
    const period = eventDate.slice(0, 7);
    await createPayment({
      id: `${String(eventId)}-${period}`,
      reservationId: reservation.id,
      userUid: reservation.userUid,
      mpPreapprovalId: reservation.mpPreapprovalId || '',
      mpPaymentId: String(eventId),
      type: reservation.status === 'pending_payment' ? 'initial' : 'recurring_payment',
      amount: (paid && paid.amount > 0) ? paid.amount : reservation.monthly,
      currency: 'ARS',
      status: (paid && paid.status) ? (paid.status as PaymentStatus) : 'approved',
      period,
    });

    return;
  }

  if (SUBSCRIPTION_CANCELLED_TYPES.includes(type)) {
    const preapprovalId = data?.id as string | undefined;
    if (!preapprovalId) return;

    const reservation = await getReservationByMpPreapprovalId(preapprovalId);
    if (!reservation) {
      // ¿Sub nueva creada via LINK DE PLAN (mes gratis)? Nace sin external_reference y sin
      // preapprovalId en nuestra base → se casa con la venta pendiente de ese plan (si hay
      // EXACTAMENTE una, para no cruzar clientes) y se le estampa el código de baulera.
      const det = await getPreapprovalDetail(preapprovalId);
      if (det && det.planId) {
        const pend = await db.collection('reservations')
          .where('paymentMode', '==', 'plan')
          .where('mpPlanId', '==', det.planId)
          .where('status', '==', 'pending_payment')
          .get();
        if (pend.size === 1) {
          const r = pend.docs[0].data() as Reservation;
          await updateReservation(r.id, { mpPreapprovalId: preapprovalId } as any);
          if (r.bauleraCodigo) {
            const stamped = await setPreapprovalExternalReference(preapprovalId, `MiContainer Baulera ${r.bauleraCodigo}`);
            console.log(`[mp-webhook] sub de PLAN ${preapprovalId} -> venta ${r.id} (baulera ${r.bauleraCodigo}); external_reference ${stamped ? 'estampado' : 'NO estampado (matchea por preapprovalId igual)'}`);
          }
          if (det.status === 'authorized' || det.status === 'pending') {
            await updateReservation(r.id, { status: 'active', mpSubscriptionStatus: (det.status === 'authorized' ? 'authorized' : 'pending') } as any);
            const assignedRoom = await assignRoomForReservation({ ...r, status: 'active' } as any, r.storageRoomId);
            await logAudit({
              actor: r.customerEmail || r.userUid || 'cliente',
              via: 'mercadopago',
              action: 'alta_suscripcion_plan',
              entity: 'reservation', entityId: r.id, branchId: r.sucursalId,
              detail: { cliente: r.customerName || '', baulera: assignedRoom || r.storageRoomId || null, planId: det.planId, monthly: r.monthly, gratis: (r as any).promoQty ? `${(r as any).promoQty} ${(r as any).promoUnit === 'days' ? 'día(s)' : 'mes(es)'}` : ((r as any).promoMonths || 1) },
            });
            if (r.customerEmail) {
              try { await sendActivationEmail(r.customerEmail, r.customerName || ''); }
              catch (e) { console.warn('[mp-webhook] activation email fail (plan)', e); }
            }
          }
        } else {
          console.warn(`[mp-webhook] sub ${preapprovalId} del plan ${det.planId}: ${pend.size} ventas pendientes de ese plan → reconciliar a mano (find-sub)`);
        }
      }
      return;
    }

    // El body NO trae el status (MP manda solo {id}); se lo pedimos a MP. Sin esto, rawStatus
    // quedaba undefined y TODO caia a 'payment_failed' por error. Solo 'cancelled' da de baja;
    // authorized/paused/pending solo ajustan el estado de la suscripcion (NO marcan fallida).
    const rawStatus = (await getSubscriptionStatus(preapprovalId)) || (data?.status as string) || '';
    const VALID_MP_STATUSES: MpSubscriptionStatus[] = ['pending', 'authorized', 'paused', 'cancelled'];
    const mpStatus = VALID_MP_STATUSES.includes(rawStatus as MpSubscriptionStatus) ? (rawStatus as MpSubscriptionStatus) : null;
    if (!mpStatus) { console.warn('[mp-webhook] preapproval con status desconocido:', preapprovalId, rawStatus); return; }

    // La baja vino por MP (la inicia el cliente). Si el admin cancela desde el panel, ese flujo
    // marcara cancelledBy='admin' antes.
    const cancelledBy = (reservation as any).cancelledBy || 'cliente';

    if (mpStatus !== 'cancelled') {
      await updateReservation(reservation.id, { mpSubscriptionStatus: mpStatus } as any);
      console.log(`[mp-webhook] Reservation ${reservation.id} sub -> ${mpStatus}`);
      return;
    }

    await updateReservation(reservation.id, {
      status: 'cancelled',
      mpSubscriptionStatus: 'cancelled',
      cancelledAt: Timestamp.now(),
      cancelledBy,
      bajaGestionada: false,
    } as any);

    // Liberar la baulera para que vuelva a estar disponible.
    if (reservation.storageRoomId) {
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

    console.log(`[mp-webhook] Reservation ${reservation.id} -> cancelled (por ${cancelledBy})`);
  }
}
