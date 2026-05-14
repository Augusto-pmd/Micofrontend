import { createSubscription, cancelSubscription } from '../../src/services/mercadopago.service';

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
    it('should return preapprovalId and initPoint', async () => {
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
