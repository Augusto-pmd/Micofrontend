import { Router, Response } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { db, storage } from '../../config/firebase';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { assignRoomForReservation, holdRoomForReservation } from '../../services/assignment.service';
import { getReservation, createReservation, updateReservation, getReservationByMpPreapprovalId, getReservationByBauleraCodigo } from '../../models/reservation.model';
import { createSubscription, createCheckoutPreference, createDebtPreference, createGapPreference, cancelSubscription, getSubscriptionStatus, invalidateSubsCache, searchSubscriptionsCached, getPreapprovalDetail, setPreapprovalExternalReference } from '../../services/mercadopago.service';
import { getOrCreateAlignedPlan } from '../../services/planCatalog.service';
import { resolveSaleUid, customerNormFields } from '../../services/customerMatch.service';
import { createDebt, DebtTipo, getPendingDebtByBaulera } from '../../services/debts.service';
import { invalidateRechazadosCache } from './pricing';
import { getPricingByM2, recurringFor } from '../../services/pricing.service';
import { generateReservationId } from '../../utils/generateId';
import { logAudit } from '../../services/audit.service';
import { sendActivationEmail, sendRebillEmail } from '../../services/customerAuth.service';

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
        // Face ID: para que Ventas en curso muestre "alta pendiente" y el botón de alta
        faceEnrollStatus: data['faceEnrollStatus'] || 'not_started',
        paymentMode:  data['paymentMode'] || 'subscription',
        rebillAt:     data['rebillAt'] || null, // recobro: cuándo se le envió link (para titilar violeta en el plano)
        // Timestamps
        createdAt: data['createdAt']?.toDate?.()?.toISOString() || null,
        cancelledAt: data['cancelledAt']?.toDate?.()?.toISOString() || null,
      };
    });

    // Filtro de búsqueda en memoria (nombre, email, id, DNI, teléfono). El DNI/teléfono se comparan
    // también SOLO por dígitos → "12345678" encuentra "12.345.678" y un teléfono con/sin prefijo.
    if (search) {
      const searchDigits = search.replace(/\D/g, '');
      docs = docs.filter(r =>
        r.id.toLowerCase().includes(search) ||
        r.customerName.toLowerCase().includes(search) ||
        r.customerEmail.toLowerCase().includes(search) ||
        r.customerDni.toLowerCase().includes(search) ||
        r.customerPhone.toLowerCase().includes(search) ||
        (searchDigits.length >= 3 && (
          String(r.customerDni).replace(/\D/g, '').includes(searchDigits) ||
          String(r.customerPhone).replace(/\D/g, '').includes(searchDigits)
        ))
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
    // MACHEO REFORZADO: reusa la identidad del cliente si ya existe (DNI→email→tel); si no, fallback por mail.
    const uid = await resolveSaleUid({ dni, email, phone });

    // Reservar (hold) la baulera 20 min antes de cobrar (evita doble venta y asegura la correcta)
    const hold = await holdRoomForReservation({ reservationId: id, branchId: sucursalId, m2: Number(m2), targetRoomId: storageRoomId || undefined });
    if (!hold.ok) {
      res.status(409).json({ error: hold.reason === 'sin_stock' ? `Sin stock de ${m2}m2. Ofrece otra medida.` : 'No se pudo reservar la baulera', code: hold.reason, alternativasByM2: hold.alternativasByM2 || {} });
      return;
    }

    // SPEC cobros-alineados (Regla A): venta manual por LINK DE PLAN alineado al 1° con
    // proporcional (la sub directa ignora billing_day — spike 13/07). El webhook (rama planes)
    // casa la sub por planId + email y estampa el código de baulera.
    let planId: string;
    let initPoint: string;
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      planId = `emu-plan-${id}`;
      initPoint = `https://www.mercadopago.com.ar/subscriptions/emulator-demo?ref=${id}`;
    } else {
      ({ planId, initPoint } = await getOrCreateAlignedPlan({
        m2: Number(m2),
        amount: monthlyNum,
        freeQty: Number(promoMonths) || 0,
        freeUnit: 'months',
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
      mpPreapprovalId: '',       // se estampa cuando el cliente autoriza (webhook, rama planes)
      mpPlanId: planId,
      paymentMode: 'plan',
      mpInitPoint: initPoint,
      mpSubscriptionStatus: 'pending',
      faceEnrollStatus: 'not_started',
      faceEnrollAttempts: 0,
      customerName: name || undefined,
      customerEmail: email || undefined,
      customerPhone: phone || undefined,
      customerDni: dni || undefined,
      ...customerNormFields({ email, dni, phone }),
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
    res.status(201).json({ reservationId: id, initPoint, planId, preapprovalId: null, monthly: monthlyNum, duration, alineado: 'billing_day=1 + proporcional' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /admin/reservations/sell error:', err);
    res.status(500).json({ error: 'No se pudo generar la venta', detail: message });
  }
});

// POST /admin/reservations/sell-onetime — VENTA PAGO ÚNICO: el cliente paga N meses DE UNA
// (Checkout Pro, 1 solo cobro, sin recurrencia). RUTA SEPARADA de /sell (suscripción) y
// /sell-plan (mes gratis) para que las vías NO se crucen. Vence en endDate (aviso manual).
adminReservationsRouter.post('/sell-onetime', requireAuth, async (req, res: Response) => {
  try {
    const {
      sucursalId = 'nordelta', category = 'Baulera', m2, storageRoomId, bauleraCodigo,
      name = '', email = '', phone = '', dni = '', startDate, durationMonths, discountPct = 0, priceOverride,
    } = req.body || {};
    if (!email) { res.status(400).json({ error: 'Falta el email del cliente' }); return; }
    if (!m2)    { res.status(400).json({ error: 'Falta la medida (m2)' }); return; }
    const months = Math.max(1, Number(durationMonths) || 6);

    // Mismo cálculo de mensualidad que /sell (12+ meses aplica el descuento anual de la tarifa)
    const byM2 = await getPricingByM2(sucursalId);
    let monthlyNum = Number(priceOverride) > 0 ? Number(priceOverride) : (recurringFor(byM2, Number(m2), months) ?? 0);
    if (!(monthlyNum > 0)) { res.status(400).json({ error: `No hay precio cargado para ${m2}m². Cargalo en Tarifas o poné un precio manual.` }); return; }
    const disc = Number(discountPct) || 0;
    if (disc > 0) monthlyNum = Math.round(monthlyNum * (1 - disc / 100));
    const total = monthlyNum * months;

    const id = generateReservationId();
    // MACHEO REFORZADO: reusa la identidad del cliente si ya existe (DNI→email→tel); si no, fallback por mail.
    const uid = await resolveSaleUid({ dni, email, phone });

    const hold = await holdRoomForReservation({ reservationId: id, branchId: sucursalId, m2: Number(m2), targetRoomId: storageRoomId || undefined });
    if (!hold.ok) {
      res.status(409).json({ error: hold.reason === 'sin_stock' ? `Sin stock de ${m2}m2. Ofrece otra medida.` : 'No se pudo reservar la baulera', code: hold.reason, alternativasByM2: hold.alternativasByM2 || {} });
      return;
    }
    const codigo = hold.bauleraCodigo || bauleraCodigo || '';

    let preferenceId: string; let initPoint: string;
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      preferenceId = `emu-pref-${id}`;
      initPoint = `https://www.mercadopago.com.ar/checkout/emulator-demo?ref=${id}`;
    } else {
      ({ preferenceId, initPoint } = await createCheckoutPreference({
        reservationId: id,
        title: `Mi Container Baulera ${codigo || `${m2}m2`} — ${months} meses`,
        amount: total,
        email: String(email),
        backUrl: 'https://micontainer.com/#/portal',
        bauleraCodigo: codigo || undefined,
      }));
    }

    const start = startDate || new Date().toISOString().slice(0, 10);
    const end = (() => { const d = new Date(`${start}T12:00:00`); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10); })();

    await createReservation({
      id, userUid: uid, sucursalId, category, m2: Number(m2),
      monthly: monthlyNum, firstMonth: total,
      startDate: start, duration: months,
      addons: [], promosApplied: [],
      status: 'pending_payment',
      mpInitPoint: initPoint, mpSubscriptionStatus: 'pending',
      faceEnrollStatus: 'not_started', faceEnrollAttempts: 0,
      customerName: name || undefined, customerEmail: email || undefined,
      customerPhone: phone || undefined, customerDni: dni || undefined,
      ...customerNormFields({ email, dni, phone }),
      storageRoomId: hold.roomId,
      bauleraCodigo: codigo || undefined,
      endDate: end,
      paymentMode: 'onetime', paidMonths: months, mpPreferenceId: preferenceId,
      discountPct: disc,
      source: 'manual_admin',
    } as any);

    await logAudit({
      actor: (req as any).email || (req as any).uid || 'admin',
      via: (req.body?.via as string) || 'admin',
      action: 'link_generado_pago_unico',
      entity: 'reservation', entityId: id, branchId: sucursalId,
      detail: { cliente: name, email, baulera: codigo || null, m2: Number(m2), meses: months, mensual: monthlyNum, total, vence: end },
    });
    res.status(201).json({ reservationId: id, initPoint, monthly: monthlyNum, total, duration: months, paymentMode: 'onetime', endDate: end });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /admin/reservations/sell-onetime error:', err);
    res.status(500).json({ error: 'No se pudo generar el link de pago único', detail: message });
  }
});

// POST /admin/reservations/sell-plan — VENTA CON MES GRATIS: usa un PLAN de MP (free_trial)
// y devuelve el LINK DEL PLAN (el cliente carga la tarjeta en MP; $0 hoy, 1er débito al mes).
// El plan se crea 1 vez por medida y se reusa. Cuando el cliente se suscribe, el webhook casa
// la sub con esta venta pendiente (por planId) y le estampa el código de baulera.
adminReservationsRouter.post('/sell-plan', requireAuth, async (req, res: Response) => {
  try {
    const {
      sucursalId = 'nordelta', category = 'Baulera', m2, storageRoomId, bauleraCodigo,
      name = '', email = '', phone = '', dni = '', startDate, durationMonths, promoMonths, promoUnit, discountPct = 0, priceOverride,
    } = req.body || {};
    if (!email) { res.status(400).json({ error: 'Falta el email del cliente' }); return; }
    if (!m2)    { res.status(400).json({ error: 'Falta la medida (m2)' }); return; }
    // Período gratis PERSONALIZABLE (promos específicas): cantidad + unidad (días o meses).
    const freeQty = Math.max(1, Number(promoMonths) || 1);
    const freeUnit: 'days' | 'months' = promoUnit === 'days' ? 'days' : 'months';

    const byM2 = await getPricingByM2(sucursalId);
    let monthlyNum = Number(priceOverride) > 0 ? Number(priceOverride) : (recurringFor(byM2, Number(m2), Number(durationMonths) || 1) ?? 0);
    if (!(monthlyNum > 0)) { res.status(400).json({ error: `No hay precio cargado para ${m2}m². Cargalo en Tarifas o poné un precio manual.` }); return; }
    const disc = Number(discountPct) || 0;
    if (disc > 0) monthlyNum = Math.round(monthlyNum * (1 - disc / 100));

    // MODELO DEL MES GRATIS (corrección Lucas 14/07 — el proporcional va al PRINCIPIO, no al final):
    //   1) El cliente paga por PAGO ÚNICO (link 2, ahora o después) los días del MES ACTUAL
    //      (hoy → 1° próximo). Esos días NO se regalan.
    //   2) El período GRATIS arranca el 1° próximo (N meses calendario, o N días).
    //   3) El TRIAL del plan en MP = días al 1° + período gratis → termina JUSTO en un 1° (si la
    //      promo es en meses) → el primer débito completo cae ese 1° y de ahí SIEMPRE el 1°.
    //   Ej: venta 14/07, 1 mes gratis → link 2 por 18 días de julio; agosto gratis; trial 49 días;
    //   primer débito completo 1/09. (proportional=false en el plan: la fracción la cobra el link 2.)
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    // Si HOY ya es un 1°, no hay proporcional (entra alineado): gratis desde hoy mismo.
    const prox1 = hoy.getDate() === 1 ? new Date(hoy) : new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);

    // MODO DEL GAP (Lucas 15/07): 'cobrar' (default) = los días de entrada se DEBEN (link 2, ahora
    // o después) y la promo corre desde el 1°. 'regalar' = REGALO LIMPIO: la promo corre DESDE HOY,
    // los días de entrada van gratis, y NO existe link 2 ni proporcional ni recordatorio, nunca.
    // Ej regalado: venta 17/07 + "15 días gratis" → gratis 17/07→01/08 (justo 15) → primer débito
    // completo el 1/08. Si el fin no cae en un 1°, MP corre el débito al 1° siguiente (yapa gratis).
    const regalarGap = req.body?.gapModo === 'regalar';
    let gapDays = 0, gapAmount = 0;
    let finGratis: Date;
    if (regalarGap) {
      finGratis = new Date(hoy);
      if (freeUnit === 'days') {
        finGratis.setDate(finGratis.getDate() + freeQty);
      } else {
        // sumar meses desde HOY con clamp de fin de mes (31/07 + 1 mes → 31/08, no 01/09 corrido)
        const d0 = finGratis.getDate();
        finGratis.setDate(1);
        finGratis.setMonth(finGratis.getMonth() + freeQty);
        const ult = new Date(finGratis.getFullYear(), finGratis.getMonth() + 1, 0).getDate();
        finGratis.setDate(Math.min(d0, ult));
      }
    } else {
      gapDays = Math.round((prox1.getTime() - hoy.getTime()) / 86400000);
      gapAmount = gapDays > 0 ? Math.round(monthlyNum * gapDays / 30) : 0;
      finGratis = new Date(prox1);
      if (freeUnit === 'days') finGratis.setDate(finGratis.getDate() + freeQty);
      else finGratis.setMonth(finGratis.getMonth() + freeQty); // desde un día 1 nunca desborda
    }
    const trialDays = Math.round((finGratis.getTime() - hoy.getTime()) / 86400000);
    // Primer débito real = el 1° >= finGratis. Si finGratis ES un 1°, cobra ese mismo día;
    // si cae a mitad de mes, MP corre el débito al 1° siguiente (en modo regalado la yapa va
    // gratis; en modo cobrar esos días se cobran aparte con el botón Proporcional de Inventario).
    const primerDebito = new Date(finGratis.getFullYear(), finGratis.getMonth(), 1);
    if (primerDebito.getTime() < finGratis.getTime()) primerDebito.setMonth(primerDebito.getMonth() + 1);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    // Plan por (medida × monto × trial EN DÍAS — depende del día de venta). proportional=false.
    let planId: string; let planLink: string;
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      planId = `emu-plan-${m2}`; planLink = `https://www.mercadopago.com.ar/subscriptions/emulator-plan?m2=${m2}`;
    } else {
      const created = await getOrCreateAlignedPlan({ m2: Number(m2), amount: monthlyNum, freeQty: trialDays, freeUnit: 'days' });
      planId = created.planId; planLink = created.initPoint;
    }

    const id = generateReservationId();
    // MACHEO REFORZADO: reusa la identidad del cliente si ya existe (DNI→email→tel); si no, fallback por mail.
    const uid = await resolveSaleUid({ dni, email, phone });

    const hold = await holdRoomForReservation({ reservationId: id, branchId: sucursalId, m2: Number(m2), targetRoomId: storageRoomId || undefined });
    if (!hold.ok) {
      res.status(409).json({ error: hold.reason === 'sin_stock' ? `Sin stock de ${m2}m2. Ofrece otra medida.` : 'No se pudo reservar la baulera', code: hold.reason, alternativasByM2: hold.alternativasByM2 || {} });
      return;
    }

    // LINK 2 (pago único del proporcional de ENTRADA — los días del mes actual, calculados arriba).
    // OPCIONAL/diferible (decisión Lucas): AHORA (generarGapAhora) o DESPUÉS desde Inventario con
    // el botón Proporcional (mismo /deuda tipo='proporcional' — queda pre-cargado con gapDays/monto).
    // La cuenta del cliente queda anexada a la SUSCRIPCIÓN (link 1), no a este pago único.
    let gapInitPoint: string | null = null, gapPreferenceId: string | null = null;
    if (gapAmount > 0 && req.body?.generarGapAhora === true && process.env.FUNCTIONS_EMULATOR !== 'true') {
      const gp = await createGapPreference({
        reservationId: id,
        title: `Mi Container ${hold.bauleraCodigo || String(m2) + 'm2'} — proporcional ${gapDays} días (${iso(hoy).split('-').reverse().join('/')} al ${iso(prox1).split('-').reverse().join('/')})`,
        amount: gapAmount, email: String(email), backUrl: 'https://micontainer.com/#/portal',
      });
      gapInitPoint = gp.initPoint; gapPreferenceId = gp.preferenceId;
    }

    await createReservation({
      id, userUid: uid, sucursalId, category, m2: Number(m2),
      monthly: monthlyNum, firstMonth: 0,
      startDate: startDate || new Date().toISOString().slice(0, 10),
      duration: Number(durationMonths) || 1,
      addons: [], promosApplied: [],
      status: 'pending_payment',
      mpInitPoint: planLink, mpSubscriptionStatus: 'pending',
      faceEnrollStatus: 'not_started', faceEnrollAttempts: 0,
      customerName: name || undefined, customerEmail: email || undefined,
      customerPhone: phone || undefined, customerDni: dni || undefined,
      ...customerNormFields({ email, dni, phone }),
      storageRoomId: hold.roomId,
      bauleraCodigo: hold.bauleraCodigo || bauleraCodigo || undefined,
      promoMonths: freeUnit === 'months' ? freeQty : 0,
      promoQty: freeQty, promoUnit: freeUnit,
      paymentMode: 'plan', mpPlanId: planId,
      gapPreferenceId, gapAmount, gapInitPoint, gapDays,
      // 'regalado' = la entrada va gratis: NO hay proporcional que cobrar (ni ahora ni nunca).
      gapModo: regalarGap ? 'regalado' : 'a_cobrar',
      gapDesde: regalarGap ? null : iso(hoy), gapHasta: regalarGap ? null : iso(prox1),
      // Recordatorio del gap diferido: Inventario lo marca "sin cobrar" recién desde esta fecha
      // (si no viene, se marca de una — la plata del proporcional no debe depender de la memoria).
      gapRecordarDesde: !regalarGap && req.body?.recordarGapDesde ? String(req.body.recordarGapDesde) : null,
      trialDays, // días totales del cupón/trial en MP
      discountPct: disc,
      source: 'manual_admin',
    } as any);

    await logAudit({
      actor: (req as any).email || (req as any).uid || 'admin',
      via: (req.body?.via as string) || 'admin',
      action: 'link_generado_plan_mes_gratis',
      entity: 'reservation', entityId: id, branchId: sucursalId,
      detail: { cliente: name, email, baulera: hold.bauleraCodigo || null, m2: Number(m2), mensual: monthlyNum, gratis: `${freeQty} ${freeUnit === 'days' ? 'día(s)' : 'mes(es)'}`, planId, gapDias: gapDays, gapMonto: gapAmount },
    });
    // 2 LINKS: la suscripción (cuenta anexada acá) + el pago único del proporcional de entrada.
    // Devuelve las FECHAS del ciclo para que Vender lo muestre sin recalcular nada.
    res.status(201).json({
      reservationId: id,
      initPoint: planLink, suscripcionLink: planLink,
      gapLink: gapInitPoint, gapAmount, gapDays,
      gapModo: regalarGap ? 'regalado' : 'a_cobrar',
      gapDesde: regalarGap ? null : iso(hoy), gapHasta: regalarGap ? null : iso(prox1),
      finGratis: iso(finGratis), primerDebito: iso(primerDebito), trialDays,
      monthly: monthlyNum, duration: Number(durationMonths) || 1, paymentMode: 'plan', planId,
      gratis: `${freeQty} ${freeUnit === 'days' ? 'día(s)' : 'mes(es)'}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /admin/reservations/sell-plan error:', err);
    res.status(500).json({ error: 'No se pudo generar la venta con mes gratis', detail: message });
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

    // ORDEN SEGURO (auditoría ventas 16/07 — C1): ASIGNAR PRIMERO, liberar la vieja DESPUÉS.
    // Antes se liberaba la baulera actual ANTES de intentar la asignación: si la asignación
    // fallaba (elegida ocupada / sin libres), la baulera del cliente quedaba 'available' con sus
    // cosas adentro → Vender la ofrecía como stock = doble venta posible.
    const oldRoomId = reservation.storageRoomId || null;
    const targetRoomId = (req.body?.storageRoomId as string) || undefined;
    const roomId = await assignRoomForReservation(reservation, targetRoomId);
    if (!roomId) {
      // Nada cambió: la baulera vieja sigue ocupada por el cliente. Estado consistente.
      res.status(409).json({ error: `Sin baulera libre de ${reservation.m2}m2` });
      return;
    }
    // Éxito: liberar la ANTERIOR (si había y es distinta). El customer ya quedó apuntando a la
    // nueva (lo re-escribe assignRoomForReservation), así que acá solo se limpia el room viejo.
    if (oldRoomId && oldRoomId !== roomId) {
      await db.collection('storageRooms').doc(oldRoomId).set({
        status: 'available', customerId: null, currentTenant: null, contractNumber: null,
        reservationId: null, updatedAt: new Date().toISOString(),
      }, { merge: true });
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

// GET /admin/reservations/:id/face-photo — URL FIRMADA temporal (15 min) de la foto biométrica
// que subió el cliente desde el portal (Storage privado: face-enroll/{id}/...). Para que el staff
// la vea y dé el alta en el dispositivo de acceso.
adminReservationsRouter.get('/:id/face-photo', requireAuth, async (req, res: Response) => {
  try {
    const snap = await db.collection('reservations').doc(req.params.id).get();
    if (!snap.exists) { res.status(404).json({ error: 'Reservation not found' }); return; }
    const r = snap.data() as any;
    if (!r.facePhotoPath) { res.status(404).json({ error: 'Esta reserva no tiene foto biométrica subida' }); return; }
    try {
      const [url] = await storage.bucket('mc-nordelta-2026.firebasestorage.app')
        .file(String(r.facePhotoPath))
        .getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60 * 1000 });
      res.json({ url, expiraEnMin: 15, status: r.faceEnrollStatus || null, subida: r.faceEnrollAt || null, baulera: r.bauleraCodigo || null });
    } catch (signErr) {
      // Si la cuenta de servicio no puede firmar URLs, devolver el path (se abre desde la consola de Firebase → Storage)
      console.warn('GET face-photo: no se pudo firmar URL:', signErr);
      res.json({ path: r.facePhotoPath, nota: 'Abrir desde Firebase Console → Storage', status: r.faceEnrollStatus || null, subida: r.faceEnrollAt || null });
    }
  } catch (err) {
    console.error('GET /admin/reservations/:id/face-photo error:', err);
    res.status(500).json({ error: 'No se pudo obtener la foto' });
  }
});

// POST /admin/reservations/:id/face-enrolled — ALTA DE FACE ID confirmada por el ADMIN.
// Paso manual OBLIGATORIO (decisión Lucas 11/07): el staff mira la foto, la carga a mano en el
// dispositivo de acceso, y recién ahí confirma acá. Marca 'enrolled' (el cliente ve "Acceso
// activo") y BORRA la foto del Storage (como promete el consentimiento biométrico).
// Cuando exista integración con el dispositivo (servicio externo a definir), este endpoint
// será el lugar donde se dispare.
adminReservationsRouter.post('/:id/face-enrolled', requireAuth, async (req, res: Response) => {
  try {
    const snap = await db.collection('reservations').doc(req.params.id).get();
    if (!snap.exists) { res.status(404).json({ error: 'Reservation not found' }); return; }
    const r = snap.data() as any;
    if (!r.facePhotoPath && r.faceEnrollStatus !== 'queued') {
      res.status(400).json({ error: 'Esta reserva no tiene un alta de Face ID pendiente' }); return;
    }
    // Borrar la foto del Storage (el dato biométrico queda solo en el dispositivo)
    if (r.facePhotoPath) {
      try { await storage.bucket('mc-nordelta-2026.firebasestorage.app').file(String(r.facePhotoPath)).delete(); }
      catch (e) { console.warn('face-enrolled: no se pudo borrar la foto (sigue igual):', e); }
    }
    await db.collection('reservations').doc(req.params.id).update({
      faceEnrollStatus: 'enrolled',
      facePhotoPath: admin.firestore.FieldValue.delete(),
      faceEnrolledAt: new Date().toISOString(),
      faceEnrolledBy: (req as any).email || 'admin',
    });
    await logAudit({
      actor: (req as any).email || 'admin', via: 'admin', role: 'admin',
      action: 'face_alta_confirmada',
      entity: 'reservation', entityId: req.params.id, branchId: r.sucursalId,
      detail: { cliente: r.customerName || '', baulera: r.bauleraCodigo || r.storageRoomId || null, fotoBorrada: !!r.facePhotoPath },
    });
    res.json({ message: 'Alta de Face ID confirmada — el cliente ya ve "Acceso activo"' });
  } catch (err) {
    console.error('POST /admin/reservations/:id/face-enrolled error:', err);
    res.status(500).json({ error: 'No se pudo confirmar el alta' });
  }
});

// POST /admin/reservations/:id/face-reject — la foto NO sirve (borrosa, con lentes, etc.):
// se borra del Storage y el cliente ve "Error al activar — intentá de nuevo" en su portal.
adminReservationsRouter.post('/:id/face-reject', requireAuth, async (req, res: Response) => {
  try {
    const snap = await db.collection('reservations').doc(req.params.id).get();
    if (!snap.exists) { res.status(404).json({ error: 'Reservation not found' }); return; }
    const r = snap.data() as any;
    if (r.facePhotoPath) {
      try { await storage.bucket('mc-nordelta-2026.firebasestorage.app').file(String(r.facePhotoPath)).delete(); }
      catch (e) { console.warn('face-reject: no se pudo borrar la foto:', e); }
    }
    await db.collection('reservations').doc(req.params.id).update({
      faceEnrollStatus: 'failed',
      facePhotoPath: admin.firestore.FieldValue.delete(),
    });
    await logAudit({
      actor: (req as any).email || 'admin', via: 'admin', role: 'admin',
      action: 'face_foto_rechazada',
      entity: 'reservation', entityId: req.params.id, branchId: r.sucursalId,
      detail: { cliente: r.customerName || '', baulera: r.bauleraCodigo || r.storageRoomId || null },
    });
    res.json({ message: 'Foto rechazada — el cliente puede subir otra desde su portal' });
  } catch (err) {
    console.error('POST /admin/reservations/:id/face-reject error:', err);
    res.status(500).json({ error: 'No se pudo rechazar la foto' });
  }
});

// POST /admin/reservations/:id/resend-activation — reenvía el mail de activación del portal
// (crear contraseña + confirmar email). Útil cuando el mail original no llegó (ej. el bug del
// remitente resend.dev, arreglado el 11/07) o el cliente lo perdió.
adminReservationsRouter.post('/:id/resend-activation', requireAuth, async (req, res: Response) => {
  try {
    const snap = await db.collection('reservations').doc(req.params.id).get();
    if (!snap.exists) { res.status(404).json({ error: 'Reservation not found' }); return; }
    const r = snap.data() as any;
    const email = String(r.customerEmail || '').trim().toLowerCase();
    if (!email) { res.status(400).json({ error: 'La reserva no tiene email de cliente' }); return; }
    await sendActivationEmail(email, String(r.customerName || ''));
    await logAudit({
      actor: (req as any).email || (req as any).uid || 'admin',
      via: 'admin', role: 'admin',
      action: 'reenvio_activacion',
      entity: 'reservation', entityId: req.params.id, branchId: r.sucursalId,
      detail: { cliente: r.customerName || '', email },
    });
    res.json({ message: 'Mail de activación enviado', to: email });
  } catch (err) {
    console.error('POST /admin/reservations/:id/resend-activation error:', err);
    res.status(500).json({ error: 'No se pudo reenviar el mail de activación' });
  }
});

// POST /admin/reservations/:id/cancel — DAR DE BAJA desde el panel (Ventas en curso).
// Si tiene suscripción MP la CANCELA en MP (corta el cobro de verdad — a diferencia de Eliminar,
// que solo borra el registro). Marca la reserva cancelada y LIBERA la baulera. Para pago único
// (sin sub) marca + libera. El webhook de MP puede llegar después con la misma baja: es idempotente.
adminReservationsRouter.post('/:id/cancel', requireAuth, async (req, res: Response) => {
  try {
    const snap = await db.collection('reservations').doc(req.params.id).get();
    if (!snap.exists) { res.status(404).json({ error: 'Reservation not found' }); return; }
    const r = snap.data() as any;
    if (r.status === 'cancelled') { res.json({ message: 'Ya estaba dada de baja' }); return; }

    // 1) Cortar el cobro en MP (lo importante). Si MP falla, verificar el estado real:
    //    solo seguimos si la sub ya está cancelada; si no, NO marcamos nada (evita
    //    "cancelada local pero cobrando en MP").
    if (r.mpPreapprovalId) {
      try {
        await cancelSubscription(String(r.mpPreapprovalId));
      } catch (e) {
        const st = await getSubscriptionStatus(String(r.mpPreapprovalId));
        if (st !== 'cancelled') {
          res.status(502).json({ error: 'MP no aceptó la cancelación de la suscripción. Cancelala desde el panel de MP y reintentá.' });
          return;
        }
      }
    }

    // 2) Marcar la reserva de baja (mismo shape que la baja vía webhook)
    await db.collection('reservations').doc(req.params.id).update({
      status: 'cancelled',
      mpSubscriptionStatus: 'cancelled',
      cancelledAt: admin.firestore.Timestamp.now(),
      cancelledBy: 'admin',
      bajaGestionada: true,
    });

    // 3) Liberar la baulera — y DESANEXAR el puntero del cliente (auditoría integridad 16/07:
    // customers.bauleraCodigo quedaba vivo tras la baja → el fallback de la ficha podía traer los
    // datos del inquilino anterior al revender).
    if (r.storageRoomId) {
      const roomRef = db.collection('storageRooms').doc(String(r.storageRoomId));
      try {
        const rs = await roomRef.get();
        const custId = rs.exists ? String((rs.data() as Record<string, unknown>)['customerId'] || '') : '';
        if (custId) {
          await db.collection('customers').doc(custId).set(
            { bauleraCodigo: null, storageRoomId: null, updatedAt: new Date().toISOString() }, { merge: true });
        }
      } catch (e) { console.warn('[cancel] no se pudo desanexar el customer de la baulera', e); }
      await roomRef.set({
        status: 'available', customerId: null, currentTenant: null, contractNumber: null,
        reservationId: null, heldUntil: null, heldByReservationId: null,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

    await logAudit({
      actor: (req as any).email || (req as any).uid || 'admin',
      via: 'admin',
      role: 'admin',
      action: 'baja_suscripcion',
      entity: 'reservation', entityId: req.params.id, branchId: r.sucursalId,
      detail: { cliente: r.customerName || '', baulera: r.bauleraCodigo || r.storageRoomId || null, dadaDeBajaPor: 'admin', teniaSubMP: !!r.mpPreapprovalId, paymentMode: r.paymentMode || 'subscription' },
    });

    // Invalidar cachés (auditoría ventas 16/07 — C2): sin esto, la sub recién cancelada seguía
    // figurando "viva" en el snapshot → aparecía como candidata en "Vincular MP" y podía atarse
    // a OTRA baulera; y el titileo de rechazados quedaba con el estado viejo.
    invalidateSubsCache();
    invalidateRechazadosCache();

    res.json({ message: 'Dada de baja', mpCancelled: !!r.mpPreapprovalId, roomFreed: !!r.storageRoomId });
  } catch (err) {
    console.error('POST /admin/reservations/:id/cancel error:', err);
    res.status(500).json({ error: 'No se pudo dar de baja' });
  }
});

// POST /admin/reservations/deuda — SPEC cobros-alineados §5: genera un PAGO ÚNICO por un mes
// adeudado (o un proporcional). NO crea suscripción (la del cliente sigue viva sola). El webhook
// marca la deuda pagada cuando el cliente paga → apaga el titileo. Body: { bauleraCodigo, monto,
// tipo: 'mes_adeudado'|'proporcional', periodo?, desde?, hasta?, email, cliente?, reservationId? }.
adminReservationsRouter.post('/deuda', requireAuth, async (req, res: Response) => {
  try {
    const { bauleraCodigo, reservationId, monto, tipo, periodo, desde, hasta, email, cliente } = (req.body || {}) as Record<string, string | number | undefined>;
    const code = String(bauleraCodigo || '').trim().toUpperCase();
    const montoNum = Number(monto);
    const mail = String(email || '').trim().toLowerCase();
    if (!code) { res.status(400).json({ error: 'Falta la baulera' }); return; }
    if (!(montoNum > 0)) { res.status(400).json({ error: 'Poné el monto de la deuda' }); return; }
    if (!mail) { res.status(400).json({ error: 'Falta el email del cliente para mandarle el link' }); return; }

    // GUARD anti-doble-link EN EL SERVER (auditoría v3 C1): el guard del front depende de una
    // pantalla fresca — con 2 operadores (o una pestaña vieja) se generaban 2 links vivos para el
    // mismo mes → el cliente podía pagar dos veces. Si ya hay una deuda pendiente para esta
    // baulera, NO se crea otra: 409 con el link vigente (el front lo muestra para reenviar).
    const viva = await getPendingDebtByBaulera(code);
    if (viva) {
      res.status(409).json({
        error: `Ya hay un link de deuda VIVO para ${code} ($${viva.monto.toLocaleString('es-AR')}, ${viva.tipo}, enviado el ${String(viva.sentAt).slice(0, 10)}). Reenviale ese — no se genera otro.`,
        debtId: viva.id, initPoint: viva.initPoint, monto: viva.monto, periodo: viva.periodo, tipo: viva.tipo, email: viva.email, sentAt: viva.sentAt,
      });
      return;
    }

    const t: DebtTipo = tipo === 'proporcional' ? 'proporcional' : 'mes_adeudado';
    const per = String(periodo || new Date().toISOString().slice(0, 7));
    const debtId = `deuda-${code}-${per}-${crypto.randomBytes(4).toString('hex')}`;
    const rango = `${desde ? String(desde) : ''}${hasta ? ' al ' + String(hasta) : ''}`.trim();
    const titulo = t === 'proporcional'
      ? `Mi Container ${code} — proporcional ${rango || per}`
      : `Mi Container ${code} — mes adeudado ${rango || per}`;

    const { preferenceId, initPoint } = process.env.FUNCTIONS_EMULATOR === 'true'
      ? { preferenceId: `emu-${debtId}`, initPoint: `https://www.mercadopago.com.ar/checkout/emulator?deuda=${debtId}` }
      : await createDebtPreference({ debtId, title: titulo, amount: montoNum, email: mail, backUrl: 'https://micontainer.com/#/portal' });

    await createDebt({
      id: debtId, bauleraCodigo: code, reservationId: reservationId ? String(reservationId) : null,
      periodo: per, desde: desde ? String(desde) : null, hasta: hasta ? String(hasta) : null,
      tipo: t, monto: montoNum, sentAt: new Date().toISOString(),
      sentBy: String((req as unknown as { email?: string }).email || 'admin'),
      mpPreferenceId: preferenceId, initPoint, email: mail, cliente: cliente ? String(cliente) : null,
      paidAt: null, mpPaymentId: null,
    });

    await logAudit({
      actor: (req as unknown as { email?: string }).email || 'admin', via: 'admin', action: 'deuda_link_generado',
      entity: 'debt', entityId: debtId, detail: { baulera: code, monto: montoNum, tipo: t, periodo: per, email: mail },
    });
    invalidateRechazadosCache(); // la baulera pasa a violeta (deuda con link enviado) al toque

    res.status(201).json({ debtId, initPoint, tipo: t, monto: montoNum, periodo: per, email: mail });
  } catch (err) {
    console.error('POST /admin/reservations/deuda error:', err);
    res.status(500).json({ error: 'No se pudo generar el link de deuda', detail: err instanceof Error ? err.message : String(err) });
  }
});

// POST /admin/reservations/rebill — REENVIAR LINK DE COBRO tras un pago rechazado.
// Flujo (pedido Lucas 13/07): la sub rechazada se CANCELA en MP (deja de reintentar), se crea
// una sub NUEVA atada a la MISMA reserva/baulera (no se abre nada nuevo), el link se manda al
// cliente por mail y queda guardado; si lo paga, el webhook lo reactiva solo con toda su info.
// ORDEN CRÍTICO: crear la nueva → reapuntar la reserva → RECIÉN AHÍ cancelar la vieja. Si se
// cancelara primero, el evento 'cancelled' del webhook procesaría la BAJA y liberaría la baulera.
// Body: { subId, baulera?, amount?, email?, cliente? } — subId = preapproval rechazado (viene
// de /pricing-engine/cobros-rechazados). Cubre subs legacy SIN reserva en nuestra base: se les
// crea una reserva mínima anexada a su baulera (matcheable por el webhook de ahí en más).
adminReservationsRouter.post('/rebill', requireAuth, async (req, res: Response) => {
  // DESHABILITADO (SPEC cobros-alineados): el recobro ya NO crea una suscripción nueva ni cancela
  // la del cliente. Las deudas se cobran con PAGO ÚNICO (POST /admin/reservations/deuda). Neutralizada
  // para que ningún bundle viejo pueda crear una suscripción por error. (El flag typed 'boolean' evita
  // el error "unreachable code": el cuerpo viejo queda type-check-eable pero MUERTO en runtime.)
  const REBILL_DISABLED: boolean = true;
  if (REBILL_DISABLED) {
    res.status(410).json({ error: 'Ruta discontinuada. Usá POST /admin/reservations/deuda (pago único).' });
    return;
  }
  try {
    const { subId, baulera, amount, email, cliente } = (req.body || {}) as Record<string, string | number | undefined>;
    // subId es OPCIONAL (caso MANUAL: MP muestra el rechazo pero la web no lo detectó —
    // sub sin external_reference matcheable, pausada, etc.). Con baulera alcanza: la sub
    // vieja se busca en MP por código/email para cancelarla igual.
    if (!subId && !baulera) { res.status(400).json({ error: 'Falta subId o baulera' }); return; }

    // 1) Reserva existente (por sub, o por código de baulera) — puede NO existir (sub legacy).
    let reservation = subId ? await getReservationByMpPreapprovalId(String(subId)) : null;
    if (!reservation && baulera) reservation = await getReservationByBauleraCodigo(String(baulera));

    // 2) Baulera real (para anexar todo: room + tenant + precio).
    let room: Record<string, unknown> | null = null;
    let roomId: string | null = reservation?.storageRoomId || null;
    const code = String(baulera || reservation?.bauleraCodigo || '');
    if (code) {
      const rs = await db.collection('storageRooms').where('space', '==', code).limit(1).get();
      if (!rs.empty) { room = rs.docs[0].data() as Record<string, unknown>; roomId = rs.docs[0].id; }
    }
    if (!room && roomId) {
      const rd = await db.collection('storageRooms').doc(String(roomId)).get();
      if (rd.exists) room = rd.data() as Record<string, unknown>;
    }

    const monto = Number(amount) > 0 ? Number(amount) : (reservation?.monthly || Number(room?.['price']) || 0);
    const mailCliente = String(email || reservation?.customerEmail || (room?.['tenantEmail'] as string) || '').toLowerCase().trim();
    const nombre = String(cliente || reservation?.customerName || (room?.['currentTenant'] as string) || '');
    const m2 = Number(reservation?.m2 || room?.['areaM2']) || 0;
    if (!(monto > 0)) { res.status(400).json({ error: 'No pude determinar el monto mensual (mandalo en amount)' }); return; }
    if (!mailCliente) { res.status(400).json({ error: 'Sin email del cliente: cargalo para poder mandarle el link' }); return; }

    // 2b) Sub VIEJA a cancelar: la clickeada (rechazados), la de la reserva, o BUSCARLA en MP
    // por código de baulera / email — incluye 'paused' (MP pausa tras agotar reintentos).
    let oldSubId = String(subId || reservation?.mpPreapprovalId || '');
    if (!oldSubId) {
      try {
        const canon = (c: string): string => { const s = String(c || '').toUpperCase(); const m = s.match(/([A-Z]\d)\D*0*(\d+)/); return m ? m[1] + m[2] : s.replace(/[^A-Z0-9]/g, ''); };
        const codeOf = (ext: string): string => { const m = String(ext || '').match(/[A-Za-z]\d+-\d+|[A-Za-z]\d{3,}/); return m ? canon(m[0]) : ''; };
        const subs = (await searchSubscriptionsCached()).filter((s) => s.status === 'authorized' || s.status === 'pending' || s.status === 'paused');
        const target = canon(code);
        let hit = target ? subs.find((s) => codeOf(s.externalReference) === target) : undefined;
        if (!hit && mailCliente) hit = subs.find((s) => s.payerEmail.trim().toLowerCase() === mailCliente);
        if (hit) oldSubId = hit.id;
      } catch { /* sin acceso a MP: seguimos sin cancelar (se avisa en la respuesta) */ }
    }

    // 3) Crear la sub NUEVA (idempotency key propia: con la de la reserva, MP devolvería la vieja).
    const resId = reservation?.id || generateReservationId();
    const { preapprovalId: nuevaSubId, initPoint } = await createSubscription({
      reservationId: resId,
      categoryLabel: reservation?.category || `Baulera ${m2}m2`,
      m2, amount: monto, email: mailCliente,
      backUrl: 'https://micontainer.com/#/portal',
      bauleraCodigo: code || undefined,
      idempotencyKey: `rebill-${oldSubId || 'manual'}-${Date.now()}`,
    });

    // 4) Reapuntar/crear la reserva ANTES de cancelar la vieja (ver ORDEN CRÍTICO arriba).
    const rebillFields = {
      mpPreapprovalId: nuevaSubId, mpInitPoint: initPoint, mpSubscriptionStatus: 'pending' as const,
      rebillAt: new Date().toISOString(),
      rebillBy: String((req as unknown as { email?: string }).email || 'admin'),
      rebillPrevPreapprovalId: oldSubId,
    };
    if (reservation) {
      await updateReservation(reservation.id, {
        ...rebillFields,
        // El link nuevo DEFINE lo que paga: la reserva queda con el monto real (el importe
        // correcto de lo que debe/paga — pedido Lucas), no con el configurado viejo.
        monthly: monto,
        // Si MP ya la había dado de baja (3 cuotas rechazadas), vuelve a pending_payment: al
        // pagar el link nuevo el webhook la ACTIVA de nuevo y le reasigna la baulera solo.
        ...(reservation.status === 'cancelled' ? { status: 'pending_payment' as const } : {}),
      });
    } else {
      // Sub legacy sin reserva: crear una mínima anexada a su baulera. status 'active' porque
      // el cliente YA la ocupa — no se abre ni se asigna nada nuevo.
      const uid = `manual_${crypto.createHash('sha1').update(mailCliente).digest('hex').slice(0, 16)}`;
      await createReservation({
        id: resId, userUid: uid, sucursalId: String(room?.['branchId'] || 'nordelta'),
        category: `Baulera ${m2}m2`, m2, monthly: monto, firstMonth: monto,
        startDate: new Date().toISOString().slice(0, 10), duration: 1,
        addons: [], promosApplied: [], status: 'active',
        faceEnrollStatus: 'not_started', faceEnrollAttempts: 0,
        customerName: nombre, customerEmail: mailCliente,
        storageRoomId: roomId || undefined, bauleraCodigo: code || undefined,
        source: 'rebill-legacy', paymentMode: 'subscription',
        ...rebillFields,
      });
    }

    // 5) AHORA sí: cancelar la sub vieja en MP (acá paran los reintentos). Si MP falla y no
    // quedó cancelada, devolvemos el link nuevo igual con aviso (cancelarla desde el panel MP).
    // Caso manual sin sub encontrada: no hay nada que cancelar → se avisa en la respuesta.
    let viejaCancelada = false;
    if (oldSubId) {
      viejaCancelada = true;
      try { await cancelSubscription(oldSubId); }
      catch {
        const st = await getSubscriptionStatus(oldSubId);
        viejaCancelada = st === 'cancelled';
      }
    }

    // 6) Mail al cliente + caches + auditoría.
    let emailEnviado = false;
    try { await sendRebillEmail(mailCliente, nombre, initPoint, code || undefined, monto); emailEnviado = true; }
    catch (e) { console.warn('[rebill] mail fail', e); }
    invalidateSubsCache();
    invalidateRechazadosCache();
    await logAudit({
      actor: String((req as unknown as { email?: string }).email || 'admin'), via: 'admin', role: 'admin',
      action: 'reenvio_link_cobro', entity: 'reservation', entityId: resId,
      branchId: String(room?.['branchId'] || reservation?.sucursalId || 'nordelta'),
      detail: { baulera: code || null, cliente: nombre, monto, subVieja: oldSubId || null, subNueva: nuevaSubId, viejaCancelada, emailEnviado, legacy: !reservation },
    });

    res.json({ ok: true, reservationId: resId, initPoint, viejaCancelada, subViejaEncontrada: !!oldSubId, emailEnviado, email: mailCliente });
  } catch (err) {
    console.error('POST /admin/reservations/rebill error:', err);
    res.status(500).json({ error: 'No se pudo generar el nuevo link de cobro', detail: err instanceof Error ? err.message : String(err) });
  }
});

// GET /admin/reservations/:id/mp-candidates — para VINCULAR una suscripción de MP a esta reserva.
// Caso real (15/07, Rivas): alta MANUAL o cliente que pagó con OTRA cuenta de MP → la sub quedó
// "suelta" (sin código de baulera, sin linkear) → los cobros/rechazos futuros no se detectan.
// Busca subs MP vivas candidatas (mismo email del cliente, o monto cercano ±30%) para que el
// operador ELIJA (la identidad la confirma el humano — nunca se ata sola, igual que el anti-cruce).
adminReservationsRouter.get('/:id/mp-candidates', requireAuth, async (req, res: Response) => {
  try {
    const r = await getReservation(req.params.id);
    if (!r) { res.status(404).json({ error: 'Reserva no encontrada' }); return; }
    const code = String(r.bauleraCodigo || '').trim().toUpperCase();
    const email = String(r.customerEmail || '').trim().toLowerCase();
    const monthly = Number(r.monthly) || 0;
    const all = await searchSubscriptionsCached();
    const cand = all
      .filter((s) => s.status === 'authorized' || s.status === 'pending')
      .map((s) => {
        const refUp = String(s.externalReference || '').toUpperCase();
        const mismoEmail = !!email && String(s.payerEmail || '').toLowerCase() === email;
        const yaEstaBaulera = !!code && refUp.includes(code);
        const yaOtraBaulera = /BAULERA/.test(refUp) && !yaEstaBaulera;
        const cerca = monthly > 0 ? Math.abs(s.amount - monthly) / monthly : 1;
        return { id: s.id, amount: s.amount, status: s.status, payerEmail: s.payerEmail || '', ref: s.externalReference || '', mismoEmail, yaEstaBaulera, yaOtraBaulera, cerca };
      })
      .filter((c) => c.mismoEmail || c.yaEstaBaulera || c.cerca <= 0.30)
      .sort((a, b) => (Number(b.mismoEmail) - Number(a.mismoEmail)) || (Number(a.yaOtraBaulera) - Number(b.yaOtraBaulera)) || (a.cerca - b.cerca))
      .slice(0, 20);
    res.json({ baulera: code, email, monthly, candidatos: cand });
  } catch (err) {
    console.error('GET /admin/reservations/:id/mp-candidates error:', err);
    res.status(500).json({ error: 'No se pudieron buscar suscripciones' });
  }
});

// POST /admin/reservations/:id/vincular-mp  { subId, forzar? } — ATA una suscripción de MP a la
// reserva: (1) estampa el CÓDIGO DE BAULERA en la referencia externa de la sub (así los cobros y
// rechazos futuros SÍ se detectan/titilan y el ticket de MP muestra la baulera), (2) guarda el
// preapprovalId en la reserva, (3) la activa + asigna la baulera si estaba pendiente. Cierra el
// cabo suelto del alta manual. Guard: si la sub ya nombra OTRA baulera, no la pisa sin `forzar`.
adminReservationsRouter.post('/:id/vincular-mp', requireAuth, async (req, res: Response) => {
  try {
    const subId = String((req.body || {}).subId || '').trim();
    if (!subId) { res.status(400).json({ error: 'Elegí la suscripción a vincular' }); return; }
    const r = await getReservation(req.params.id);
    if (!r) { res.status(404).json({ error: 'Reserva no encontrada' }); return; }
    const code = String(r.bauleraCodigo || '').trim().toUpperCase();
    const det = await getPreapprovalDetail(subId);
    if (!det) { res.status(404).json({ error: 'La suscripción no existe en MP' }); return; }
    const refUp = String(det.externalReference || '').toUpperCase();
    if (/BAULERA/.test(refUp) && code && !refUp.includes(code) && (req.body || {}).forzar !== true) {
      res.status(409).json({ error: `Esa suscripción ya figura vinculada a otra baulera (${det.externalReference}). Revisá antes de reasignarla.`, refActual: det.externalReference });
      return;
    }
    const stamped = code ? await setPreapprovalExternalReference(subId, `MiContainer Baulera ${r.bauleraCodigo}`) : false;
    const activar = r.status === 'pending_payment' && (det.status === 'authorized' || det.status === 'pending');
    await updateReservation(r.id, {
      mpPreapprovalId: subId,
      mpSubscriptionStatus: det.status === 'authorized' ? 'authorized' : 'pending',
      ...(activar ? { status: 'active' } : {}),
    } as never);
    let assignedRoom: string | null = null;
    if (activar) assignedRoom = await assignRoomForReservation({ ...r, status: 'active', mpPreapprovalId: subId } as never, r.storageRoomId);
    invalidateSubsCache();
    invalidateRechazadosCache();
    await logAudit({
      actor: (req as unknown as { email?: string }).email || 'admin', via: 'admin',
      action: 'sub_vinculada', entity: 'reservation', entityId: r.id,
      detail: { baulera: code || null, subId, refEstampada: stamped, activada: activar, room: assignedRoom, payerEmail: det.payerEmail || null },
    });
    res.json({ ok: true, subId, refEstampada: stamped, activada: activar, baulera: code, room: assignedRoom });
  } catch (err) {
    console.error('POST /admin/reservations/:id/vincular-mp error:', err);
    res.status(500).json({ error: 'No se pudo vincular la suscripción', detail: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /admin/reservations/:id — eliminar una solicitud/reserva (ej. pendiente sin pagar).
// Deja AUDITORÍA con una copia de los datos (14/07: se borró la reserva activa de A3-037 sin
// rastro de quién/cuándo — el snapshot en audit_log permite reconstruirla si fue un error).
adminReservationsRouter.delete('/:id', requireAuth, async (req, res: Response) => {
  try {
    const ref = db.collection('reservations').doc(req.params.id);
    const snap = await ref.get();
    const datos = snap.exists ? (snap.data() as Record<string, unknown>) : null;
    await ref.delete();
    await logAudit({
      actor: (req as unknown as { email?: string }).email || (req as unknown as { uid?: string }).uid || 'admin',
      via: 'admin', action: 'reserva_eliminada', entity: 'reservation', entityId: req.params.id,
      detail: { baulera: (datos?.['bauleraCodigo'] as string) || null, status: (datos?.['status'] as string) || null, copia: datos || null },
    });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('DELETE /admin/reservations/:id error:', err);
    res.status(500).json({ error: 'Could not delete reservation' });
  }
});
