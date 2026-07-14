/**
 * GET /my-account
 * Portal del cliente. Devuelve SOLO el perfil + contratos del usuario autenticado.
 * Seguridad: exige token Firebase verificado (requireAuth) y email confirmado.
 * Ya NO acepta ?email= sin token (eso exponia datos de cualquier cliente).
 */
import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { db, auth, storage } from '../config/firebase';
import { getChargeHistory } from '../services/mercadopago.service';
import { collectClientReservationDocs } from '../services/customerMatch.service';
import { logAudit } from '../services/audit.service';

const FACE_BUCKET = 'mc-nordelta-2026.firebasestorage.app';

export const myAccountRouter = Router();

// Chequeo de email verificado (mismo que en GET /). Devuelve true si puede seguir.
async function emailVerificadoOk(authReq: AuthenticatedRequest, res: Response): Promise<boolean> {
  if (process.env.FUNCTIONS_EMULATOR === 'true') return true;
  try {
    const fbUser = await auth.getUser(authReq.uid);
    if (!fbUser.emailVerified) { res.status(403).json({ error: 'Confirmá tu email para acceder a tu portal', code: 'email_not_verified' }); return false; }
    return true;
  } catch { res.status(403).json({ error: 'Cuenta no activada', code: 'not_activated' }); return false; }
}

// POST /my-account/face-enroll — SUBE la foto biométrica del cliente a Firebase Storage,
// ANEXADA a su reserva/baulera (face-enroll/{reservationId}/...). Antes la foto no iba a
// ningún lado (solo preview local). El estado pasa a 'queued' = pendiente de alta en el
// dispositivo de acceso (la hace el staff mirando la foto desde el admin).
myAccountRouter.post('/face-enroll', requireAuth, async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const email = (authReq.email || '').toLowerCase();
  if (!email) { res.status(401).json({ error: 'No autenticado' }); return; }
  if (!(await emailVerificadoOk(authReq, res))) return;
  try {
    const { reservationId, image } = (req.body || {}) as { reservationId?: string; image?: string };
    if (!reservationId || typeof image !== 'string') { res.status(400).json({ error: 'Faltan datos (reserva o imagen)' }); return; }

    const snap = await db.collection('reservations').doc(String(reservationId)).get();
    if (!snap.exists) { res.status(404).json({ error: 'Reserva no encontrada' }); return; }
    const r = snap.data() as any;
    const esSuya = String(r.customerEmail || '').toLowerCase() === email || r.userUid === authReq.uid;
    if (!esSuya) { res.status(403).json({ error: 'La reserva no pertenece a tu cuenta' }); return; }

    const m = image.match(/^data:image\/(jpeg|jpg|png);base64,(.+)$/);
    if (!m) { res.status(400).json({ error: 'Formato inválido: mandá una foto JPG o PNG' }); return; }
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length < 10 * 1024) { res.status(400).json({ error: 'La imagen es demasiado chica' }); return; }
    if (buf.length > 6 * 1024 * 1024) { res.status(400).json({ error: 'La foto es muy pesada (máx. 6MB)' }); return; }

    const ext = m[1] === 'png' ? 'png' : 'jpg';
    const path = `face-enroll/${reservationId}/${Date.now()}.${ext}`;
    await storage.bucket(FACE_BUCKET).file(path).save(buf, {
      contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      resumable: false,
      metadata: { metadata: { reservationId: String(reservationId), baulera: String(r.bauleraCodigo || r.storageRoomId || ''), email } },
    });

    await db.collection('reservations').doc(String(reservationId)).update({
      faceEnrollStatus: 'queued',
      faceEnrollAttempts: (Number(r.faceEnrollAttempts) || 0) + 1,
      facePhotoPath: path,
      faceEnrollAt: new Date().toISOString(),
    });
    await logAudit({
      actor: email, via: 'portal',
      action: 'face_enroll_subida',
      entity: 'reservation', entityId: String(reservationId), branchId: r.sucursalId,
      detail: { baulera: r.bauleraCodigo || r.storageRoomId || null, path, bytes: buf.length },
    });
    res.json({ message: 'Foto recibida — tu alta está en proceso', status: 'queued' });
  } catch (err) {
    console.error('POST /my-account/face-enroll error:', err);
    res.status(500).json({ error: 'No se pudo subir la foto. Probá de nuevo.' });
  }
});

