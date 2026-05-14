# Mi Container Backend — Plan 1: Core API + Auth + Mercado Pago

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el backend Firebase que permite a un cliente reservar, pagar con Mercado Pago Suscripciones, y ver su reserva en el portal — reemplazando el mock de localStorage del frontend.

**Architecture:** Cloud Functions (Node.js 20 + TypeScript) exponen una API REST consumida por el frontend existente (GitHub Pages). Firestore almacena users/reservations/payments. Firebase Auth maneja login. MP Suscripciones gestiona el cobro recurrente via webhooks.

**Tech Stack:** Firebase (Auth, Firestore, Functions v2, Storage, Secret Manager), TypeScript 5, Express, Mercado Pago SDK v2, Jest para tests.

---

## Estructura de archivos

```
functions/                          ← proyecto Firebase Functions
  src/
    index.ts                        ← exports de todas las Functions
    config/
      firebase.ts                   ← init Admin SDK (singleton)
      secrets.ts                    ← helper para Secret Manager
    middleware/
      requireAuth.ts                ← verifica JWT Firebase, adjunta uid al request
      requireAdmin.ts               ← verifica Custom Claim role:admin
    routes/
      reservations.ts               ← POST /reservations, GET /reservations, GET /reservations/:id, POST /reservations/:id/cancel
      webhooks/
        mercadopago.ts              ← POST /webhooks/mp
    services/
      mercadopago.service.ts        ← wrapper de la MP API
    models/
      user.model.ts                 ← tipo User + helpers Firestore
      reservation.model.ts          ← tipo Reservation + helpers Firestore
      payment.model.ts              ← tipo Payment + helpers Firestore
    utils/
      generateId.ts                 ← genera MC-XXXX-XXXX
      hmac.ts                       ← verifica firma HMAC de webhooks MP
  tests/
    utils/
      generateId.test.ts
      hmac.test.ts
    services/
      mercadopago.service.test.ts
    routes/
      reservations.test.ts
      webhooks.mercadopago.test.ts
  package.json
  tsconfig.json
  jest.config.ts
firestore.rules                     ← en raíz del repo
firestore.indexes.json
firebase.json
.firebaserc
```

---

## Task 1: Scaffold del proyecto Firebase Functions

**Files:**
- Create: `functions/package.json`
- Create: `functions/tsconfig.json`
- Create: `functions/jest.config.ts`
- Create: `firebase.json`
- Create: `.firebaserc`
- Create: `functions/src/index.ts`

- [ ] **Step 1.1: Instalar Firebase CLI globalmente si no está**

```bash
npm list -g firebase-tools || npm install -g firebase-tools
firebase --version
```
Esperado: versión 13.x o superior.

- [ ] **Step 1.2: Login a Firebase**

```bash
firebase login
```
Seguir el flujo del browser. Al terminar debe mostrar el email de la cuenta de Google.

- [ ] **Step 1.3: Crear el proyecto Firebase en la consola**

Ir a https://console.firebase.google.com → "Crear proyecto" → nombre: `micontainer-prod` → deshabilitar Google Analytics (no lo necesitamos) → Crear.

Anotar el Project ID (formato: `micontainer-prod` o `micontainer-prod-xxxxx`).

- [ ] **Step 1.4: Asociar el repo con el proyecto**

```bash
# Desde la raíz del repo (C:\Users\augus\micofrontend-v3 o el worktree)
firebase use --add
```
Elegir el proyecto recién creado. Alias: `default`.

Esto crea `.firebaserc`:
```json
{
  "projects": {
    "default": "micontainer-prod"
  }
}
```

- [ ] **Step 1.5: Crear `firebase.json`**

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"]
    }
  ],
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

- [ ] **Step 1.6: Crear `functions/package.json`**

```json
{
  "name": "micontainer-functions",
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "serve": "npm run build && firebase emulators:start --only functions,firestore,auth",
    "test": "jest --forceExit",
    "test:watch": "jest --watchAll",
    "deploy": "firebase deploy --only functions"
  },
  "engines": { "node": "20" },
  "main": "lib/index.js",
  "dependencies": {
    "firebase-admin": "^12.3.0",
    "firebase-functions": "^6.0.0",
    "express": "^4.19.2",
    "mercadopago": "^2.0.15",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.14.0",
    "typescript": "^5.4.5",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.5",
    "@types/jest": "^29.5.12",
    "firebase-functions-test": "^3.3.0",
    "ts-node": "^10.9.2"
  }
}
```

- [ ] **Step 1.7: Crear `functions/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "outDir": "lib",
    "sourceMap": true,
    "strict": true,
    "target": "es2017",
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true
  },
  "compileOnSave": true,
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 1.8: Crear `functions/jest.config.ts`**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^../config/firebase$': '<rootDir>/tests/__mocks__/firebase.ts',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
};

export default config;
```

- [ ] **Step 1.9: Crear mock de Firebase para tests**

```bash
mkdir -p functions/tests/__mocks__
```

