import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';
import { paginate } from '../../utils/pagination';
import { getBuildingMap } from '../../utils/buildingCache';
import { logAudit } from '../../services/audit.service';

export const storageRoomsRouter = Router();

const SEARCH_SCAN_CAP = 3000;

// Trae los clientes (tenants) de una lista de contractNumbers, en chunks de 10
// (límite del operador 'in' de Firestore). Solo para los docs de la página.
async function tenantsByContract(contractNums: string[]): Promise<Record<string, any>> {
  const map: Record<string, any> = {};
  const unique = [...new Set(contractNums.filter(Boolean))];
  if (unique.length === 0) return map;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 10) chunks.push(unique.slice(i, i + 10));

  const snaps = await Promise.all(
    chunks.map((chunk) =>
      db.collection('customers').where('contractNumber', 'in', chunk).get()
    )
  );
  snaps.forEach((snap) => {
    snap.docs.forEach((d) => {
      const cust = { id: d.id, ...d.data() } as any;
      if (cust.contractNumber) map[cust.contractNumber] = cust;
      if (Array.isArray(cust.contractNumbers)) {
        cust.contractNumbers.forEach((cn: string) => { map[cn] = cust; });
      }
    });
  });
  return map;
}

// Enriquece rooms con building (cache) + tenant. Acotado a la página.
// El tenant se resuelve por contractNumber (bauleras legacy del seed) O por customerId
// (ventas online/webhook, que NO tienen numero de contrato) — antes solo por contrato,
// y las ventas online quedaban sin datos de cliente en el inventario.
async function enrichRooms(rawRooms: any[], buildings: Record<string, any>) {
  const contractNums = rawRooms
    .filter((r: any) => r.contractNumber)
    .map((r: any) => r.contractNumber as string);
  const tenantMap = await tenantsByContract(contractNums);

  const idRooms = rawRooms.filter((r: any) => !r.contractNumber && r.customerId);
  const custById: Record<string, any> = {};
  if (idRooms.length) {
    const refs = idRooms.map((r: any) => db.collection('customers').doc(String(r.customerId)));
    const docs = await db.getAll(...refs);
    docs.forEach((d: any) => { if (d.exists) custById[d.id] = { id: d.id, ...d.data() }; });
  }

  return rawRooms.map((raw: any) => ({
    ...raw,
    building: buildings[raw.buildingId] || null,
    tenant: raw.contractNumber
      ? (tenantMap[raw.contractNumber] || { fullName: raw.currentTenant, contractNumber: raw.contractNumber })
      : (raw.customerId ? (custById[String(raw.customerId)] || { fullName: raw.currentTenant }) : null),
  }));
}

