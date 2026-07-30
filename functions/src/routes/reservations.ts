import { Router, Response } from 'express';
import { requireAuth, optionalAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { createReservation, getUserReservations, getReservation } from '../models/reservation.model';
// (cancelSubscription ya no se importa: el self-cancel del portal quedó deshabilitado → 410)
import { getOrCreateAlignedPlan } from '../services/planCatalog.service';
import { resolveExistingCustomer, customerNormFields } from '../services/customerMatch.service';
import { holdRoomForReservation } from '../services/assignment.service';
import { getPricingByM2, recurringFor } from '../services/pricing.service';
import { db } from '../config/firebase';
import { generateReservationId } from '../utils/generateId';
import * as crypto from 'crypto';

export const reservationsRouter = Router();

const REQUIRED_FIELDS = ['sucursalId', 'category', 'm2', 'monthly', 'firstMonth', 'startDate', 'duration'];

// (BACK_URL se removió: la venta web ahora va por link de plan — SPEC cobros-alineados Regla A)

// POST /reservations — create reservation + start MP subscription
// Auth is OPTIONAL: logged-in users get linked to their Firebase uid;
// guests are identified by a deterministic uid derived from their email.
reservationsRouter.post('/', optionalAuth, async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  // Resolve uid and email: prefer auth token, fall back to form body
  const bodyEmail: string = (req.body.email ?? '').trim().toLowerCase();
  let uid: string  = authReq.uid   || `guest_${crypto.createHash('sha1').update(bodyEmail).digest('hex').slice(0, 16)}`;
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
    name = '', phone = '', dni = '', freeTrialMonths = 0,
  } = req.body;

  // MACHEO REFORZADO: si NO está logueado, buscamos un cliente existente por DNI→email→teléfono y
  // reusamos su identidad (userUid) para que sus bauleras se unifiquen aunque el mail venga distinto.
  // Si está logueado, su uid de Firebase manda. Best-effort: si falla, sigue el uid derivado del mail.
  if (!authReq.uid) {
    try {
      const found = await resolveExistingCustomer({ dni, email });
      if (found?.userUid) uid = found.userUid;
    } catch (e) { console.warn('[reservations] resolveExistingCustomer falló (sigo con uid por email):', e); }
  }

  // Precio server-side: la fuente de verdad es la tabla por medida (admin),
  // no lo que manda el cliente. Asi, si cambias el precio, aplica a toda venta nueva.
  // El 1er mes gratis va por free_trial; el recurrente nunca debe ser 0 (MP lo rechaza).
  const byM2 = await getPricingByM2(sucursalId);
  const serverMonthly = recurringFor(byM2, m2, Number(duration) || 1);
  let monthlyNum = serverMonthly ?? Number(monthly);
  if (!Number.isFinite(monthlyNum) || monthlyNum <= 0) {
    res.status(400).json({ error: 'monthly must be a positive amount' });
    return;
  }

  // Descuento de la Promoción web (Opcion A): si el cliente entra por la promo,
  // la promo de la sucursal esta activa y dentro de fechas, y la medida aplica.
  let promoDiscountPct = 0;
  if (req.body.viaPromo === true) {
    try {
      const pdoc = await db.collection('promos').doc(sucursalId).get();
      const promo = pdoc.exists ? (pdoc.data() as Record<string, unknown>) : null;
      if (promo && promo.active && Number(promo.discountPct) > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const within = (!promo.startDate || today >= String(promo.startDate)) &&
                       (!promo.endDate || today <= String(promo.endDate));
        const dM2 = Array.isArray(promo.discountM2) ? (promo.discountM2 as string[]) : [];
        const eligible = dM2.length === 0 || dM2.includes(String(Number(m2)));
        if (within && eligible) {
          promoDiscountPct = Number(promo.discountPct);
          monthlyNum = Math.round(monthlyNum * (1 - promoDiscountPct / 100));
        }
      }
    } catch (e) { console.warn('[reservations] promo discount check failed', e); }
  }

  try {
    const id = generateReservationId();

    // Reservar (hold) la baulera 20 min antes de cobrar
    const hold = await holdRoomForReservation({ reservationId: id, branchId: sucursalId, m2: Number(m2) });
    if (!hold.ok) {
      res.status(409).json({ error: 'Sin stock de esa medida', code: hold.reason, alternativasByM2: hold.alternativasByM2 || {} });
      return;
    }

    // SPEC cobros-alineados (Regla A): la venta web va por LINK DE PLAN con billing_day=1 +
    // proporcional (el spike 13/07 confirmó que la sub directa IGNORA billing_day). MP cobra el
    // proporcional de los días hasta el 1° al autorizar, y el mes completo cada 1°.
    // El webhook (rama planes) casa la sub con esta reserva por planId + email y le estampa el
    // código de baulera.
    let planId: string;
    let initPoint: string;
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      planId = `emu-plan-${id}`;
      initPoint = 'http://127.0.0.1:4000/emulator-no-mp';
    } else {
      ({ planId, initPoint } = await getOrCreateAlignedPlan({
        m2: Number(m2),
        amount: monthlyNum,
        freeQty: Number(freeTrialMonths) || 0,
        freeUnit: 'months',
        bauleraCodigo: hold.bauleraCodigo || undefined, // plan por baulera (30/07)
        ventaId: id,                                    // plan por VENTA (30/07): cada reserva estrena plan+link
      }));
    }

    // Save reservation to Firestore (includes guest contact info)
    await createReservation({
      id,
      userUid: uid,
      sucursalId,
      category,
      m2,
      monthly: monthlyNum,
      firstMonth,
      startDate,
      duration,
      addons,
      promosApplied,
      status: 'pending_payment',
      mpPreapprovalId: '',             // se estampa cuando el cliente autoriza (webhook, rama planes)
      mpPlanId: planId,
      paymentMode: 'plan',
      mpInitPoint: initPoint,          // guardamos el link para poder retomar el pago
      mpSubscriptionStatus: 'pending',
      faceEnrollStatus: 'not_started',
      faceEnrollAttempts: 0,
      storageRoomId: hold.roomId,
      heldUntil: hold.heldUntil,
      bauleraCodigo: hold.bauleraCodigo || undefined,
      source: 'web',
      // Guest contact info (populated from form when not logged in)
      customerName:  name  || undefined,
      customerEmail: email || undefined,
      customerPhone: phone || undefined,
      customerDni:   dni   || undefined,
      ...customerNormFields({ email, dni, phone }),
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
// DESHABILITADO (auditoría ventas 16/07 — A2): la baja del cliente se gestiona por WhatsApp y la
// ejecuta el staff con el "Dar de baja" del panel (que corta MP + libera la baulera + desanexa al
// cliente). Este self-cancel hacía una baja A MEDIAS: cortaba MP y marcaba cancelled pero NUNCA
// liberaba la baulera ni desanexaba nada → baulera ocupada para siempre. El portal ya no lo llama
// (el botón deriva a WhatsApp desde el 15/07); queda 410 por si alguien le pega directo a la API.
reservationsRouter.post('/:id/cancel', requireAuth, async (req, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  const reservation = await getReservation(req.params.id);
  if (!reservation) { res.status(404).json({ error: 'Reservation not found' }); return; }
  if (reservation.userUid !== uid) { res.status(403).json({ error: 'Forbidden' }); return; }
  res.status(410).json({
    error: 'La baja se gestiona por WhatsApp: escribinos y una persona coordina el retiro y corta el cobro.',
    whatsapp: 'https://wa.me/5491136207989',
  });
});
