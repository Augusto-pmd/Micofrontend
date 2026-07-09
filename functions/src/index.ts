import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { reservationsRouter } from './routes/reservations';
import { mpWebhookRouter } from './routes/webhooks/mercadopago';
import { availabilityRouter } from './routes/availability';
import { waitlistRouter } from './routes/waitlist';
import { chatRouter } from './routes/chat';
import { syncRouter } from './routes/sync';
import { pricingPublicRouter } from './routes/pricing';
import { promoRouter } from './routes/promo';
import { leadsRouter } from './routes/leads';
import { mailingRouter } from './routes/mailing';

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
import { portalRouter } from './routes/portal';
import { adminAuditRouter } from './routes/admin/audit';
import { adminCancellationsRouter } from './routes/admin/cancellations';
import { adminMaintenanceRouter } from './routes/admin/maintenance';

// Middleware
import { requireAuth } from './middleware/requireAuth';
import { requireStaff } from './middleware/requireStaff';

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
app.use('/sync', syncRouter); // import desde Sheet (token)
app.use('/pricing', pricingPublicRouter); // tabla de precios por medida (publico)
app.use('/promo', promoRouter); // promocion web por sucursal (GET publico, admin con token)
app.use('/leads', leadsRouter); // contactos para mailing (admin)
app.use('/mailing', mailingRouter); // envio de mails via Resend (admin)

// ── Admin routes ──────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/branch', requireAuth, requireStaff, branchesRouter);
app.use('/building', requireAuth, requireStaff, buildingsRouter);
app.use('/storage-room', requireAuth, requireStaff, storageRoomsRouter);
app.use('/reservation-order', requireAuth, requireStaff, ordersRouter);
app.use('/customer', requireAuth, requireStaff, customersRouter);
app.use('/operator', requireAuth, requireStaff, operatorsRouter);
app.use('/user', requireAuth, requireStaff, usersRouter);
app.use('/pricing-engine', requireAuth, requireStaff, pricingRouter);
app.use('/inventory', requireAuth, requireStaff, inventoryRouter);
app.use('/seed', requireAuth, requireStaff, seedRouter);
app.use('/admin/reservations', requireAuth, requireStaff, adminReservationsRouter);
app.use('/admin/audit', requireAuth, requireStaff, adminAuditRouter);
app.use('/admin/cancellations', requireAuth, requireStaff, adminCancellationsRouter);
app.use('/admin/maintenance', requireAuth, requireStaff, adminMaintenanceRouter);
app.use('/my-account', myAccountRouter);
app.use('/portal', portalRouter);

export const api = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    secrets: ['MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET', 'ANTHROPIC_API_KEY', 'SYNC_TOKEN', 'RESEND_API_KEY'],
  },
  app
);
