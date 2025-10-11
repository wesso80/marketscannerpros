import { NextResponse } from "next/server";
import Stripe from "stripe";
import { setSubscription, upsertCustomer } from "@/lib/db";
import type { Tier, Status } from "@/lib/db";
import { planToTier } from "@/lib/payments";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-09-30.clover' });
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    if (!sig) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const workspaceId = session.metadata?.workspace_id;
        const plan = session.metadata?.plan as 'pro' | 'pro_trader' | undefined;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (workspaceId && customerId) {
          await upsertCustomer(workspaceId, customerId);
          
          if (plan && subscriptionId) {
            const tier = planToTier(plan);
            await setSubscription(workspaceId, tier, 'active', undefined, subscriptionId);
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const workspaceId = subscription.metadata?.workspace_id;
        const plan = subscription.metadata?.plan as 'pro' | 'pro_trader' | undefined;

        if (workspaceId && plan) {
          const tier = planToTier(plan);
          let status: Status = 'inactive';

          if (subscription.status === 'active') status = 'active';
          else if (subscription.status === 'trialing') status = 'trialing';
          else if (subscription.status === 'past_due') status = 'past_due';
          else if (subscription.status === 'canceled' || subscription.status === 'unpaid') status = 'canceled';

          const periodEnd = (subscription as any).current_period_end;
          const currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : undefined;

          await setSubscription(
            workspaceId,
            tier,
            status,
            currentPeriodEnd,
            subscription.id
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const workspaceId = subscription.metadata?.workspace_id;

        if (workspaceId) {
          await setSubscription(workspaceId, 'free', 'canceled');
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("Webhook error:", e);
    return NextResponse.json({ error: e.message || "webhook failed" }, { status: 500 });
  }
}
