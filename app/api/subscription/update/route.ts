import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@vercel/postgres';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' as any });

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Verify this is a legitimate internal call via webhook secret or cron secret
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = request.headers.get('x-cron-secret');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripeSignature = request.headers.get('stripe-signature');

    const isCronAuth = cronSecret && headerSecret === cronSecret;
    let isStripeWebhook = false;

    // Read body once so it can be reused for both verification and parsing
    const rawBody = await request.text();

    if (webhookSecret && stripeSignature) {
      try {
        stripe.webhooks.constructEvent(rawBody, stripeSignature, webhookSecret);
        isStripeWebhook = true;
      } catch {
        // Signature invalid
      }
    }

    if (!isCronAuth && !isStripeWebhook) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { stripeSubscriptionId, customerEmail, planType, status } = JSON.parse(rawBody);

    if (!stripeSubscriptionId) {
      return NextResponse.json({ error: 'Missing subscription ID' }, { status: 400 });
    }

    const client = createClient({
      connectionString: process.env.DATABASE_URL,
    });

    await client.connect();

    if (status === 'active' && customerEmail && planType) {
      // Create/update active subscription
      // For simplicity, we'll use email as workspace identifier
      const workspaceId = customerEmail.replace('@', '_at_').replace('.', '_dot_');
      
      // First, get or create plan ID
      let planId = 1; // Default to Pro
      if (planType === 'pro_trader') {
        planId = 2;
      }

      // Insert or update subscription
      const query = `
        INSERT INTO user_subscriptions 
        (workspace_id, plan_id, platform, billing_period, subscription_status, stripe_subscription_id, current_period_start, current_period_end)
        VALUES ($1, $2, 'web', 'monthly', 'active', $3, now(), now() + interval '1 month')
        ON CONFLICT (workspace_id) 
        DO UPDATE SET 
          plan_id = $2,
          subscription_status = 'active',
          stripe_subscription_id = $3,
          current_period_start = now(),
          current_period_end = now() + interval '1 month'
      `;
      
      await client.query(query, [workspaceId, planId, stripeSubscriptionId]);
      
      console.log(`Updated subscription for ${customerEmail}: ${planType} plan active`);

    } else if (status === 'cancelled') {
      // Cancel subscription
      const query = `
        UPDATE user_subscriptions 
        SET subscription_status = 'cancelled', cancelled_at = now()
        WHERE stripe_subscription_id = $1
      `;
      
      await client.query(query, [stripeSubscriptionId]);
      
      console.log(`Cancelled subscription: ${stripeSubscriptionId}`);
    }

    await client.end();

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Subscription update error:', error);
    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 }
    );
  }
}