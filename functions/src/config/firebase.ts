import * as admin from 'firebase-admin';

// Singleton initialization — works in both emulator and production
if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = admin.firestore();
export const auth = admin.auth();
export const storage = admin.storage();