Crear `functions/tests/__mocks__/firebase.ts`:
```typescript
export const db = {
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
};

export const auth = {
  verifyIdToken: jest.fn(),
};
```

- [ ] **Step 1.10: Crear `functions/src/index.ts` vacío**

```typescript
import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

export const api = onRequest(
  { region: 'us-central1', memory: '256MiB' },
  app
);
```

- [ ] **Step 1.11: Instalar dependencias**

```bash
cd functions && npm install
```

- [ ] **Step 1.12: Verificar que compila**

```bash
npm run build
```
Esperado: carpeta `functions/lib/` generada sin errores.

- [ ] **Step 1.13: Commit**

```bash
cd ..  # volver a raíz del repo
git add firebase.json .firebaserc functions/
git commit -m "feat: scaffold Firebase Functions project (Node 20 + TypeScript)"
```

---

## Task 2: Firebase Admin init + Secret Manager helper

**Files:**
- Create: `functions/src/config/firebase.ts`
- Create: `functions/src/config/secrets.ts`

- [ ] **Step 2.1: Activar Firestore en la consola**

Ir a https://console.firebase.google.com → proyecto `micontainer-prod` → Firestore Database → Crear base de datos → Modo producción → Region: `us-central1`.

- [ ] **Step 2.2: Activar Firebase Auth**

Firebase Console → Authentication → Comenzar → Habilitar proveedores:
1. Google (proveedor de inicio de sesión)
2. Correo electrónico/contraseña → solo habilitar "Email link (passwordless sign-in)"

- [ ] **Step 2.3: Activar Blaze plan**

Firebase Console → Configuración del proyecto → Uso y facturación → Modificar plan → Blaze. Necesario para llamadas externas desde Functions.

- [ ] **Step 2.4: Crear `functions/src/config/firebase.ts`**

```typescript
import * as admin from 'firebase-admin';

// Inicialización singleton — funciona tanto en emuladores como en producción
if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = admin.firestore();
export const auth = admin.auth();
export const storage = admin.storage();
```

- [ ] **Step 2.5: Crear `functions/src/config/secrets.ts`**

```typescript
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();

/**
 * Lee un secret de Google Secret Manager.
 * En desarrollo local, usa variables de entorno como fallback.
 * Ejemplo: getSecret('hik-nordelta-pass') o 'HIK_NORDELTA_PASS' como env var.
 */
export async function getSecret(secretId: string): Promise<string> {
  // Fallback para desarrollo local con emuladores
  const envKey = secretId.toUpperCase().replace(/-/g, '_');
  if (process.env[envKey]) {
    return process.env[envKey]!;
  }

  const projectId = process.env.GCLOUD_PROJECT;
  const name = `projects/${projectId}/secrets/${secretId}/versions/latest`;

  const [version] = await client.accessSecretVersion({ name });
  const payload = version.payload?.data;

  if (!payload) {
    throw new Error(`Secret ${secretId} not found or empty`);
  }

  return Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload);
}
```

- [ ] **Step 2.6: Instalar Secret Manager SDK**

```bash
cd functions && npm install @google-cloud/secret-manager
```

- [ ] **Step 2.7: Commit**

```bash
git add functions/src/config/
git commit -m "feat: Firebase Admin init + Secret Manager helper"
```

---

## Task 3: Modelos de datos (tipos TypeScript + helpers Firestore)

**Files:**
- Create: `functions/src/models/user.model.ts`
- Create: `functions/src/models/reservation.model.ts`
- Create: `functions/src/models/payment.model.ts`

- [ ] **Step 3.1: Crear `functions/src/models/user.model.ts`**

```typescript
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
```

- [ ] **Step 3.2: Crear `functions/src/models/reservation.model.ts`**

```typescript
import { db } from '../config/firebase';

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
  duration: number;         // meses estimados
  addons: string[];
  promosApplied: string[];
  status: ReservationStatus;
  mpPreapprovalId?: string;
  mpSubscriptionStatus: MpSubscriptionStatus;
  faceEnrollStatus: FaceEnrollStatus;
  faceEnrollAttempts: number;
  cancelledAt?: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
}

export const reservationsCol = () => db.collection('reservations');

export async function getReservation(id: string): Promise<Reservation | null> {
  const snap = await reservationsCol().doc(id).get();
  return snap.exists ? (snap.data() as Reservation) : null;
}

export async function createReservation(data: Omit<Reservation, 'createdAt'>): Promise<Reservation> {
  const reservation: Reservation = {
    ...data,
    createdAt: FirebaseFirestore.Timestamp.now(),
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
```

- [ ] **Step 3.3: Crear `functions/src/models/payment.model.ts`**

```typescript
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
  receivedAt: FirebaseFirestore.Timestamp;
}

export const paymentsCol = () => db.collection('payments');

export async function createPayment(data: Omit<Payment, 'receivedAt'>): Promise<Payment> {
  const payment: Payment = {
    ...data,
    receivedAt: FirebaseFirestore.Timestamp.now(),
  };
  await paymentsCol().doc(data.id).set(payment);
  return payment;
}
```

