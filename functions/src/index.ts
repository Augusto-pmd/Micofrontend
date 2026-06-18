import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { reservationsRouter } from './routes/reservations';
import { mpWebhookRouter } from './routes/webhooks/mercadopago';
import { availabilityRouter } from './routes/availability';
import { waitlistRouter } from './routes/waitlist';
import { chatRouter } from './routes/chat';

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
import { adminReservationsRouter } from './routes/admin/reservations';
import { myAccountRouter } from './routes/myAccount';

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080',
  'https://admin-panel-ten-pied.vercel.app',
  'https://augusto-pmd.github.io',
  'https://micontainer.com',
  'https://www.micontainer.com',
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

// ── Method override ───────────────────────────────────────────────────
// El admin panel usa PATCH para los updates, pero el backend implementa PUT.
// Convertimos PATCH->PUT salvo en /admin/reservations (que tiene su PATCH propio).
app.use((req, _res, next) => {
  if (req.method === 'PATCH' && !req.path.startsWith('/admin/reservations')) {
    req.method = 'PUT';
  }
  next();
});


// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

// ── Existing public/customer routes ──────────────────────────────────────────
app.use('/reservations', reservationsRouter);
app.use('/webhooks/mp', mpWebhookRouter);
app.use('/availability', availabilityRouter); // público
app.use('/waitlist', waitlistRouter); // POST público, GET admin
app.use('/chat', chatRouter); // asesor Claude (público)

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
app.use('/admin/reservations', adminReservationsRouter);
app.use('/my-account', myAccountRouter);

export const api = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    secrets: ['MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET', 'ANTHROPIC_API_KEY'],
  },
  app
);
