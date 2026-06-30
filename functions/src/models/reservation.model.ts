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
  storageRoomId?: string;   // baulera puntual asignada al pagar
  heldUntil?: string;       // hold de 20 min al generar el link
  bauleraCodigo?: string;
  source?: string;
  cancelledBy?: string;
  endDate?: string;
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