- [ ] **Step 3.4: Commit**

```bash
git add functions/src/models/
git commit -m "feat: Firestore data models (User, Reservation, Payment)"
```

---

## Task 4: Utilidades — generador de ID y verificación HMAC

**Files:**
- Create: `functions/src/utils/generateId.ts`
- Create: `functions/src/utils/hmac.ts`
- Create: `functions/tests/utils/generateId.test.ts`
- Create: `functions/tests/utils/hmac.test.ts`

- [ ] **Step 4.1: Escribir el test de generateId primero (TDD)**

Crear `functions/tests/utils/generateId.test.ts`:
```typescript
import { generateReservationId } from '../../src/utils/generateId';

describe('generateReservationId', () => {
  it('should have the format MC-XXXX-XXXX', () => {
    const id = generateReservationId();
    expect(id).toMatch(/^MC-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('should generate unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateReservationId()));
    expect(ids.size).toBe(100);
  });
});
```

- [ ] **Step 4.2: Ejecutar test (debe fallar)**

```bash
cd functions && npm test -- tests/utils/generateId.test.ts
```
Esperado: `FAIL` — `Cannot find module '../../src/utils/generateId'`

- [ ] **Step 4.3: Implementar `functions/src/utils/generateId.ts`**

```typescript
/** Genera un ID de reserva con formato MC-XXXX-XXXX (letras mayúsculas y dígitos) */
export function generateReservationId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const part = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `MC-${part()}-${part()}`;
}
```

- [ ] **Step 4.4: Ejecutar test (debe pasar)**

```bash
npm test -- tests/utils/generateId.test.ts
```
Esperado: `PASS`

- [ ] **Step 4.5: Escribir test de hmac**

Crear `functions/tests/utils/hmac.test.ts`:
```typescript
import { verifyMpWebhookSignature } from '../../src/utils/hmac';

describe('verifyMpWebhookSignature', () => {
  const secret = 'test-secret-key';

  it('should return true for a valid signature', () => {
    const body = '{"id":"12345","type":"payment"}';
    const { createHmac } = require('crypto');
    const validSig = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyMpWebhookSignature(body, validSig, secret)).toBe(true);
  });

  it('should return false for an invalid signature', () => {
    const body = '{"id":"12345","type":"payment"}';
    expect(verifyMpWebhookSignature(body, 'invalid-signature', secret)).toBe(false);
  });

  it('should return false for empty signature', () => {
    expect(verifyMpWebhookSignature('{}', '', secret)).toBe(false);
  });
});
```

- [ ] **Step 4.6: Ejecutar test (debe fallar)**

```bash
npm test -- tests/utils/hmac.test.ts
```
Esperado: `FAIL` — `Cannot find module '../../src/utils/hmac'`

- [ ] **Step 4.7: Implementar `functions/src/utils/hmac.ts`**

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifica la firma HMAC-SHA256 de un webhook de Mercado Pago.
 * Usa timingSafeEqual para evitar timing attacks.
 */
export function verifyMpWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!signature) return false;

  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const signatureBuf = Buffer.from(signature, 'hex');

    if (expectedBuf.length !== signatureBuf.length) return false;

    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4.8: Ejecutar todos los tests**

```bash
npm test
```
Esperado: `PASS` en ambos archivos.

- [ ] **Step 4.9: Commit**

```bash
git add functions/src/utils/ functions/tests/utils/
git commit -m "feat: generateId + HMAC verification utils (TDD)"
```

---

## Task 5: Middleware de autenticación

**Files:**
- Create: `functions/src/middleware/requireAuth.ts`
- Create: `functions/src/middleware/requireAdmin.ts`

- [ ] **Step 5.1: Crear `functions/src/middleware/requireAuth.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';

export interface AuthenticatedRequest extends Request {
  uid: string;
  email: string;
}

/**
 * Verifica el JWT de Firebase en el header Authorization.
 * Si es válido, adjunta uid y email al request y llama next().
 * Si no, responde 401.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.split('Bearer ')[1];

  try {
    const decoded = await auth.verifyIdToken(token);
    (req as AuthenticatedRequest).uid = decoded.uid;
    (req as AuthenticatedRequest).email = decoded.email ?? '';
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

- [ ] **Step 5.2: Crear `functions/src/middleware/requireAdmin.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import { AuthenticatedRequest } from './requireAuth';

