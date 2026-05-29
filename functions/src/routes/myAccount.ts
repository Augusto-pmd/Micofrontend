/**
 * GET /my-account
 * Endpoint para el portal del cliente.
 * Devuelve el perfil del cliente + todos sus contratos/bauleras.
 * Funciona con:
 *  - Firebase token de cualquier cuenta (Google login del cliente)
 *  - Búsqueda por email (sin token, solo email en query param para casos legacy)
 */
import { Router, Response } from 'express';
import { optionalAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { db } from '../config/firebase';

export const myAccountRouter = Router();

// GET /my-account — perfil + contratos del cliente logueado
myAccountRouter.get('/', optionalAuth, async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const tokenEmail = authReq.email?.toLowerCase();
  const queryEmail = (req.query['email'] as string || '').toLowerCase();
  const email = tokenEmail || queryEmail;

  if (!email) {
    res.status(400).json({ error: 'Se requiere autenticación o email' });
    return;
  }

  try {
    // 1. Buscar cliente por email en colección customers
    const custSnap = await db.collection('customers')
      .where('email', '==', email)
      .limit(5)
      .get();

    let customerData: any = null;
    let customerId: string | null = null;

    if (!custSnap.empty) {
      const doc = custSnap.docs[0];
      customerData = { id: doc.id, ...doc.data() };
      customerId = doc.id;
    }

    // 2. Buscar órdenes manuales (reservationOrders) por email o customerId
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

    // 3. Buscar reservas online (MP) por email o userUid
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
      // Construir initPoint desde el guardado o desde el preapprovalId como fallback
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

    // 4. Enriquecer órdenes con datos de la baulera
    const allContractRoomIds = orders
      .map((o: any) => o.storageRoomId)
      .filter(Boolean);

    let roomsMap: Record<string, any> = {};
    if (allContractRoomIds.length > 0) {
      const roomDocs = await db.getAll(
        ...allContractRoomIds.map((id: string) => db.collection('storageRooms').doc(id))
      );
      roomDocs.forEach((d: any) => {
        if (d.exists) roomsMap[d.id] = { id: d.id, ...d.data() };
      });
    }

    const enrichedOrders = orders.map((o: any) => ({
      ...o,
      storageRoom: roomsMap[o.storageRoomId] || null,
    }));

    // 5. Armar respuesta completa
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
