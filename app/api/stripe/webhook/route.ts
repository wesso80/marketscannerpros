import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature')!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, endpointSecret!);
    } catch (err: any) {
      console.log(`Webhook signature verification failed:`, err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Handle successful checkout completion
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      if (session.mode === 'subscription' && session.subscription) {
        // Get subscription details
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        
        // Determine plan type based on amount
        const unitAmount = subscription.items.data[0]?.price?.unit_amount || 0;
        let planType = 'pro';
        if (unitAmount >= 999) { // $9.99 or more
          planType = 'pro_trader';
        }
        
        console.log(`Subscription created: ${subscription.id}, Plan: ${planType}, Customer: ${session.customer_email}`);
        
        // Call our internal API to update subscription status
        const updateUrl = `${request.nextUrl.origin}/api/subscription/update`;
        await fetch(updateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stripeSubscriptionId: subscription.id,
            customerEmail: session.customer_email,
            planType: planType,
            status: 'active'
          })
        });
      }
    }

    // Handle subscription cancellation
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      
      console.log(`Subscription cancelled: ${subscription.id}`);
      
      // Call our internal API to cancel subscription
      const updateUrl = `${request.nextUrl.origin}/api/subscription/update`;
      await fetch(updateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stripeSubscriptionId: subscription.id,
          status: 'cancelled'
        })
      });
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}