/**
 * Verifica que el token tenga el Custom Claim role: 'admin'.
 * Debe usarse DESPUÉS de requireAuth.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const uid = (req as AuthenticatedRequest).uid;

  if (!uid) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const user = await auth.getUser(uid);
    const claims = user.customClaims as { role?: string } | undefined;

    if (claims?.role !== 'admin') {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  } catch {
    res.status(403).json({ error: 'Could not verify admin role' });
  }
}
```

- [ ] **Step 5.3: Commit**

```bash
git add functions/src/middleware/
git commit -m "feat: requireAuth + requireAdmin middleware"
```

---

## Task 6: Reglas de Firestore + índices

**Files:**
- Create: `firestore.rules`
- Create: `firestore.indexes.json`

- [ ] **Step 6.1: Crear `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: verifica si el usuario tiene rol admin (Custom Claim)
    function isAdmin() {
      return request.auth != null &&
             request.auth.token.role == 'admin';
    }

    // users: cada cliente solo puede leer/escribir su propio documento
    match /users/{uid} {
      allow read, update: if request.auth != null && request.auth.uid == uid;
      allow create: if request.auth != null && request.auth.uid == uid;
      allow read, write: if isAdmin();
    }

    // reservations: cliente lee las suyas; backend (admin SDK) escribe libremente
    match /reservations/{reservationId} {
      allow read: if request.auth != null &&
                     resource.data.userUid == request.auth.uid;
      allow read, write: if isAdmin();
      // Las escrituras del backend usan Admin SDK y bypasean estas reglas
    }

    // payments: solo lectura del propio usuario; escritura solo desde backend
    match /payments/{paymentId} {
      allow read: if request.auth != null &&
                     resource.data.userUid == request.auth.uid;
      allow read, write: if isAdmin();
    }

    // access_logs: solo lectura del propio usuario
    match /access_logs/{logId} {
      allow read: if request.auth != null &&
                     resource.data.userUid == request.auth.uid;
      allow read, write: if isAdmin();
    }

    // sucursales: solo lectura pública (nombre, dirección para el frontend)
    match /sucursales/{sucursalId} {
      allow read: if true;
      allow write: if isAdmin();
    }
  }
}
```

- [ ] **Step 6.2: Crear `firestore.indexes.json`**

```json
{
  "indexes": [
    {
      "collectionGroup": "reservations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userUid", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "reservations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "mpPreapprovalId", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "payments",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "reservationId", "order": "ASCENDING" },
        { "fieldPath": "receivedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "access_logs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "sucursalId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 6.3: Deploy de reglas e índices**

```bash
cd ..  # raíz del repo
firebase deploy --only firestore:rules,firestore:indexes
```
Esperado: `Deploy complete!`

- [ ] **Step 6.4: Commit**

```bash
git add firestore.rules firestore.indexes.json
git commit -m "feat: Firestore security rules + indexes"
```

---

## Task 7: Servicio Mercado Pago

**Files:**
- Create: `functions/src/services/mercadopago.service.ts`
- Create: `functions/tests/services/mercadopago.service.test.ts`

- [ ] **Step 7.1: Escribir tests del servicio MP (TDD)**

Crear `functions/tests/services/mercadopago.service.test.ts`:
```typescript
import { createSubscription, cancelSubscription } from '../../src/services/mercadopago.service';

// Mockear el SDK de MP
jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn(),
  PreApproval: jest.fn().mockImplementation(() => ({
    create: jest.fn(),
    update: jest.fn(),
  })),
}));

const mockPreApprovalCreate = jest.fn();
const mockPreApprovalUpdate = jest.fn();

jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn(),
  PreApproval: jest.fn().mockImplementation(() => ({
    create: mockPreApprovalCreate,
    update: mockPreApprovalUpdate,
  })),
}));

describe('mercadopago.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MP_ACCESS_TOKEN = 'TEST-token-123';
  });

  describe('createSubscription', () => {
    it('should return preapproval_id and init_point', async () => {
      mockPreApprovalCreate.mockResolvedValue({
        id: 'preapproval-123',
        init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=xxx',
      });

      const result = await createSubscription({
        reservationId: 'MC-TEST-0001',
        categoryLabel: 'Mediano',
        m2: 6,
        amount: 151200,
        email: 'julia@gmail.com',
        backUrl: 'https://example.com/#/portal',
      });

      expect(result.preapprovalId).toBe('preapproval-123');
      expect(result.initPoint).toContain('mercadopago');
    });

    it('should throw if MP returns an error', async () => {
      mockPreApprovalCreate.mockRejectedValue(new Error('MP API error'));
      await expect(createSubscription({
        reservationId: 'MC-TEST-0001',
        categoryLabel: 'Mediano',
        m2: 6,
        amount: 151200,
        email: 'bad@email',
        backUrl: 'https://example.com/#/portal',
      })).rejects.toThrow('MP API error');
    });
  });

  describe('cancelSubscription', () => {
    it('should call update with cancelled status', async () => {
      mockPreApprovalUpdate.mockResolvedValue({ status: 'cancelled' });
      await cancelSubscription('preapproval-123');
      expect(mockPreApprovalUpdate).toHaveBeenCalledWith(
        { id: 'preapproval-123' },
        { body: { status: 'cancelled' } }
      );
    });
  });
});
```

- [ ] **Step 7.2: Ejecutar test (debe fallar)**

```bash
cd functions && npm test -- tests/services/mercadopago.service.test.ts
```
Esperado: `FAIL`

- [ ] **Step 7.3: Crear `functions/src/services/mercadopago.service.ts`**

```typescript
import { MercadoPagoConfig, PreApproval } from 'mercadopago';

function getMpClient(): { preApproval: InstanceType<typeof PreApproval> } {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');

  const client = new MercadoPagoConfig({ accessToken });
  return { preApproval: new PreApproval(client) };
}

interface CreateSubscriptionParams {
  reservationId: string;
  categoryLabel: string;
  m2: number;
  amount: number;
  email: string;
  backUrl: string;
}

interface CreateSubscriptionResult {
  preapprovalId: string;
  initPoint: string;
}

export async function createSubscription(
  params: CreateSubscriptionParams
): Promise<CreateSubscriptionResult> {
  const { preApproval } = getMpClient();

  const response = await preApproval.create({
    body: {
      reason: `Mi Container — ${params.categoryLabel} ${params.m2}m² (${params.reservationId})`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: params.amount,
        currency_id: 'ARS',
      },
      payer_email: params.email,
      back_url: params.backUrl,
      status: 'pending',
    },
  });

  if (!response.id || !response.init_point) {
    throw new Error('MP did not return preapproval_id or init_point');
  }

  return {
    preapprovalId: response.id,
    initPoint: response.init_point,
  };
}

export async function cancelSubscription(preapprovalId: string): Promise<void> {
  const { preApproval } = getMpClient();
  await preApproval.update(
    { id: preapprovalId },
    { body: { status: 'cancelled' } }
  );
}
```

- [ ] **Step 7.4: Ejecutar test (debe pasar)**

```bash
npm test -- tests/services/mercadopago.service.test.ts
```
Esperado: `PASS`

- [ ] **Step 7.5: Commit**

```bash
git add functions/src/services/mercadopago.service.ts functions/tests/services/
git commit -m "feat: Mercado Pago service (createSubscription + cancelSubscription) TDD"
```

---

## Task 8: Endpoint POST /reservations

**Files:**
- Create: `functions/src/routes/reservations.ts`
- Create: `functions/tests/routes/reservations.test.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 8.1: Escribir test del endpoint (TDD)**

Crear `functions/tests/routes/reservations.test.ts`:
```typescript
import request from 'supertest';
import express from 'express';
import { reservationsRouter } from '../../src/routes/reservations';

// Mocks
jest.mock('../../src/middleware/requireAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.uid = 'test-uid-123';
    req.email = 'julia@gmail.com';
    next();
  },
}));

jest.mock('../../src/models/user.model', () => ({
  getUser: jest.fn().mockResolvedValue({
    uid: 'test-uid-123',
    email: 'julia@gmail.com',
    name: 'Julia Martínez',
  }),
}));

jest.mock('../../src/models/reservation.model', () => ({
  createReservation: jest.fn().mockResolvedValue({ id: 'MC-TEST-0001' }),
  getUserReservations: jest.fn().mockResolvedValue([]),
  getReservation: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/services/mercadopago.service', () => ({
  createSubscription: jest.fn().mockResolvedValue({
    preapprovalId: 'preapproval-test',
    initPoint: 'https://mp.com/checkout?id=test',
  }),
  cancelSubscription: jest.fn().mockResolvedValue(undefined),
}));

const app = express();
app.use(express.json());
app.use('/reservations', reservationsRouter);

describe('POST /reservations', () => {
  const validBody = {
    sucursalId: 'nordelta',
    category: 'mediano',
    m2: 6,
    monthly: 151200,
    firstMonth: 0,
    startDate: '2026-05-14',
    duration: 3,
    addons: [],
    promosApplied: ['first-month-free'],
  };

  it('should create a reservation and return reservationId + initPoint', async () => {
    const res = await request(app)
      .post('/reservations')
      .set('Authorization', 'Bearer fake-token')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.reservationId).toMatch(/^MC-/);
    expect(res.body.initPoint).toContain('mp.com');
  });

  it('should return 400 if required fields are missing', async () => {
    const res = await request(app)
      .post('/reservations')
      .set('Authorization', 'Bearer fake-token')
      .send({ sucursalId: 'nordelta' }); // incompleto

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});
```

- [ ] **Step 8.2: Instalar supertest**

```bash
npm install --save-dev supertest @types/supertest
```

- [ ] **Step 8.3: Ejecutar test (debe fallar)**

```bash
npm test -- tests/routes/reservations.test.ts
```
Esperado: `FAIL`

- [ ] **Step 8.4: Crear `functions/src/routes/reservations.ts`**

```typescript
import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { createReservation, getUserReservations, getReservation, updateReservation } from '../models/reservation.model';
import { createSubscription, cancelSubscription } from '../services/mercadopago.service';
import { generateReservationId } from '../utils/generateId';

export const reservationsRouter = Router();

const REQUIRED_FIELDS = ['sucursalId', 'category', 'm2', 'monthly', 'firstMonth', 'startDate', 'duration'];

const BACK_URL = 'https://augusto-pmd.github.io/Micofrontend/#/portal';

// POST /reservations — crear reserva + iniciar suscripción MP
reservationsRouter.post('/', requireAuth, async (req, res: Response) => {
  const { uid, email } = req as AuthenticatedRequest;

  // Validación de campos requeridos
  const missing = REQUIRED_FIELDS.filter((f) => req.body[f] === undefined);
  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    return;
  }

  const {
    sucursalId, category, m2, monthly, firstMonth,
    startDate, duration, addons = [], promosApplied = [],
  } = req.body;

  try {
    const id = generateReservationId();

    // Crear suscripción en Mercado Pago
    const { preapprovalId, initPoint } = await createSubscription({
      reservationId: id,
      categoryLabel: category,
      m2,
      amount: monthly,
      email,
      backUrl: BACK_URL,
    });

    // Guardar reserva en Firestore
    await createReservation({
      id,
      userUid: uid,
      sucursalId,
      category,
      m2,
      monthly,
      firstMonth,
      startDate,
      duration,
      addons,
      promosApplied,
      status: 'pending_payment',
      mpPreapprovalId: preapprovalId,
      mpSubscriptionStatus: 'pending',
      faceEnrollStatus: 'not_started',
      faceEnrollAttempts: 0,
    });

    res.status(201).json({ reservationId: id, initPoint });
  } catch (err: any) {
    console.error('Error creating reservation:', err);
    res.status(500).json({ error: 'Could not create reservation', detail: err.message });
  }
});

// GET /reservations — listar reservas del cliente
reservationsRouter.get('/', requireAuth, async (req, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  try {
    const reservations = await getUserReservations(uid);
    res.json({ reservations });
  } catch (err: any) {
    res.status(500).json({ error: 'Could not fetch reservations' });
  }
});

// GET /reservations/:id — detalle de una reserva
reservationsRouter.get('/:id', requireAuth, async (req, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  try {
    const reservation = await getReservation(req.params.id);
    if (!reservation) {
      res.status(404).json({ error: 'Reservation not found' });
      return;
    }
    if (reservation.userUid !== uid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json({ reservation });
  } catch (err: any) {
    res.status(500).json({ error: 'Could not fetch reservation' });
  }
});

// POST /reservations/:id/cancel — cancelar reserva
reservationsRouter.post('/:id/cancel', requireAuth, async (req, res: Response) => {
  const { uid } = req as AuthenticatedRequest;
  try {
    const reservation = await getReservation(req.params.id);
    if (!reservation) {
      res.status(404).json({ error: 'Reservation not found' });
      return;
    }
    if (reservation.userUid !== uid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (reservation.status === 'cancelled') {
      res.status(409).json({ error: 'Already cancelled' });
      return;
    }

    // Cancelar en MP
    if (reservation.mpPreapprovalId) {
      await cancelSubscription(reservation.mpPreapprovalId);
    }

    await updateReservation(req.params.id, {
      status: 'cancelled',
      cancelledAt: require('firebase-admin').firestore.Timestamp.now(),
    });

    res.json({ message: 'Reservation cancelled' });
  } catch (err: any) {
    res.status(500).json({ error: 'Could not cancel reservation' });
  }
});
```

- [ ] **Step 8.5: Ejecutar test (debe pasar)**

```bash
npm test -- tests/routes/reservations.test.ts
```
Esperado: `PASS`

- [ ] **Step 8.6: Registrar el router en `functions/src/index.ts`**

```typescript
import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { reservationsRouter } from './routes/reservations';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.use('/reservations', reservationsRouter);

export const api = onRequest(
  { region: 'us-central1', memory: '256MiB' },
  app
);
```

- [ ] **Step 8.7: Commit**

```bash
git add functions/src/routes/reservations.ts functions/src/index.ts functions/tests/routes/
git commit -m "feat: POST/GET /reservations + cancel endpoint"
```

---

## Task 9: Webhook de Mercado Pago

**Files:**
- Create: `functions/src/routes/webhooks/mercadopago.ts`
- Create: `functions/tests/routes/webhooks.mercadopago.test.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 9.1: Escribir test del webhook**

Crear `functions/tests/routes/webhooks.mercadopago.test.ts`:
```typescript
import request from 'supertest';
import express from 'express';
import { mpWebhookRouter } from '../../src/routes/webhooks/mercadopago';

jest.mock('../../src/models/reservation.model', () => ({
  getReservationByMpPreapprovalId: jest.fn(),
  updateReservation: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/models/payment.model', () => ({
  createPayment: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/utils/hmac', () => ({
  verifyMpWebhookSignature: jest.fn().mockReturnValue(true),
}));

const { getReservationByMpPreapprovalId } = require('../../src/models/reservation.model');
const { updateReservation } = require('../../src/models/reservation.model');

const app = express();
app.use(express.json());
app.use('/webhooks/mp', mpWebhookRouter);

const validPayload = {
  action: 'payment',
  api_version: 'v1',
  data: { id: 'payment-123' },
  date_created: '2026-05-13T10:00:00Z',
  id: 'notif-123',
  live_mode: true,
  type: 'payment',
  user_id: '123456',
};

describe('POST /webhooks/mp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MP_WEBHOOK_SECRET = 'test-secret';
  });

  it('should activate reservation when payment is approved', async () => {
    getReservationByMpPreapprovalId.mockResolvedValue({
      id: 'MC-TEST-0001',
      userUid: 'uid-123',
      mpPreapprovalId: 'preapproval-abc',
      status: 'pending_payment',
    });

    const res = await request(app)
      .post('/webhooks/mp')
      .set('x-signature', 'valid-sig')
      .send({ ...validPayload, type: 'subscription_authorized_payment', data: { id: 'preapproval-abc' } });

    expect(res.status).toBe(200);
    expect(updateReservation).toHaveBeenCalledWith('MC-TEST-0001', expect.objectContaining({
      status: 'active',
    }));
  });

  it('should return 200 for unknown event types (idempotency)', async () => {
    const res = await request(app)
      .post('/webhooks/mp')
      .set('x-signature', 'valid-sig')
      .send({ ...validPayload, type: 'unknown_event' });

    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 9.2: Ejecutar test (debe fallar)**

```bash
npm test -- tests/routes/webhooks.mercadopago.test.ts
```
Esperado: `FAIL`

- [ ] **Step 9.3: Crear `functions/src/routes/webhooks/mercadopago.ts`**

```typescript
import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { getReservationByMpPreapprovalId, updateReservation } from '../../models/reservation.model';
import { createPayment } from '../../models/payment.model';
import { verifyMpWebhookSignature } from '../../utils/hmac';
import { generateReservationId } from '../../utils/generateId';

export const mpWebhookRouter = Router();

// Tipos de eventos de MP que nos interesan
const PAYMENT_APPROVED_TYPES = ['subscription_authorized_payment', 'payment'];
const SUBSCRIPTION_CANCELLED_TYPES = ['subscription_preapproval'];

mpWebhookRouter.post('/', async (req: Request, res: Response) => {
  // Verificar firma (MP envía x-signature header)
  const signature = req.headers['x-signature'] as string;
  const secret = process.env.MP_WEBHOOK_SECRET ?? '';
  const rawBody = JSON.stringify(req.body);

  if (secret && !verifyMpWebhookSignature(rawBody, signature, secret)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Siempre responder 200 rápido (MP espera < 5s)
  res.status(200).json({ received: true });

  // Procesar en background (no bloquea la respuesta)
  processWebhook(req.body).catch((err) =>
    console.error('[mp-webhook] Processing error:', err)
  );
});

async function processWebhook(body: any): Promise<void> {
  const { type, data } = body;

  // Pago aprobado o suscripción autorizada
  if (PAYMENT_APPROVED_TYPES.includes(type)) {
    const preapprovalId = data?.id;
    if (!preapprovalId) return;

    const reservation = await getReservationByMpPreapprovalId(preapprovalId);
    if (!reservation) {
      console.warn('[mp-webhook] Reservation not found for preapprovalId:', preapprovalId);
      return;
    }

    // Activar reserva si estaba pendiente
    if (reservation.status === 'pending_payment') {
      await updateReservation(reservation.id, {
        status: 'active',
        mpSubscriptionStatus: 'authorized',
      });
    }

    // Registrar pago
    const period = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    await createPayment({
      id: `${data.id}-${period}`,
      reservationId: reservation.id,
      userUid: reservation.userUid,
      mpPreapprovalId: preapprovalId,
      mpPaymentId: String(data.id),
      type: reservation.status === 'pending_payment' ? 'initial' : 'recurring_payment',
      amount: reservation.monthly,
      currency: 'ARS',
      status: 'approved',
      period,
    });

    return;
  }

  // Suscripción cancelada o pausada por falta de pago
  if (SUBSCRIPTION_CANCELLED_TYPES.includes(type)) {
    const preapprovalId = data?.id;
    if (!preapprovalId) return;

    const reservation = await getReservationByMpPreapprovalId(preapprovalId);
    if (!reservation) return;

    const newStatus = body.data?.status === 'cancelled' ? 'cancelled' : 'payment_failed';

    await updateReservation(reservation.id, {
      status: newStatus,
      mpSubscriptionStatus: body.data?.status ?? 'cancelled',
      cancelledAt: admin.firestore.Timestamp.now(),
    });

    console.log(`[mp-webhook] Reservation ${reservation.id} → ${newStatus}`);
  }
}
```

- [ ] **Step 9.4: Ejecutar test (debe pasar)**

```bash
npm test -- tests/routes/webhooks.mercadopago.test.ts
```
Esperado: `PASS`

- [ ] **Step 9.5: Agregar webhook al router en `index.ts`**

```typescript
import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { reservationsRouter } from './routes/reservations';
import { mpWebhookRouter } from './routes/webhooks/mercadopago';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.use('/reservations', reservationsRouter);
app.use('/webhooks/mp', mpWebhookRouter);

export const api = onRequest(
  { region: 'us-central1', memory: '256MiB' },
  app
);
```

- [ ] **Step 9.6: Commit**

```bash
git add functions/src/routes/webhooks/ functions/src/index.ts functions/tests/routes/webhooks.mercadopago.test.ts
git commit -m "feat: Mercado Pago webhook handler (payment approval + cancellation)"
```

---

## Task 10: Configurar secretos + deploy a Firebase

**Files:**
- Create: `functions/.env.local` (para desarrollo, NO commitear)

- [ ] **Step 10.1: Agregar `.env.local` al `.gitignore`**

Verificar que el `.gitignore` de la raíz del repo tenga:
```
functions/.env.local
functions/lib/
```

Si no están, agregarlos y commitear:
```bash
echo "functions/.env.local" >> .gitignore
echo "functions/lib/" >> .gitignore
git add .gitignore
git commit -m "chore: ignore Functions build output and local env"
```

- [ ] **Step 10.2: Crear `functions/.env.local` con valores de prueba**

```bash
# NO commitear este archivo
MP_ACCESS_TOKEN=TEST-tu-access-token-de-sandbox
MP_WEBHOOK_SECRET=tu-clave-secreta-para-webhooks
```

Para obtener las credenciales de sandbox de MP:
- Ir a https://www.mercadopago.com.ar/developers → Aplicaciones → Credenciales de prueba
- Copiar "Access Token" que empieza con `TEST-`

- [ ] **Step 10.3: Configurar secretos en Secret Manager para producción**

Cuando tengan el Access Token de producción (`APP_USR-...`):
```bash
firebase functions:secrets:set MP_ACCESS_TOKEN
# Pegar el token cuando lo pida

firebase functions:secrets:set MP_WEBHOOK_SECRET
# Generar una clave aleatoria y guardarla
```

Para Hikvision (cuando tengan la IP y credenciales):
```bash
firebase functions:secrets:set HIK_NORDELTA_USER
firebase functions:secrets:set HIK_NORDELTA_PASS
```

- [ ] **Step 10.4: Ejecutar todos los tests**

```bash
cd functions && npm test
```
Esperado: todos `PASS`.

- [ ] **Step 10.5: Build**

```bash
npm run build
```
Esperado: sin errores de TypeScript.

- [ ] **Step 10.6: Deploy (requiere Blaze plan activado)**

```bash
cd ..  # raíz del repo
firebase deploy --only functions
```
Esperado:
```
✔  functions: Finished running predeploy script.
✔  functions[us-central1-api]: Successful create operation.
Function URL: https://us-central1-micontainer-prod.cloudfunctions.net/api
```

Anotar la URL base de la API (ej: `https://us-central1-micontainer-prod.cloudfunctions.net/api`).

- [ ] **Step 10.7: Smoke test en producción**

```bash
curl https://us-central1-micontainer-prod.cloudfunctions.net/api/health
```
Esperado: `{"status":"ok","version":"1.0.0"}`

- [ ] **Step 10.8: Commit final del plan 1**

```bash
git add .
git commit -m "feat: backend Plan 1 complete — API Core + Auth + MP Subscriptions"
```

---

## Task 11: Conectar el frontend al backend real

**Files:**
- Create: `src/api.js` (nuevo archivo en el frontend)
- Modify: `home.jsx` (reemplazar llamadas a localStorage con llamadas a la API)

- [ ] **Step 11.1: Crear `src/api.js` con la URL base de la API**

```javascript
// URL de la API — cambiar por la URL real después del deploy
const API_BASE = 'https://us-central1-micontainer-prod.cloudfunctions.net/api';

/**
 * Obtiene el token JWT del usuario autenticado con Firebase.
 * Requiere que Firebase Auth esté inicializado en el frontend.
 */
