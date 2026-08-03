import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { cancelSubscription } from '../services/mercadopago.service';
import { logAudit } from '../services/audit.service';

// REGLA (Lucas 13/07): la venta de PRIMERA VEZ (checkout directo con hold de 20 min) que no se
// paga NO debe quedar 'pending' para siempre → la solicitud pasa a CANCELADA (visible como tal)
// y SU suscripción pendiente en MP se cancela (el link muere).
//
// NO SE TOCA (clave — "no es lo mismo venta nueva que cobro de suscripción"):
//  - Suscripciones de clientes YA activos: esas reservas son 'active', NUNCA 'pending_payment'.
//    Un cobro mensual pendiente/rechazado de un suscripto vive en su sub 'authorized' → jamás
//    entra acá. MP sigue reintentándolo (recycling) y lo mostramos con el titileo naranja.
//  - RECOBROS (rebillAt): el link puede tardar días; se gestiona con el titileo VIOLETA.
//  - Ventas por PLAN / mes gratis: el cliente paga el link cuando puede (asíncrono), no vence.
//
// Ya NO se hace ningún barrido "a ciegas" de suscripciones 'pending' en MP (podía matar una
// legítima). Las subs viejas/sueltas se dan de baja A MANO desde Tarifas → Planes de MP, con
// verificación humana de cada una.
const GRACIA_MS = 10 * 60_000; // 10 min de gracia sobre el hold de 20 (no pisar un checkout en curso)

export async function limpiarPendientesVencidos(): Promise<{ reservasCanceladas: number; detalles: string[] }> {
  const now = Date.now();
  const detalles: string[] = [];
  let reservasCanceladas = 0;

  const pendSnap = await db.collection('reservations').where('status', '==', 'pending_payment').get();
  for (const d of pendSnap.docs) {
    const r = d.data() as Record<string, unknown>;
    if (r['rebillAt']) continue;               // recobro: NO vence (titileo violeta)
    if (r['paymentMode'] === 'plan') continue; // mes gratis: link asíncrono, no vence
    const held = r['heldUntil'] ? Date.parse(String(r['heldUntil'])) : NaN;
    if (!Number.isFinite(held) || now < held + GRACIA_MS) continue; // hold aún vigente

    // Cancelar SOLO la sub pendiente de ESTA venta (nunca autorizada → nunca cobró ni va a cobrar).
    if (r['mpPreapprovalId']) { try { await cancelSubscription(String(r['mpPreapprovalId'])); } catch { /* ya muerta/no existe */ } }
    await d.ref.update({
      status: 'cancelled',
      mpSubscriptionStatus: 'cancelled',
      cancelledAt: Timestamp.now(),
      cancelledBy: 'sistema (20 min sin pagar)',
      bajaGestionada: true, // nunca llegó a ser cliente: no es una baja a gestionar
    });
    // Liberar el hold de la baulera si sigue apuntando a esta solicitud y no está ocupada.
    if (r['storageRoomId']) {
      try {
        const roomRef = db.collection('storageRooms').doc(String(r['storageRoomId']));
        const rs = await roomRef.get();
        const room = rs.exists ? (rs.data() as Record<string, unknown>) : null;
        if (room && room['status'] !== 'occupied' && (room['heldByReservationId'] === d.id || room['reservationId'] === d.id)) {
          await roomRef.set({ status: 'available', heldUntil: null, heldByReservationId: null, holdIndefinido: null, reservationId: null, updatedAt: new Date().toISOString() }, { merge: true });
        }
      } catch { /* la baulera queda como esté; el hold vence solo igual */ }
    }
    reservasCanceladas++;
    detalles.push(`reserva ${d.id} (${String(r['customerName'] || r['customerEmail'] || '?')}) cancelada por hold vencido`);
  }

  if (reservasCanceladas) {
    await logAudit({
      actor: 'sistema', via: 'cron', action: 'limpieza_pendientes', entity: 'reservation', entityId: 'batch',
      detail: { reservasCanceladas },
    });
  }
  return { reservasCanceladas, detalles };
}
