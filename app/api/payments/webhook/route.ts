import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@vercel/postgres';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

cat >> app/api/payments/webhook/route.ts <<'TS'
export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig!, WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('❌ Invalid signature', err.message);
    return new NextResponse('Bad signature', { status: 400 });
  }

  const client = createClient({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const id = event.id;
    await client.query('INSERT INTO stripe_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);

cat >> app/api/payments/webhook/route.ts <<'TS'
    if (event.type.startsWith('customer.subscription.')) {
      const sub: any = event.data.object;
      const status = sub.status as string;
      const customerId = sub.customer as string;

      const active = ['active', 'trialing', 'past_due'].includes(status);
      const newStatus = active ? 'active' : status === 'canceled' ? 'cancelled' : status;

      const customer = await stripe.customers.retrieve(customerId);
      const email = (customer as any)?.email;
      const planType =
        sub.items?.data?.some((i: any) =>
          i.price?.id === process.env.NEXT_PUBLIC_PRICE_PRO_TRADER)
          ? 'pro_trader'
          : 'pro';

      if (email) {
        const wsid = email.replace('@', '_at_').replace('.', '_dot_');

        if (newStatus === 'active') {
          await client.query(
            `INSERT INTO user_subscriptions
             (workspace_id, plan_id, platform, billing_period, subscription_status, stripe_subscription_id, current_period_start, current_period_end)
             VALUES ($1, $2, 'web', 'monthly', 'active', $3, now(), now() + interval '1 month')
             ON CONFLICT (workspace_id)
             DO UPDATE SET subscription_status='active', plan_id=$2,
                           stripe_subscription_id=$3,
                           current_period_start=now(), current_period_end=now() + interval '1 month'`,
            [wsid, planType === 'pro_trader' ? 2 : 1, sub.id]
          );
        } else if (newStatus === 'cancelled') {
          await client.query(
            `UPDATE user_subscriptions
             SET subscription_status='cancelled', cancelled_at=now()
             WHERE stripe_subscription_id=$1`,
            [sub.id]
          );
        }
      }
    }

    await client.end();
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook error', err);
    await client.end();
    return new NextResponse('Webhook handler error', { status: 500 });
  }
}
