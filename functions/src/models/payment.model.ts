import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebase';

export type PaymentStatus = 'approved' | 'pending' | 'rejected' | 'cancelled' | 'refunded';
export type PaymentType = 'initial' | 'recurring_payment' | 'refund';

export interface Payment {
  id: string;
  reservationId: string;
  userUid: string;
  mpPreapprovalId: string;
  mpPaymentId: string;
  type: PaymentType;
  amount: number;
  currency: string;
  status: PaymentStatus;
  period: string;           // 'YYYY-MM'
  receivedAt: admin.firestore.Timestamp;
}

export const paymentsCol = () => db.collection('payments');

export async function createPayment(data: Omit<Payment, 'receivedAt'>): Promise<Payment> {
  const payment: Payment = {
    ...data,
    receivedAt: Timestamp.now(),
  };
  await paymentsCol().doc(data.id).set(payment);
  return payment;
}
