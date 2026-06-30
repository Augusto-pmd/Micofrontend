import * as admin from 'firebase-admin';

// Singleton initialization — works in both emulator and production
if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = admin.firestore();
// Ignorar campos undefined al escribir (evita errores 500 cuando un campo opcional
// no viene, ej. una venta manual sin baulera puntual). Debe ir antes de cualquier uso.
db.settings({ ignoreUndefinedProperties: true });

export const auth = admin.auth();
export const storage = admin.storage();
