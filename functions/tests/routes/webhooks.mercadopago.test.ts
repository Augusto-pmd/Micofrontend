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

const { getReservationByMpPreapprovalId, updateReservation } = require('../../src/models/reservation.model');

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
      monthly: 151200,
    });

    const res = await request(app)
      .post('/webhooks/mp')
      .set('x-signature', 'valid-sig')
      .send({ ...validPayload, type: 'subscription_authorized_payment', data: { id: 'preapproval-abc' } });

    expect(res.status).toBe(200);
    // Give async processing time to run
    await new Promise(resolve => setTimeout(resolve, 100));
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
