import { db } from '../config/firebase';
import { Reservation } from '../models/reservation.model';

const HOLD_MINUTES = 20;

// Libera las bauleras "reserved" cuyo hold ya vencio (vuelven a 'available').
export async function releaseExpiredHolds(branchId?: string): Promise<number> {
  const nowIso = new Date().toISOString();
  let q: FirebaseFirestore.Query = db.collection('storageRooms').where('status', '==', 'reserved');
  if (branchId) q = q.where('branchId', '==', branchId);
  const snap = await q.get();
  const expired = snap.docs.filter((d) => {
    const h = (d.data() as Record<string, unknown>).heldUntil;
    return !h || String(h) <= nowIso;
  });
  let n = 0;
  for (let i = 0; i < expired.length; i += 400) {
    const b = db.batch();
    expired.slice(i, i + 400).forEach((d) => {
      b.update(d.ref, { status: 'available', heldUntil: null, heldByReservationId: null, updatedAt: nowIso });
      n++;
    });
    await b.commit();
  }
  return n;
}

// Disponibles por m2 (para ofrecer alternativas cuando no hay stock).
export async function availableCountByM2(branchId?: string): Promise<Record<string, number>> {
  let q: FirebaseFirestore.Query = db.collection('storageRooms').where('status', '==', 'available');
  if (branchId) q = q.where('branchId', '==', branchId);
  const snap = await q.get();
  const by: Record<string, number> = {};
  snap.docs.forEach((d) => {
    const m2 = parseFloat(String((d.data() as Record<string, unknown>).areaM2 || '0'));
    if (!m2) return;
    by[String(m2)] = (by[String(m2)] || 0) + 1;
  });
  return by;
}

export interface HoldResult {
  ok: boolean;
  roomId?: string;
  bauleraCodigo?: string | null;
  heldUntil?: string;
  reason?: string;                       // 'sin_stock' | 'error'
  alternativasByM2?: Record<string, number>;
}

// Bloquea (hold) una baulera por HOLD_MINUTES al generar el link de pago.
// Si targetRoomId esta libre y es de la medida, usa esa; si no, otra libre de la misma
// medida. Si no hay stock de esa medida, devuelve ok:false + alternativas.
export async function holdRoomForReservation(opts: {
  reservationId: string; branchId: string; m2: number; targetRoomId?: string; minutes?: number;
}): Promise<HoldResult> {
  await releaseExpiredHolds(opts.branchId).catch(() => {});
  const minutes = opts.minutes ?? HOLD_MINUTES;
  const heldUntil = new Date(Date.now() + minutes * 60_000).toISOString();
  const now = new Date().toISOString();
  const m2 = Number(opts.m2);

  try {
    const res = await db.runTransaction(async (tx): Promise<HoldResult> => {
      let pick: FirebaseFirestore.DocumentSnapshot | null = null;

      if (opts.targetRoomId) {
        const doc = await tx.get(db.collection('storageRooms').doc(opts.targetRoomId));
        if (doc.exists) {
          const r = doc.data() as Record<string, unknown>;
          if (r.status === 'available' && Number(r.areaM2) === m2) pick = doc;
        }
      }
      if (!pick) {
        const snap = await tx.get(db.collection('storageRooms').where('status', '==', 'available'));
        const cands = snap.docs.filter((d) => {
          const r = d.data() as Record<string, unknown>;
          return Number(r.areaM2) === m2
            && (r.priceOverride === undefined || r.priceOverride === null)
            && r.lockPrice !== true
            && (!opts.branchId || !r.branchId || r.branchId === opts.branchId);
        }).sort((a, b) => String((a.data() as Record<string, unknown>).space)
          .localeCompare(String((b.data() as Record<string, unknown>).space)));
        if (cands.length === 0) return { ok: false, reason: 'sin_stock' };
        pick = cands[0];
      }

      const r = (pick.data() || {}) as Record<string, unknown>;
      tx.update(pick.ref, {
        status: 'reserved', heldUntil, heldByReservationId: opts.reservationId, updatedAt: now,
      });
      return { ok: true, roomId: pick.id, bauleraCodigo: (r.space as string) || null, heldUntil };
    });

    if (!res.ok && res.reason === 'sin_stock') {
      res.alternativasByM2 = await availableCountByM2(opts.branchId).catch(() => ({}));
    }
    return res;
  } catch (err) {
    console.error('[hold] error:', err);
    return { ok: false, reason: 'error' };
  }
}

