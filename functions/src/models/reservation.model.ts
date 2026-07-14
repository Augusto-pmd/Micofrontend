import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { Timestamp } from 'firebase-admin/firestore';

export type ReservationStatus = 'pending_payment' | 'active' | 'cancelled' | 'payment_failed';
export type FaceEnrollStatus = 'not_started' | 'queued' | 'enrolled' | 'failed' | 'revoked';
export type MpSubscriptionStatus = 'pending' | 'authorized' | 'paused' | 'cancelled';

export interface Reservation {
  id: string;
  userUid: string;
  sucursalId: string;
  category: string;
  m2: number;
  monthly: number;
  firstMonth: number;
  startDate: string;        // 'YYYY-MM-DD'
  duration: number;         // estimated months
  addons: string[];
  promosApplied: string[];
  status: ReservationStatus;
  mpPreapprovalId?: string;
  mpInitPoint?: string;        // URL de checkout MP para retomar el pago
  mpSubscriptionStatus: MpSubscriptionStatus;
  faceEnrollStatus: FaceEnrollStatus;
  faceEnrollAttempts: number;
  cancelledAt?: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
  // Guest / customer contact info (populated when user is not logged in)
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerDni?: string;
  // Versiones NORMALIZADas (solo dígitos / minúsculas) para el macheo reforzado de cliente
  // (unir sus bauleras aunque el mail venga distinto). Ver services/customerMatch.service.ts.
  customerEmailNorm?: string | null;
  customerDniNorm?: string | null;
  customerPhoneNorm?: string | null;
  customerMpPayerId?: string;   // id de la cuenta MP del pagador (señal extra de macheo del webhook)
  storageRoomId?: string;   // baulera puntual asignada al pagar
  heldUntil?: string;       // hold de 20 min al generar el link
  bauleraCodigo?: string;
  source?: string;
  cancelledBy?: string;
  endDate?: string;
  // Rutas de pago SEPARADAS (Fase 1): 'subscription' (default) | 'onetime' | 'plan'
  paymentMode?: string;
  paidMonths?: number;      // pago unico: meses pagados de una (vence en endDate)
  mpPreferenceId?: string;  // pago unico: id de la preferencia Checkout Pro
  mpPlanId?: string;        // plan (mes gratis): preapproval_plan_id
  // REENVÍO de link de cobro tras pago rechazado (rebill): la sub vieja se cancela en MP y
  // mpPreapprovalId pasa a apuntar a la nueva. Estos campos dejan la traza del reenvío.
  rebillAt?: string;                 // cuándo se reenvió (ISO)
  rebillBy?: string;                 // staff que lo disparó
  rebillPrevPreapprovalId?: string;  // la sub rechazada que se canceló
  // Promos / descuento (se escribían con 'as any' — declarados para type-safety):
  promoMonths?: number;
  promoQty?: number;
  promoUnit?: 'days' | 'months';
  discountPct?: number;
  // GAP del mes gratis (modelo 14/07): 2° link = pago único del PROPORCIONAL DE ENTRADA (los días
  // del mes actual, hoy → 1° próximo). Pre-carga el botón Proporcional de Inventario si se difiere.
  gapPreferenceId?: string | null;
  gapAmount?: number;
  gapInitPoint?: string | null;
  gapDays?: number;
  gapDesde?: string | null;  // 'YYYY-MM-DD' — inicio del período que cubre el proporcional
  gapHasta?: string | null;  // 'YYYY-MM-DD' — el 1° próximo
  trialDays?: number;        // días totales del cupón/trial en MP (proporcional + período gratis)
  gapPaidAt?: string;       // gap del mes gratis cobrado (idempotencia del webhook GAP): ISO
}

export const reservationsCol = () => db.collection('reservations');

export async function getReservation(id: string): Promise<Reservation | null> {
  const snap = await reservationsCol().doc(id).get();
  return snap.exists ? (snap.data() as Reservation) : null;
}

export async function createReservation(data: Omit<Reservation, 'createdAt'>): Promise<Reservation> {
  const reservation: Reservation = {
    ...data,
    createdAt: Timestamp.now(),
  };
  await reservationsCol().doc(data.id).set(reservation);
  return reservation;
}

export async function updateReservation(id: string, patch: Partial<Reservation>): Promise<void> {
  await reservationsCol().doc(id).update(patch);
}

export async function getUserReservations(userUid: string): Promise<Reservation[]> {
  const snap = await reservationsCol()
    .where('userUid', '==', userUid)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => d.data() as Reservation);
}

export async function getReservationByMpPreapprovalId(mpPreapprovalId: string): Promise<Reservation | null> {
  const snap = await reservationsCol()
    .where('mpPreapprovalId', '==', mpPreapprovalId)
    .limit(1)
    .get();
  return snap.empty ? null : (snap.docs[0].data() as Reservation);
}

// Ubica la reserva por el CODIGO de baulera (para el webhook de cobros: el external_reference del
// pago trae "MiContainer Baulera A2-010" -> A2-010, y asi se resuelve la reserva sin el preapprovalId).
export async function getReservationByBauleraCodigo(bauleraCodigo: string): Promise<Reservation | null> {
  const snap = await reservationsCol()
    .where('bauleraCodigo', '==', bauleraCodigo)
    .limit(1)
    .get();
  return snap.empty ? null : (snap.docs[0].data() as Reservation);
}
