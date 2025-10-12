import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { setSubscription } from '@/lib/db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-09-30.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const sig = req.headers.get('stripe-signature') || '';

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const workspaceId = session.metadata?.workspace_id;

        if (workspaceId && session.payment_status === 'paid') {
          await setSubscription(workspaceId, 'paid', 'active');
          console.log('[WEBHOOK] Subscription activated for workspace:', workspaceId);
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const workspaceId = subscription.metadata?.workspace_id;

        if (workspaceId) {
          const isActive = subscription.status === 'active' || subscription.status === 'trialing';
          const tier = isActive ? 'paid' : 'free';
          
          const status = subscription.status === 'active' || subscription.status === 'trialing'
            ? 'active'
            : subscription.status === 'past_due'
            ? 'past_due'
            : 'canceled';

          const periodEnd = (subscription as any).current_period_end 
            ? new Date((subscription as any).current_period_end * 1000)
            : undefined;

          await setSubscription(workspaceId, tier, status, periodEnd);

          console.log('[WEBHOOK] Subscription updated for workspace:', workspaceId, { tier, status });
        }
        break;
      }

      default:
        console.log('[WEBHOOK] Unhandled event type:', event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('[WEBHOOK ERROR]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
