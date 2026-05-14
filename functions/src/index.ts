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