// GET /storage-room
// Pagina en Firestore (orderBy name) y enriquece solo la página. Acepta
// ?cursor=<id>. Con ?search= cae a escaneo acotado en memoria.
storageRoomsRouter.get('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 10;
    const cursor = req.query['cursor'] as string | undefined;
    const status = req.query['status'] as string | undefined;
    const branchId = req.query['branchId'] as string | undefined;
    const buildingId = req.query['buildingId'] as string | undefined;
    const search = (req.query['search'] as string | undefined)?.toLowerCase();

    const buildings = await getBuildingMap();

    // where() ANTES de orderBy para usar índice compuesto
    let baseQuery: FirebaseFirestore.Query = db.collection('storageRooms');
    if (status) baseQuery = baseQuery.where('status', '==', status);
    if (branchId) baseQuery = baseQuery.where('branchId', '==', branchId);
    if (buildingId) baseQuery = baseQuery.where('buildingId', '==', buildingId);

    // ── Path de búsqueda: escaneo acotado en memoria ──────────────────
    if (search) {
      const snap = await baseQuery.limit(SEARCH_SCAN_CAP).get();
      if (snap.size === SEARCH_SCAN_CAP) {
        console.warn(`[storageRooms] búsqueda alcanzó el tope de ${SEARCH_SCAN_CAP} docs`);
      }
      let rawRooms = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      rawRooms = rawRooms.filter((r: any) =>
        r.name?.toLowerCase().includes(search) ||
        r.space?.toLowerCase().includes(search) ||
        r.currentTenant?.toLowerCase().includes(search) ||
        String(r.areaM2 || '').includes(search)
      );
      const total = rawRooms.length;
      const start = (page - 1) * limit;
      const pageRooms = rawRooms.slice(start, start + limit);
      const data = await enrichRooms(pageRooms, buildings);
      res.json({ data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)), nextCursor: null });
      return;
    }

    // ── Path normal: paginación en Firestore ──────────────────────────
    baseQuery = baseQuery.orderBy('name', 'asc');
    const result = await paginate('storageRooms', baseQuery, { page, limit, cursor });
    const rawRooms = result.docs.map((d) => ({ id: d.id, ...d.data() } as any));
    const data = await enrichRooms(rawRooms, buildings);

    res.json({
      data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      nextCursor: result.nextCursor,
    });
  } catch (err) {
    console.error('GET /storage-room error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /storage-room/:id
storageRoomsRouter.get('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const [doc, buildings] = await Promise.all([
      db.collection('storageRooms').doc(req.params['id']).get(),
      getBuildingMap(),
    ]);
    if (!doc.exists) {
      res.status(404).json({ message: 'Storage room not found' });
      return;
    }
    const raw = { id: doc.id, ...doc.data() } as any;
    // Get tenant if occupied — por contrato (legacy) o por customerId (ventas online)
    let tenant: any = null;
    if (raw.contractNumber) {
      const custSnap = await db.collection('customers')
        .where('contractNumber', '==', raw.contractNumber).limit(1).get();
      if (!custSnap.empty) tenant = { id: custSnap.docs[0].id, ...custSnap.docs[0].data() };
    }
    if (!tenant && raw.customerId) {
      const custDoc = await db.collection('customers').doc(String(raw.customerId)).get();
      if (custDoc.exists) tenant = { id: custDoc.id, ...custDoc.data() };
    }
    // FALLBACKS (bug real 14/07, A3-012 de Débora — 2 bauleras, la 2ª sin datos/mail en la ficha →
    // el cobro de deuda se bloquea porque exige email): si el contrato/customer no aparecen o vienen
    // SIN email, completar desde (1) la reserva de la baulera y (2) el customer por código de baulera.
    // Nunca pisa datos que ya están: solo llena los huecos.
    if (!tenant || !tenant.email) {
      try {
        let r: any = null;
        if (raw.reservationId) {
          const rs = await db.collection('reservations').doc(String(raw.reservationId)).get();
          if (rs.exists) r = rs.data();
        }
        if (!r) {
          const rs = await db.collection('reservations')
            .where('storageRoomId', '==', doc.id).where('status', '==', 'active').limit(1).get();
          if (!rs.empty) r = rs.docs[0].data();
        }
        if (!r && raw.space) {
          const rs = await db.collection('reservations')
            .where('bauleraCodigo', '==', String(raw.space)).where('status', '==', 'active').limit(1).get();
          if (!rs.empty) r = rs.docs[0].data();
        }
        if (r) {
          tenant = {
            ...(tenant || {}),
            fullName: tenant?.fullName || r.customerName || raw.currentTenant || null,
            email: tenant?.email || r.customerEmail || null,
            phone: tenant?.phone || r.customerPhone || null,
            dni: tenant?.dni || r.customerDni || null,
            fuente: tenant ? (tenant.fuente || 'customer+reserva') : 'reserva',
          };
        }
        if ((!tenant || !tenant.email) && raw.space) {
          const cs = await db.collection('customers')
            .where('bauleraCodigo', '==', String(raw.space)).limit(1).get();
          if (!cs.empty) {
            const c = cs.docs[0].data() as any;
            tenant = {
              ...(tenant || {}),
              fullName: tenant?.fullName || c.fullName || raw.currentTenant || null,
              email: tenant?.email || c.email || null,
              phone: tenant?.phone || c.phone || null,
              dni: tenant?.dni || c.dni || null,
              fuente: 'customer-por-baulera',
            };
          }
        }
      } catch (e) { console.warn('[storage-room detail] fallback tenant falló (sigo con lo que hay):', e); }
    }
    const result = { ...raw, building: buildings[raw.buildingId] || null, tenant };
    res.json(result);
  } catch (err) {
    console.error('GET /storage-room/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /storage-room/:id/tenant — COMPLETAR/CORREGIR los datos del inquilino desde la ficha
// (caso real 15/07: A3-012 de Débora, legacy sin mail en NINGÚN registro → el staff los carga
// una vez acá y quedan guardados; sirve para todas las bauleras de las 54 originales con datos
// incompletos). Upsert sobre el customer real de la baulera (customerId → por contrato → nuevo).
storageRoomsRouter.post('/:id/tenant', verifyToken, async (req: Request, res: Response) => {
  try {
    const { nombre, email, telefono, dni } = (req.body || {}) as Record<string, string | undefined>;
    if (!nombre && !email && !telefono && !dni) { res.status(400).json({ error: 'Mandá al menos un dato para completar' }); return; }
    const doc = await db.collection('storageRooms').doc(req.params['id']).get();
    if (!doc.exists) { res.status(404).json({ error: 'Baulera no encontrada' }); return; }
    const room = doc.data() as Record<string, unknown>;
    const now = new Date().toISOString();
    // Cliente destino: el ya vinculado → el del contrato legacy → uno nuevo atado a la baulera.
    let custId = room['customerId'] ? String(room['customerId']) : '';
    if (!custId && room['contractNumber']) {
      const s = await db.collection('customers').where('contractNumber', '==', room['contractNumber']).limit(1).get();
      if (!s.empty) custId = s.docs[0].id;
    }
    if (!custId) custId = `cust-manual-${doc.id}`;
    const nom = String(nombre || '').trim();
    await db.collection('customers').doc(custId).set({
      ...(nom ? { fullName: nom, firstName: nom.split(' ')[0], lastName: nom.split(' ').slice(1).join(' ') } : {}),
      ...(email ? { email: String(email).trim().toLowerCase() } : {}),
      ...(telefono ? { phone: String(telefono).trim() } : {}),
      ...(dni ? { dni: String(dni).trim() } : {}),
      bauleraCodigo: room['space'] || null, storageRoomId: doc.id,
      branchId: room['branchId'] || 'nordelta', isActive: true, updatedAt: now,
    }, { merge: true });
    await doc.ref.set({ customerId: custId, ...(nom ? { currentTenant: nom } : {}), updatedAt: now }, { merge: true });
    await logAudit({
      actor: (req as unknown as { email?: string }).email || 'admin', via: 'admin',
      action: 'inquilino_datos_completados', entity: 'storageRoom', entityId: doc.id,
      detail: { baulera: room['space'] || null, customerId: custId, email: email || null, telefono: telefono || null, dni: dni || null, nombre: nom || null },
    });
    res.json({ ok: true, customerId: custId });
  } catch (err) {
    console.error('POST /storage-room/:id/tenant error:', err);
    res.status(500).json({ error: 'No se pudieron guardar los datos del inquilino' });
  }
});

// POST /storage-room
storageRoomsRouter.post('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, createdAt: now, updatedAt: now };
    const ref = await db.collection('storageRooms').add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) {
    console.error('POST /storage-room error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /storage-room/:id
storageRoomsRouter.put('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, updatedAt: now };
    await db.collection('storageRooms').doc(req.params['id']).set(data, { merge: true });
    const updated = await db.collection('storageRooms').doc(req.params['id']).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    console.error('PUT /storage-room/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /storage-room/:id
// PUT /storage-room/:id/assign-customer — asigna un cliente y marca la baulera ocupada.
// El admin la llama por PATCH; el middleware de index.ts la convierte a PUT.
// Al quedar 'occupied' deja de contar como disponible en el stock.
async function assignCustomer(req: Request, res: Response) {
  try {
    const roomId = req.params['id'];
    const customerId = req.body?.customerId;
    if (!customerId) { res.status(400).json({ message: 'customerId requerido' }); return; }
    const custDoc = await db.collection('customers').doc(customerId).get();
    if (!custDoc.exists) { res.status(404).json({ message: 'Cliente no encontrado' }); return; }
    const c = custDoc.data() as any;
    const tenant = c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim();
    const now = new Date().toISOString();
    await db.collection('storageRooms').doc(roomId).set({
      status: 'occupied',
      customerId,
      currentTenant: tenant,
      contractNumber: c.contractNumber ?? null,
      assignedAt: now,
      updatedAt: now,
    }, { merge: true });
    const updated = await db.collection('storageRooms').doc(roomId).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    console.error('assign-customer error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}
storageRoomsRouter.put('/:id/assign-customer', verifyToken, assignCustomer);
storageRoomsRouter.put('/:id/admin-assign-customer', verifyToken, assignCustomer);

storageRoomsRouter.delete('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    await db.collection('storageRooms').doc(req.params['id']).delete();
    res.json({ message: 'Storage room deleted' });
  } catch (err) {
    console.error('DELETE /storage-room/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
