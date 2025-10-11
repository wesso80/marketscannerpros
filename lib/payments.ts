import { Tier } from './db';

const PADDLE_ENV = process.env.PADDLE_ENVIRONMENT || 'sandbox';
const PADDLE_VENDOR_ID = process.env.PADDLE_VENDOR_ID || '';
const PADDLE_API_KEY = process.env.PADDLE_API_KEY || '';

export function planToTier(plan: 'pro' | 'pro_trader'): Tier {
  return plan === 'pro_trader' ? 'pro_trader' : 'pro';
}

export async function createCheckout(params: {
  plan: 'pro' | 'pro_trader';
  workspaceId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  // In sandbox mode, return simulated checkout
  if (PADDLE_ENV === 'sandbox') {
    const url = `${params.successUrl}?wid=${params.workspaceId}&plan=${params.plan}&simulated=1`;
    return { url };
  }

  // Production Paddle checkout
  const priceId = params.plan === 'pro_trader' 
    ? process.env.PADDLE_PRICE_PRO_TRADER 
    : process.env.PADDLE_PRICE_PRO;

  const response = await fetch('https://api.paddle.com/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PADDLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity: 1 }],
      customer_id: PADDLE_VENDOR_ID,
      custom_data: { workspace_id: params.workspaceId },
      success_url: `${params.successUrl}?wid=${params.workspaceId}`,
      cancel_url: `${params.cancelUrl}?wid=${params.workspaceId}`,
    }),
  });

  const data = await response.json();
  return { url: data.url };
}

export async function createPortal(params: {
  workspaceId: string;
  returnUrl: string;
}) {
  // In sandbox mode, return simulated portal
  if (PADDLE_ENV === 'sandbox') {
    const url = `${params.returnUrl}?wid=${params.workspaceId}&portal=simulated`;
    return { url };
  }

  // Production Paddle portal
  const response = await fetch('https://api.paddle.com/customer-portal-sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PADDLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customer_id: PADDLE_VENDOR_ID,
      return_url: `${params.returnUrl}?wid=${params.workspaceId}`,
    }),
  });

  const data = await response.json();
  return { url: data.url };
}
