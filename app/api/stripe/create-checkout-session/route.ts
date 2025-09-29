import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
});

const PLAN_CONFIG = {
  pro: {
    name: 'MarketScanner Pro',
    description: 'Multi-TF confluence, Squeezes, Exports',
    price: 4.99,
    trial_days: 7,
  },
  pro_trader: {
    name: 'MarketScanner Pro Trader', 
    description: 'All Pro features, Advanced alerts, Priority support',
    price: 9.99,
    trial_days: 5,
  }
};

export async function POST(request: NextRequest) {
  try {
    const { plan } = await request.json();

    if (!plan || !PLAN_CONFIG[plan as keyof typeof PLAN_CONFIG]) {
      return NextResponse.json(
        { error: 'Invalid plan specified' },
        { status: 400 }
      );
    }

    const planConfig = PLAN_CONFIG[plan as keyof typeof PLAN_CONFIG];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: planConfig.name,
              description: planConfig.description,
            },
            unit_amount: Math.round(planConfig.price * 100), // Convert to cents
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `https://65e0d511-a376-4400-9b96-6faf813e6d83-00-346bbki9bwvxl.worf.replit.dev/?access=${plan}&stripe_success=true`,
      cancel_url: `${request.nextUrl.origin}/pricing?canceled=true`,
      subscription_data: {
        trial_period_days: planConfig.trial_days,
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    });

    return NextResponse.json({ url: session.url });

  } catch (error: any) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}