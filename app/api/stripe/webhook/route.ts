import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { hashWorkspaceId } from '@/lib/auth';

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig!, WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("Webhook signature verification failed.", err.message);
    return new NextResponse("Bad signature", { status: 400 });
  }

  try {
    // Handle subscription created or updated - sync tier to customer metadata
    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      const sub: any = event.data.object;
      const customerId = sub.customer as string;
      const status = sub.status as string;
      const priceIds: string[] = (sub.items?.data ?? []).map((it: any) => it.price?.id).filter(Boolean);

      let tier: "free" | "pro" | "pro_trader" = "free";
      if (["active", "trialing", "past_due"].includes(status) && priceIds.length) {
        const PRICE_PRO = process.env.NEXT_PUBLIC_PRICE_PRO!;
        const PRICE_PRO_TRADER = process.env.NEXT_PUBLIC_PRICE_PRO_TRADER!;
        
        if (priceIds.includes(PRICE_PRO_TRADER)) tier = "pro_trader";
        else if (priceIds.includes(PRICE_PRO)) tier = "pro";
      }

      // Store tier and stable workspace ID in Stripe customer metadata (source of truth)
      await stripe.customers.update(customerId, {
        metadata: { 
          marketscanner_tier: tier,
          workspace_id: hashWorkspaceId(customerId)
        },
      });
      
      console.log(`Updated customer ${customerId} to tier ${tier}`);
    }

    // Handle subscription cancellation - set tier to free
    if (event.type === "customer.subscription.deleted") {
      const sub: any = event.data.object;
      const customerId = sub.customer as string;
      await stripe.customers.update(customerId, { 
        metadata: { 
          marketscanner_tier: "free",
          workspace_id: hashWorkspaceId(customerId)
        } 
      });
      
      console.log(`Cancelled subscription for customer ${customerId}`);
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("Webhook handler error", e);
    return new NextResponse("Webhook handler error", { status: 500 });
  }
}