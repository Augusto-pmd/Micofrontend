import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { reservationsRouter } from './routes/reservations';
import { mpWebhookRouter } from './routes/webhooks/mercadopago';

// Admin routes
import { authRouter } from './routes/admin/auth';
import { branchesRouter } from './routes/admin/branches';
import { buildingsRouter } from './routes/admin/buildings';
import { storageRoomsRouter } from './routes/admin/storageRooms';
import { ordersRouter } from './routes/admin/orders';
import { customersRouter } from './routes/admin/customers';
import { operatorsRouter } from './routes/admin/operators';
import { usersRouter } from './routes/admin/users';
import { pricingRouter } from './routes/admin/pricing';
import { inventoryRouter } from './routes/admin/inventory';
import { seedRouter } from './routes/admin/seed';

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://admin-panel-ten-pied.vercel.app',
  'https://augusto-pmd.github.io',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow any vercel.app preview deployments
      if (origin.endsWith('.vercel.app')) return callback(null, true);
      return callback(null, true); // permissive for now — tighten post-launch
    },
    credentials: true,
  })
);
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

// ── Existing public/customer routes ──────────────────────────────────────────
app.use('/reservations', reservationsRouter);
app.use('/webhooks/mp', mpWebhookRouter);

// ── Admin routes ──────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/branch', branchesRouter);
app.use('/building', buildingsRouter);
app.use('/storage-room', storageRoomsRouter);
app.use('/reservation-order', ordersRouter);
app.use('/customer', customersRouter);
app.use('/operator', operatorsRouter);
app.use('/user', usersRouter);
app.use('/pricing-engine', pricingRouter);
app.use('/inventory', inventoryRouter);
app.use('/seed', seedRouter);

export const api = onRequest(
  { region: 'us-central1', memory: '256MiB' },
  app
);
