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
  updateReservation: jest.fn().mockResolvedValue(undefined),
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
      .send({ sucursalId: 'nordelta' }); // incomplete

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});