// GET /my-account/payments — HISTORIAL REAL de cobros del cliente autenticado (de Mercado Pago).
// Resuelve las suscripciones del cliente por su token (email/uid) → nadie puede pedir el de otro.
// Reemplaza el historial INVENTADO del portal por los cobros reales (monto/fecha/estado).
myAccountRouter.get('/payments', requireAuth, async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const email = (authReq.email || '').toLowerCase();
  if (!email) { res.status(401).json({ error: 'No autenticado' }); return; }
  if (!(await emailVerificadoOk(authReq, res))) return;
  try {
    const mpDocs = await collectClientReservationDocs(email, authReq.uid);
    const seen = new Set<string>();
    const preapprovalIds: string[] = [];
    mpDocs.forEach((d: any) => {
      const pid = d.data()?.mpPreapprovalId;
      if (pid && !seen.has(pid)) { seen.add(pid); preapprovalIds.push(pid); }
      // Tras un REENVÍO de link de cobro (rebill) la sub vieja queda cancelada, pero sus
      // cobros son historia REAL del cliente → se incluye para que el historial del portal
      // no "pierda" los meses anteriores al reenvío.
      const prev = d.data()?.rebillPrevPreapprovalId;
      if (prev && !seen.has(prev)) { seen.add(prev); preapprovalIds.push(prev); }
    });
    const subs = await Promise.all(preapprovalIds.map(async (pid) => ({
      mpPreapprovalId: pid,
      history: await getChargeHistory(pid),
    })));
    res.json({ subs });
  } catch (err) {
    console.error('GET /my-account/payments error:', err);
    res.status(500).json({ error: 'No se pudo obtener el historial de pagos' });
  }
});

