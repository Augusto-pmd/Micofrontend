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
import { markDebtPaid, getDebt } from '../../services/debts.service';
import { invalidateRechazadosCache } from '../admin/pricing';
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
    // ENFORCE activo desde 11/07 (PASO 2): la verificacion quedo confirmada con eventos REALES
    // de MP (firma OK en subscription_preapproval y payment). Solo MP puede disparar el webhook.
    if (!ok) { res.status(401).json({ error: 'Invalid signature' }); return; }
  }

  // Procesar ANTES de responder: si algo falla devolvemos 500 y MP REINTENTA (antes se respondía
  // 200 y se procesaba async → un fallo/reciclado de la instancia perdía el evento sin reintento,
  // dejando bauleras sin activar o deudas sin marcar pagadas). El procesamiento es idempotente
  // (ramas DEUDA/GAP/plan/baja), así que un reintento de MP es seguro. MP tolera ~5s.
  try {
    await processWebhook(req.body);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[mp-webhook] Processing error:', err);
    res.status(500).json({ error: 'processing failed' });
  }
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
      // reintento ante fallo transitorio de MP, con un respiro corto (un reintento instantáneo casi
      // siempre re-falla; MP a veces tarda en indexar el pago recién creado).
      if (!paid) { await new Promise((r) => setTimeout(r, 600)); paid = await getPaymentDetail(eventId); }
      // Sin el detalle no podemos resolver el pago (DEUDA/GAP/reserva): 500 para que MP REINTENTE
      // en vez de descartarlo en silencio (antes se perdía una deuda pagada → riesgo de re-pago).
      if (!paid) throw new Error(`[mp-webhook] getPaymentDetail null para el pago ${eventId} — retry vía 500`);
      const extRaw = (paid.externalReference || '').trim();

      // DEUDA (SPEC cobros-alineados §5): pago único de un mes adeudado. NO es una suscripción —
      // solo marca la deuda pagada (apaga el titileo de la baulera). La suscripción del cliente
      // sigue viva sola; MP cobra el mes corriente el 1° aparte.
      if (/^DEUDA\s+/i.test(extRaw)) {
        const debtId = extRaw.replace(/^DEUDA\s+/i, '').trim();
        if (paid.status === 'approved') {
          const debt = await getDebt(debtId);
          // Idempotencia: si ya estaba pagada (reentrega de MP), no re-loguear auditoría.
          if (debt && debt.status === 'paid') { console.log(`[mp-webhook] DEUDA ${debtId} ya pagada (reentrega) → ignoro`); return; }
          await markDebtPaid(debtId, String(eventId));
          await logAudit({
            actor: debt?.email || 'cliente', via: 'mercadopago', action: 'deuda_pagada',
            entity: 'debt', entityId: debtId,
            detail: { baulera: debt?.bauleraCodigo || null, periodo: debt?.periodo || null, monto: paid.amount },
          });
          invalidateRechazadosCache(); // la baulera deja de titilar (mes pagado) al toque
          console.log(`[mp-webhook] DEUDA ${debtId} PAGADA -> baulera al día`);
        } else {
          console.warn(`[mp-webhook] pago de DEUDA NO approved (status=${paid.status ?? '?'}) ref=${extRaw}`);
        }
        return;
      }

      // GAP (mes gratis): pago único de alineación al 1°. La baulera la ACTIVA la SUSCRIPCIÓN
      // (link 1), no este pago — acá solo se registra que el cliente pagó el gap.
      if (/^GAP\s+/i.test(extRaw)) {
        const resId = extRaw.replace(/^GAP\s+/i, '').trim();
        if (paid?.status === 'approved') {
          // Idempotencia (igual que DEUDA): si el gap ya se registró (reentrega de MP), no re-loguear.
          const rGap = await getReservation(resId);
          if (rGap?.gapPaidAt) { console.log(`[mp-webhook] GAP ${resId} ya registrado (reentrega) → ignoro`); return; }
          if (rGap) await updateReservation(resId, { gapPaidAt: new Date().toISOString() });
          await logAudit({ actor: 'cliente', via: 'mercadopago', action: 'gap_pagado', entity: 'reservation', entityId: resId, detail: { monto: paid.amount } });
          console.log(`[mp-webhook] GAP de alineación pagado para reserva ${resId}`);
        } else {
          console.warn(`[mp-webhook] pago de GAP NO approved (status=${paid?.status ?? '?'}) ref=${extRaw}`);
        }
        return;
      }

      // El marcador "ONETIME " es de la ruta de pago único — se quita para resolver la reserva.
      const ext = extRaw.replace(/^ONETIME\s+/i, '');
      if (ext) {
        if (/^MC-/i.test(ext)) reservation = await getReservation(ext);
        else { const m = ext.match(/[A-Za-z]\d+-?\d+/); if (m) reservation = await getReservationByBauleraCodigo(m[0]); }
      }
    }
    if (!reservation) {
      console.warn('[mp-webhook] Reservation not found for payment/preapproval:', eventId);
      return;
    }

    // #4: para ACTIVAR la baulera hay que confirmar que el pago está APPROVED. Si todavía no
    // trajimos el detalle del pago (caso: la reserva se resolvió por preapprovalId), lo pedimos.
    // Un pago RECHAZADO/pendiente NO debe activar (antes activaba solo por status pending_payment
    // → una tarjeta rechazada daba baulera gratis).
    if (paid === null) paid = await getPaymentDetail(eventId);
    const pagoApproved = paid?.status === 'approved';
    if (!pagoApproved && reservation.status === 'pending_payment') {
      console.warn(`[mp-webhook] pago NO approved (status=${paid?.status ?? 'desconocido'}) para ${reservation.id} -> NO se activa la baulera`);
    }

    if (reservation.status === 'pending_payment' && pagoApproved) {
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
        // Los links de plan se comparten por medida → el preapproval entrante puede ser de OTRO
        // cliente que usó el mismo link. Se desambigua SIEMPRE por el EMAIL del pagador: si no
        // matchea ninguna venta pendiente, NO se activa (reconciliar a mano) para no cruzar clientes.
        const em = (det.payerEmail || '').trim().toLowerCase();
        let candidatos: typeof pend.docs;
        if (em) {
          candidatos = pend.docs.filter((d) => String((d.data() as Record<string, unknown>)['customerEmail'] || '').toLowerCase().trim() === em);
        } else if (pend.docs.length === 1) {
          // Sin email del pagador pero UNA sola venta pendiente del plan → no hay ambigüedad ni cruce
          // posible; se activa esa (no frenamos el caso común si MP no informa el email).
          candidatos = pend.docs;
          console.warn(`[mp-webhook] sub ${preapprovalId}: sin email del pagador; 1 sola pendiente del plan → activo esa`);
        } else {
          // Sin email y >1 pendiente: NO se puede desambiguar sin arriesgar CRUZAR clientes → NO activar.
          candidatos = [];
          console.warn(`[mp-webhook] sub ${preapprovalId} del plan ${det.planId}: sin email del pagador y ${pend.size} pendientes → reconciliar a mano (no activo para no cruzar clientes)`);
        }
        // Mismo cliente con >1 baulera de la misma medida (varias pendientes que matchean el email):
        // tomar la MÁS VIEJA; el próximo evento encontrará la otra (esta ya quedó estampada/activa).
        candidatos = candidatos.slice().sort((a, b) => {
          const ta = (a.data() as Record<string, { toMillis?: () => number }>)['createdAt']?.toMillis?.() || 0;
          const tb = (b.data() as Record<string, { toMillis?: () => number }>)['createdAt']?.toMillis?.() || 0;
          return ta - tb;
        });
        if (candidatos.length >= 1) {
          const r = candidatos[0].data() as Reservation;
          const activar = det.status === 'authorized' || det.status === 'pending';
          // IDEMPOTENCIA: estampar preapprovalId (+ pasar a active) en UNA transacción, SOLO si sigue
          // pending_payment. Si otra entrega concurrente ya lo hizo, saltamos (no re-activa, no
          // re-manda mail ni duplica auditoría).
          const yaProcesada = await db.runTransaction(async (tx) => {
            const s = await tx.get(db.collection('reservations').doc(r.id));
            const cur = s.data() as Record<string, unknown> | undefined;
            if (!cur || cur['status'] !== 'pending_payment') return true;
            tx.update(s.ref, {
              mpPreapprovalId: preapprovalId,
              ...(det.payerId ? { customerMpPayerId: det.payerId } : {}), // id de la cuenta MP (reconciliación)
              ...(activar ? { status: 'active', mpSubscriptionStatus: (det.status === 'authorized' ? 'authorized' : 'pending') } : {}),
            });
            return false;
          });
          if (yaProcesada) { console.log(`[mp-webhook] sub de PLAN ${preapprovalId} ya procesada → ignoro`); return; }
          if (r.bauleraCodigo) {
            const stamped = await setPreapprovalExternalReference(preapprovalId, `MiContainer Baulera ${r.bauleraCodigo}`);
            console.log(`[mp-webhook] sub de PLAN ${preapprovalId} → venta ${r.id} (baulera ${r.bauleraCodigo}); external_reference ${stamped ? 'estampado' : 'NO'}`);
          }
          if (activar) {
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
          console.warn(`[mp-webhook] sub ${preapprovalId} del plan ${det.planId}: ningún candidato matchea el email del pagador (${pend.size} pendientes) → reconciliar a mano (find-sub)`);
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

    // GUARD (bug real A3-037, 14/07): una sub cancelada que NUNCA estuvo autorizada (quedó
    // 'pending' — el cliente jamás pagó por ese link) NO es una baja del cliente: es un link
    // viejo/abandonado (rebill viejo, prueba, hold vencido). Procesarla como baja mataba reservas
    // ACTIVAS: a la reserva de PAGO ÚNICO de A3-037 (vigente y pagada) el rebill viejo le había
    // colgado una sub pendiente; al cancelarse esa sub, la "baja" liberó la baulera de un cliente
    // al día. Ídem paymentMode 'onetime' en general: vive por endDate, nunca por una sub.
    if (reservation.status === 'active' && (reservation.paymentMode === 'onetime' || reservation.mpSubscriptionStatus === 'pending')) {
      console.warn(`[mp-webhook] sub ${preapprovalId} cancelada pero la reserva ${reservation.id} está ACTIVA (${reservation.paymentMode || 'subscription'}; sub nunca autorizada) → NO se da de baja; revisar a mano si corresponde`);
      await logAudit({
        actor: 'sistema', via: 'mercadopago', action: 'baja_ignorada_sub_pendiente',
        entity: 'reservation', entityId: reservation.id,
        detail: { preapprovalId, paymentMode: reservation.paymentMode || 'subscription', mpSubscriptionStatus: reservation.mpSubscriptionStatus, baulera: reservation.bauleraCodigo || reservation.storageRoomId || null },
      });
      return;
    }

    // #6 IDEMPOTENCIA: si la reserva YA está cancelada, este evento es una RE-ENTREGA de MP
    // (reenvía el mismo aviso) o llega DESPUÉS de una baja desde el panel (que ya cortó MP,
    // liberó la baulera y marcó bajaGestionada). NO reprocesar:
    //  - re-liberar la baulera BORRARÍA al nuevo inquilino si ya se re-alquiló;
    //  - re-escribir bajaGestionada:false haría reaparecer la baja como pendiente (pisa al staff/admin);
    //  - movería cancelledAt y duplicaría la auditoría.
    if (reservation.status === 'cancelled') {
      console.log(`[mp-webhook] baja ya procesada para ${reservation.id} (evento re-entregado / baja de panel) -> ignoro`);
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
        contractNumber: null, // limpiar el contrato legacy: si no, la ficha muestra al inquilino viejo al revender
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