// Asigna la baulera al confirmarse el pago. Si la reserva tiene un hold propio
// (storageRoomId reservado por esta reserva), ocupa ESA; si no, toma la primera libre.
// Atomico. Salta bauleras con precio fijo / bloqueadas en el modo auto.
export async function assignRoomForReservation(reservation: Reservation, targetRoomId?: string): Promise<string | null> {
  const now = new Date().toISOString();
  const custId = `cust-online-${reservation.userUid}`;
  const orderId = `order-online-${reservation.id}`;
  const tenant = reservation.customerName || reservation.customerEmail || 'Cliente web';
  const m2 = Number(reservation.m2);

  try {
    const roomId = await db.runTransaction(async (tx) => {
      let pick: FirebaseFirestore.DocumentSnapshot;
      if (targetRoomId) {
        const doc = await tx.get(db.collection('storageRooms').doc(targetRoomId));
        if (!doc.exists) return null;
        const r = (doc.data() || {}) as Record<string, unknown>;
        const heldByThis = r.status === 'reserved' && r.heldByReservationId === reservation.id;
        if (r.status !== 'available' && !heldByThis) return null;   // ocupada por otro
        if (Number(r.areaM2) !== m2) return null;                  // medida distinta
        pick = doc;
      } else {
        const q = db.collection('storageRooms').where('status', '==', 'available');
        const snap = await tx.get(q);
        const candidates = snap.docs.filter((d) => {
          const r = d.data() as Record<string, unknown>;
          return Number(r.areaM2) === m2
            && (r.priceOverride === undefined || r.priceOverride === null)
            && r.lockPrice !== true
            && (!reservation.sucursalId || !r.branchId || r.branchId === reservation.sucursalId);
        }).sort((a, b) =>
          String((a.data() as Record<string, unknown>).space).localeCompare(
            String((b.data() as Record<string, unknown>).space)));
        if (candidates.length === 0) return null;
        pick = candidates[0];
      }
      const room = (pick.data() || {}) as Record<string, unknown>;

      // 1) ocupar la baulera (y limpiar el hold). contractNumber va a NULL: si la baulera es
      // legacy (seed) conserva el contrato del inquilino ANTERIOR, y la ficha del inventario
      // prioriza contractNumber sobre customerId → mostraba al viejo (caso real: A0-002 se
      // revendió a Hernan y la ficha seguía mostrando a Blum, 14/07). Sin contrato, la ficha
      // resuelve por customerId = el ocupante real.
      tx.update(pick.ref, {
        status: 'occupied',
        customerId: custId,
        currentTenant: tenant,
        contractNumber: null,
        assignedAt: now,
        reservationId: reservation.id,
        heldUntil: null,
        heldByReservationId: null,
        updatedAt: now,
      });

      // 2) upsert cliente
      const parts = String(tenant).split(' ');
      tx.set(db.collection('customers').doc(custId), {
        firstName: parts[0] || tenant,
        lastName: parts.slice(1).join(' '),
        fullName: tenant,
        dni: reservation.customerDni || '',
        phone: reservation.customerPhone || '',
        email: reservation.customerEmail || '',
        branchId: reservation.sucursalId || 'nordelta',
        isActive: true,
        isApproved: true,
        bauleraCodigo: room.space || null,
        storageRoomId: pick.id,
        m2,
        monthlyPrice: reservation.monthly,
        source: 'mp_webhook',
        userUid: reservation.userUid,
        updatedAt: now,
        createdAt: now,
      }, { merge: true });

      // 3) crear orden de venta (contrato implicito)
      tx.set(db.collection('reservationOrders').doc(orderId), {
        contractNumber: orderId,
        customerId: custId,
        customerName: tenant,
        storageRoomId: pick.id,
        bauleraCodigo: room.space || null,
        branchId: reservation.sucursalId || 'nordelta',
        buildingId: room.buildingId || 'edificio-a',
        entryDate: reservation.startDate || null,
        m2,
        monthlyPrice: reservation.monthly,
        totalAmount: String(reservation.monthly),
        status: 'CONFIRMED',
        source: 'mp_webhook',
        reservationId: reservation.id,
        mpPreapprovalId: reservation.mpPreapprovalId || null,
        updatedAt: now,
        createdAt: now,
      }, { merge: true });

      // 4) vincular la reserva a la baulera
      tx.update(db.collection('reservations').doc(reservation.id), {
        storageRoomId: pick.id,
      });

      return pick.id;
    });

    return roomId;
  } catch (err) {
    console.error('[assign] error asignando baulera:', err);
    return null;
  }
}
