import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { q } from '@/lib/db';
import { hashWorkspaceId } from '@/lib/auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Price ID mappings
const PRO_PRICE_IDS = [
  "price_1SfcQJLyhHN1qVrAfOpufz0L", // Pro Monthly
  "price_1SfcRsLyhHN1qVrAuRE6IRU1", // Pro Yearly
];
const PRO_TRADER_PRICE_IDS = [
  "price_1SfcSZLyhHN1qVrAaVrilpyO", // Pro Trader Monthly
  "price_1SfcTALyhHN1qVrAoIHo4LN1", // Pro Trader Yearly
];

function getTierFromPriceId(priceId: string): 'pro' | 'pro_trader' | 'free' {
  if (PRO_TRADER_PRICE_IDS.includes(priceId)) return 'pro_trader';
  if (PRO_PRICE_IDS.includes(priceId)) return 'pro';
  return 'free';
}

async function upsertSubscription(
  customerId: string,
  email: string,
  tier: string,
  status: string,
  stripeSubscriptionId: string,
  periodEnd: Date | null,
  isTrial: boolean = false
) {
  const workspaceId = hashWorkspaceId(customerId);
  
  try {
    await q(`
      INSERT INTO user_subscriptions 
        (workspace_id, email, tier, status, stripe_subscription_id, stripe_customer_id, 
         current_period_end, is_trial, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (workspace_id) 
      DO UPDATE SET 
        email = EXCLUDED.email,
        tier = EXCLUDED.tier,
        status = EXCLUDED.status,
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        current_period_end = EXCLUDED.current_period_end,
        is_trial = EXCLUDED.is_trial,
        updated_at = NOW()
    `, [workspaceId, email, tier, status, stripeSubscriptionId, customerId, periodEnd, isTrial]);
    
    console.log(`[Webhook] Upserted subscription: ${email} - ${tier} (${status})`);
  } catch (error) {
    console.error('[Webhook] Failed to upsert subscription:', error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log(`[Webhook] Received event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const customer = await stripe.customers.retrieve(session.customer as string) as Stripe.Customer;
          const priceId = subscription.items.data[0]?.price.id || '';
          const tier = getTierFromPriceId(priceId);
          
          await upsertSubscription(
            customer.id,
            customer.email || '',
            tier,
            subscription.status,
            subscription.id,
            new Date((subscription as any).current_period_end * 1000),
            subscription.status === 'trialing'
          );
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer;
        const priceId = subscription.items.data[0]?.price.id || '';
        const tier = getTierFromPriceId(priceId);
        
        await upsertSubscription(
          customer.id,
          customer.email || '',
          tier,
          subscription.status,
          subscription.id,
          new Date((subscription as any).current_period_end * 1000),
          subscription.status === 'trialing'
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer;
        
        await upsertSubscription(
          customer.id,
          customer.email || '',
          'free',
          'canceled',
          subscription.id,
          null,
          false
        );
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as any).subscription;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId as string);
          const customer = await stripe.customers.retrieve((invoice as any).customer as string) as Stripe.Customer;
          const workspaceId = hashWorkspaceId(customer.id);
          
          await q(`
            UPDATE user_subscriptions 
            SET status = 'past_due', updated_at = NOW()
            WHERE workspace_id = $1
          `, [workspaceId]);
          
          console.log(`[Webhook] Marked subscription as past_due: ${customer.email}`);
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Webhook] Error processing event:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