async function getAuthToken() {
  const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
  const user = getAuth().currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

export async function apiCreateReservation(reservationData) {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}/reservations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(reservationData),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { reservationId, initPoint }
}

export async function apiGetReservations() {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}/reservations`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { reservations: [...] }
}

export async function apiCancelReservation(reservationId) {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}/reservations/${reservationId}/cancel`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

> **Nota:** La integración completa de Firebase Auth en el frontend (reemplazar el mock de login por Firebase real) es una tarea separada que depende de tener el proyecto Firebase configurado y los Client SDK keys disponibles. Se documenta en el Plan 2.

- [ ] **Step 11.2: Commit**

```bash
git add src/api.js
git commit -m "feat: frontend API client for backend integration"
```

---

## Verificación final del Plan 1

- [ ] `npm test` en `functions/` → todos PASS
- [ ] `firebase deploy --only functions,firestore` → deploy exitoso
- [ ] `curl .../api/health` → `{"status":"ok"}`
- [ ] Un cliente puede crear una reserva via `POST /reservations` y recibir un `initPoint` de MP
- [ ] El webhook de MP activa la reserva en Firestore cuando el pago es aprobado
- [ ] Las reglas de Firestore están deployadas y un cliente solo ve sus propias reservas

---

## Pendiente para Plan 2

- Hikvision face enrollment (Cloud Tasks + ISAPI)
- Firebase Auth integrado en el frontend (reemplazar mock de Google login)
- Emails transaccionales con Resend
- Panel admin React
