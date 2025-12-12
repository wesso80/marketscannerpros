import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@vercel/postgres';

export async function POST(request: NextRequest) {
  try {
    const { stripeSubscriptionId, customerEmail, planType, status } = await request.json();

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