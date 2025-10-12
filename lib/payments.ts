import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { 
  apiVersion: '2025-09-30.clover' 
});

export async function createCheckoutSession(workspaceId: string) {
  const priceId = process.env.STRIPE_PRICE_PAID;
  
  if (!priceId) {
    throw new Error('Missing STRIPE_PRICE_PAID environment variable');
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://marketscannerpros.app';
  
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{
      price: priceId,
      quantity: 1,
    }],
    success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/pricing`,
    metadata: {
      workspace_id: workspaceId,
      tier: 'paid',
    },
    subscription_data: {
      metadata: {
        workspace_id: workspaceId,
        tier: 'paid',
      },
    },
  });

  return session.url;
}

export async function verifySession(sessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return {
    paid: session.payment_status === 'paid',
    workspaceId: session.metadata?.workspace_id,
  };
}
