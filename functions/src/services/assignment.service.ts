import { db } from '../config/firebase';
import { Reservation } from '../models/reservation.model';

// Asigna la primera baulera libre de la medida de la reserva, la marca ocupada,
// crea/actualiza el cliente y la orden de venta, y devuelve el roomId.
// Atomico (transaccion) para no asignar la misma baulera a dos pagos simultaneos.
// Salta bauleras con precio fijo (priceOverride) o bloqueadas (lockPrice) para que
// el precio cotizado al cliente coincida con el del grupo.
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
        // Reasignacion manual a una baulera puntual elegida desde el admin
        const doc = await tx.get(db.collection('storageRooms').doc(targetRoomId));
        if (!doc.exists) return null;
        const r = (doc.data() || {}) as Record<string, unknown>;
        if (r.status !== 'available') return null;       // ya ocupada
        if (Number(r.areaM2) !== m2) return null;        // medida distinta
        pick = doc;
      } else {
        // Auto: primera libre de la medida (saltea precio propio / bloqueadas)
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

      // 1) ocupar la baulera
      tx.update(pick.ref, {
        status: 'occupied',
        customerId: custId,
        currentTenant: tenant,
        assignedAt: now,
        reservationId: reservation.id,
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

      // 3) crear orden de venta
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
