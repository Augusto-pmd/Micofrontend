/**
 * GET /my-account
 * Portal del cliente. Devuelve SOLO el perfil + contratos del usuario autenticado.
 * Seguridad: exige token Firebase verificado (requireAuth) y email confirmado.
 * Ya NO acepta ?email= sin token (eso exponia datos de cualquier cliente).
 */
import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { db, auth } from '../config/firebase';

export const myAccountRouter = Router();

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

    // 3. Reservas online (MP) por email o userUid
    const [mpByEmail, mpByUid] = await Promise.all([
      db.collection('reservations').where('customerEmail', '==', email).get(),
      authReq.uid
        ? db.collection('reservations').where('userUid', '==', authReq.uid).get()
        : Promise.resolve({ docs: [] as any[] }),
    ]);

    const mpDocs = [...mpByEmail.docs];
    const seenIds = new Set(mpDocs.map(d => d.id));
    (mpByUid as any).docs.forEach((d: any) => { if (!seenIds.has(d.id)) mpDocs.push(d); });

    const mpReservations = mpDocs.map(d => {
      const r = { id: d.id, ...d.data() } as any;
      const initPoint = r.mpInitPoint ||
        (r.mpPreapprovalId
          ? `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=${r.mpPreapprovalId}`
          : null);
      return {
        id: d.id,
        contractNumber: null,
        bauleraCodigo: null,
        storageRoomId: null,
        category: r.category,
        m2: r.m2,
        monthlyPrice: r.monthly,
        startDate: r.startDate,
        status: r.status,
        mpPreapprovalId: r.mpPreapprovalId,
        mpSubscriptionStatus: r.mpSubscriptionStatus,
        mpInitPoint: initPoint,
        customerName: r.customerName,
        source: 'mp',
        branchId: r.sucursalId,
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
    const allContracts = [...enrichedOrders, ...mpReservations];
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
