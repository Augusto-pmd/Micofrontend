import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { cancelSubscription, searchSubscriptions } from '../services/mercadopago.service';
import { logAudit } from '../services/audit.service';

// REGLA (acordada con Lucas 13/07): la venta de PRIMERA VEZ tiene 20 min de hold. Si no paga,
// la solicitud NO queda "pending": pasa a CANCELADA (visible como solicitud cancelada) y la
// suscripción pendiente se CANCELA en MP (no se acumulan pendings basura).
// EXCEPCIÓN: los RECOBROS (rebillAt) no vencen — el cliente puede tardar días en pagar el link
// y ese estado se gestiona con el titileo violeta, no con esta limpieza.
const GRACIA_MS = 10 * 60_000; // 10 min de gracia sobre el hold (no pisar un checkout en curso)
const PENDING_MP_VIEJA_MS = 24 * 3600_000; // subs 'pending' en MP con +24h = checkout abandonado

export async function limpiarPendientesVencidos(): Promise<{ reservasCanceladas: number; subsCanceladas: number; detalles: string[] }> {
  const now = Date.now();
  const detalles: string[] = [];
  let reservasCanceladas = 0;

  // 1) Reservas pending_payment con hold vencido (y que NO sean recobros) → canceladas.
  const pendSnap = await db.collection('reservations').where('status', '==', 'pending_payment').get();
  const vivosPreapproval = new Set<string>(); // subs que NO hay que barrer en MP (siguen vivas)
  for (const d of pendSnap.docs) {
    const r = d.data() as Record<string, unknown>;
    if (r['mpPreapprovalId']) vivosPreapproval.add(String(r['mpPreapprovalId']));
    if (r['rebillAt']) continue; // recobro: no vence
    const held = r['heldUntil'] ? Date.parse(String(r['heldUntil'])) : NaN;
    if (!Number.isFinite(held) || now < held + GRACIA_MS) continue;

    // Matar la sub pendiente en MP (si la tenía) para que el link muera y no quede pending.
    if (r['mpPreapprovalId']) { try { await cancelSubscription(String(r['mpPreapprovalId'])); } catch { /* ya muerta/no existe */ } }
    await d.ref.update({
      status: 'cancelled',
      mpSubscriptionStatus: 'cancelled',
      cancelledAt: Timestamp.now(),
      cancelledBy: 'sistema (20 min sin pagar)',
      bajaGestionada: true, // no es una baja a gestionar: nunca llegó a ser cliente
    });
    // Liberar el hold de la baulera si sigue apuntando a esta solicitud (y no está ocupada).
    if (r['storageRoomId']) {
      try {
        const roomRef = db.collection('storageRooms').doc(String(r['storageRoomId']));
        const rs = await roomRef.get();
        const room = rs.exists ? (rs.data() as Record<string, unknown>) : null;
        if (room && room['status'] !== 'occupied' && (room['heldByReservationId'] === d.id || room['reservationId'] === d.id)) {
          await roomRef.set({ status: 'available', heldUntil: null, heldByReservationId: null, reservationId: null, updatedAt: new Date().toISOString() }, { merge: true });
        }
      } catch { /* la baulera queda como esté; el hold vence solo igual */ }
    }
    reservasCanceladas++;
    detalles.push(`reserva ${d.id} (${String(r['customerName'] || r['customerEmail'] || '?')}) cancelada por hold vencido`);
  }

  // Las subs de reservas ACTIVAS tampoco se tocan.
  try {
    const actSnap = await db.collection('reservations').where('status', '==', 'active').get();
    actSnap.docs.forEach((d) => { const p = (d.data() as Record<string, unknown>)['mpPreapprovalId']; if (p) vivosPreapproval.add(String(p)); });
  } catch { /* si falla, el filtro por referencia protege menos: no barrer nada en MP */ return { reservasCanceladas, subsCanceladas: 0, detalles }; }

  // 2) Barrer en MP las subs 'pending' VIEJAS (checkouts abandonados: nunca autorizaron) que no
  // están referenciadas por ninguna reserva viva. pending = nunca cobró ni va a cobrar sola.
  let subsCanceladas = 0;
  try {
    const pendings = await searchSubscriptions('pending');
    for (const s of pendings) {
      if (vivosPreapproval.has(s.id)) continue;
      const created = s.dateCreated ? Date.parse(s.dateCreated) : NaN;
      if (!Number.isFinite(created) || now - created < PENDING_MP_VIEJA_MS) continue;
      try { await cancelSubscription(s.id); subsCanceladas++; detalles.push(`sub pending ${s.id.slice(0, 10)}… ($${s.amount}) cancelada en MP`); }
      catch { /* seguirá en la próxima pasada */ }
    }
  } catch { /* MP no disponible: reintenta en la próxima corrida */ }

  if (reservasCanceladas || subsCanceladas) {
    await logAudit({
      actor: 'sistema', via: 'cron', action: 'limpieza_pendientes', entity: 'reservation', entityId: 'batch',
      detail: { reservasCanceladas, subsCanceladas },
    });
  }
  return { reservasCanceladas, subsCanceladas, detalles };
}
