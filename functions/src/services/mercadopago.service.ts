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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (preApproval.update as any)(
    { id: preapprovalId },
    { body: { status: 'cancelled' } }
  );
}
