import Stripe from 'stripe';
import { Tier } from './db';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-09-30.clover' });

export function planToTier(plan: 'pro' | 'pro_trader'): Tier {
  return plan === 'pro_trader' ? 'pro_trader' : 'pro';
}

export async function createCheckout(params: {
  plan: 'pro' | 'pro_trader';
  workspaceId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const priceId = params.plan === 'pro_trader' 
    ? process.env.STRIPE_PRICE_PRO_TRADER 
    : process.env.STRIPE_PRICE_PRO;

  if (!priceId) {
    throw new Error(`Missing Stripe price ID for plan: ${params.plan}`);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${params.successUrl}?wid=${params.workspaceId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${params.cancelUrl}?wid=${params.workspaceId}`,
    metadata: {
      workspace_id: params.workspaceId,
      plan: params.plan,
    },
    subscription_data: {
      metadata: {
        workspace_id: params.workspaceId,
        plan: params.plan,
      },
    },
  });

  return { url: session.url };
}

export async function createPortal(params: {
  customerId: string;
  returnUrl: string;
}) {
  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });

  return { url: session.url };
}

export async function getSubscription(subscriptionId: string) {
  return await stripe.subscriptions.retrieve(subscriptionId);
}

export async function cancelSubscription(subscriptionId: string) {
  return await stripe.subscriptions.cancel(subscriptionId);
}
