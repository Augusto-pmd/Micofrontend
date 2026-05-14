import { db } from '../config/firebase';

export type ClientType = 'persona' | 'empresa';
export type UserRole = 'client' | 'admin';
export type FaceEnrollStatus = 'not_started' | 'queued' | 'enrolled' | 'failed' | 'revoked';

export interface User {
  uid: string;
  email: string;
  name: string;
  phone: string;
  clientType: ClientType;
  dni?: string;
  razonSocial?: string;
  cuit?: string;
  role: UserRole;
  createdAt: FirebaseFirestore.Timestamp;
  biometricConsent: boolean;
  biometricConsentAt?: FirebaseFirestore.Timestamp;
  hikUserId?: string;
  faceEnrolled: boolean;
  faceEnrolledAt?: FirebaseFirestore.Timestamp;
}

export const usersCol = () => db.collection('users');

export async function getUser(uid: string): Promise<User | null> {
  const snap = await usersCol().doc(uid).get();
  return snap.exists ? (snap.data() as User) : null;
}

export async function createUser(uid: string, data: Omit<User, 'uid' | 'createdAt'>): Promise<User> {
  const user: User = {
    ...data,
    uid,
    createdAt: FirebaseFirestore.Timestamp.now(),
  };
  await usersCol().doc(uid).set(user);
  return user;
}

export async function updateUser(uid: string, patch: Partial<User>): Promise<void> {
  await usersCol().doc(uid).update(patch);
}