myAccountRouter.get('/', requireAuth, async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const email = (authReq.email || '').toLowerCase();
  if (!email) { res.status(401).json({ error: 'No autenticado' }); return; }

  // Bloquear si el email no esta verificado (debe activar su cuenta primero).
  // El emulador no maneja emailVerified de forma confiable, asi que lo saltea.
  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    try {
      const fbUser = await auth.getUser(authReq.uid);
      if (!fbUser.emailVerified) {
        res.status(403).json({ error: 'Confirmá tu email para acceder a tu portal', code: 'email_not_verified' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'Cuenta no activada', code: 'not_activated' });
      return;
    }
  }

  try {
    // 1. Cliente por email (solo el propio, del token)
    const custSnap = await db.collection('customers').where('email', '==', email).limit(5).get();
    let customerData: any = null;
    let customerId: string | null = null;
    if (!custSnap.empty) {
      const doc = custSnap.docs[0];
      customerData = { id: doc.id, ...doc.data() };
      customerId = doc.id;
    }

    // 2. Ordenes manuales por email o customerId
    const ordersSnap = customerId
      ? await db.collection('reservationOrders').where('customerId', '==', customerId).get()
      : await db.collection('reservationOrders').where('customerEmail', '==', email).get();

    const orders = ordersSnap.docs.map(d => {
      const o = { id: d.id, ...d.data() } as any;
      return {
        id: d.id,
        contractNumber: o.contractNumber,
        bauleraCodigo: o.bauleraCodigo,
        storageRoomId: o.storageRoomId,
        m2: o.m2,
        monthlyPrice: o.monthlyPrice || parseInt(o.totalAmount) || 0,
        startDate: o.entryDate || o.startDate,
        status: o.status,
        source: 'manual',
        branchId: o.branchId,
        buildingId: o.buildingId,
      };
    });

    // 3. Reservas online (MP) por email/uid + DNI/teléfono (macheo reforzado: junta las bauleras
    //    del cliente aunque alguna se haya cargado con otro mail). Ver customerMatch.service.
    const mpDocs = await collectClientReservationDocs(email, authReq.uid);

    const mpReservations = mpDocs.map(d => {
      const r = { id: d.id, ...d.data() } as any;
      const initPoint = r.mpInitPoint ||
        (r.mpPreapprovalId
          ? `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=${r.mpPreapprovalId}`
          : null);
      return {
        id: d.id,
        contractNumber: null,
        // La baulera SÍ existe en la reserva (se asigna al pagar) — antes iba null y el
        // portal no podía mostrar el código del espacio.
        bauleraCodigo: r.bauleraCodigo || null,
        storageRoomId: r.storageRoomId || null,
        category: r.category,
        m2: r.m2,
        monthlyPrice: r.monthly,
        firstMonth: r.firstMonth,
        startDate: r.startDate,
        status: r.status,
        mpPreapprovalId: r.mpPreapprovalId,
        mpSubscriptionStatus: r.mpSubscriptionStatus,
        mpInitPoint: initPoint,
        customerName: r.customerName,
        source: 'mp',
        branchId: r.sucursalId,
        // Modo de pago (suscripción / plan / pago único) + vencimiento del pago único
        paymentMode: r.paymentMode || 'subscription',
        paidMonths: r.paidMonths || null,
        endDate: r.endDate || null,
        promosApplied: r.promosApplied || [],
        faceEnrollStatus: r.faceEnrollStatus || 'not_started',
      };
    });

    // 4. Enriquecer ordenes con datos de la baulera
    const allContractRoomIds = orders.map((o: any) => o.storageRoomId).filter(Boolean);
    let roomsMap: Record<string, any> = {};
    if (allContractRoomIds.length > 0) {
      const roomDocs = await db.getAll(
        ...allContractRoomIds.map((id: string) => db.collection('storageRooms').doc(id))
      );
      roomDocs.forEach((d: any) => { if (d.exists) roomsMap[d.id] = { id: d.id, ...d.data() }; });
    }
    const enrichedOrders = orders.map((o: any) => ({ ...o, storageRoom: roomsMap[o.storageRoomId] || null }));

    // 5. Respuesta
    // DEDUPE (bug 14/07, caso Aluzzo A2-040): la activación de una venta online crea la reserva
    // MP *y* su orden espejo 'order-online-<reservationId>' (assignment.service:111, para el
    // inventario interno). El portal mostraba LAS DOS → el cliente veía su baulera y sus pagos
    // duplicados y totalMonthly sumaba el doble. Se muestra SOLO la reserva MP (tiene el estado
    // vivo, el link de pago y la biometría); la orden espejo sigue existiendo para el inventario.
    const espejosMp = new Set(mpReservations.map((r: any) => `order-online-${r.id}`));
    const ordersSinEspejo = enrichedOrders.filter((o: any) => !espejosMp.has(String(o.id)));
    const allContracts = [...ordersSinEspejo, ...mpReservations];
    const activeContracts = allContracts.filter((c: any) =>
      c.status === 'CONFIRMED' || c.status === 'active' || c.status === 'authorized'
    );

    res.json({
      customer: customerData || {
        email,
        fullName: email.split('@')[0],
        firstName: email.split('@')[0],
        lastName: '',
      },
      contracts: allContracts,
      activeContracts,
      totalMonthly: activeContracts.reduce((s: number, c: any) => s + (c.monthlyPrice || 0), 0),
      hasAccount: !!customerData,
    });
  } catch (err) {
    console.error('GET /my-account error:', err);
    res.status(500).json({ error: 'Error al obtener tu cuenta' });
  }
});
