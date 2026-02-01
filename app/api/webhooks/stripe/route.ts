import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { q } from '@/lib/db';
import { hashWorkspaceId } from '@/lib/auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Price ID mappings - read from environment variables
const PRO_PRICE_IDS = [
  process.env.STRIPE_PRICE_PRO_MONTHLY || "",
  process.env.STRIPE_PRICE_PRO_YEARLY || "",
].filter(Boolean);
const PRO_TRADER_PRICE_IDS = [
  process.env.STRIPE_PRICE_PRO_TRADER_MONTHLY || "",
  process.env.STRIPE_PRICE_PRO_TRADER_YEARLY || "",
].filter(Boolean);

function getTierFromPriceId(priceId: string): 'pro' | 'pro_trader' | 'free' {
  if (PRO_TRADER_PRICE_IDS.includes(priceId)) return 'pro_trader';
  if (PRO_PRICE_IDS.includes(priceId)) return 'pro';
  return 'free';
}

// Process referral reward when someone subscribes
async function processReferralReward(workspaceId: string, email: string) {
  try {
    // Check if this user signed up via referral and hasn't been rewarded yet
    const referralResult = await q(
      `SELECT id, referrer_workspace_id, status 
       FROM referral_signups 
       WHERE referee_workspace_id = $1 AND status = 'pending'`,
      [workspaceId]
    );

    if (referralResult.length === 0) {
      console.log(`[Referral] No pending referral for ${email}`);
      return;
    }

    const referral = referralResult[0];
    console.log(`[Referral] Found pending referral for ${email}, processing reward...`);

    // Grant 1 month Pro Trader to BOTH users
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    // Record reward for referee (the new subscriber)
    await q(
      `INSERT INTO referral_rewards (workspace_id, referral_signup_id, reward_type, applied_at, expires_at)
       VALUES ($1, $2, 'pro_trader_month', NOW(), $3)`,
      [workspaceId, referral.id, expiresAt]
    );

    // Record reward for referrer
    await q(
      `INSERT INTO referral_rewards (workspace_id, referral_signup_id, reward_type, applied_at, expires_at)
       VALUES ($1, $2, 'pro_trader_month', NOW(), $3)`,
      [referral.referrer_workspace_id, referral.id, expiresAt]
    );

    // Update referral status to rewarded
    await q(
      `UPDATE referral_signups SET status = 'rewarded', reward_applied_at = NOW() WHERE id = $1`,
      [referral.id]
    );

    // Temporarily upgrade both users to Pro Trader
    // The referrer gets Pro Trader for 1 month (or extends if already Pro Trader)
    await q(
      `UPDATE user_subscriptions 
       SET tier = 'pro_trader', 
           referral_bonus_expires = $2,
           updated_at = NOW()
       WHERE workspace_id = $1 AND (tier != 'pro_trader' OR referral_bonus_expires IS NULL)`,
      [referral.referrer_workspace_id, expiresAt]
    );

    console.log(`[Referral] ✅ Reward applied! Both ${email} and referrer get Pro Trader until ${expiresAt.toISOString()}`);

  } catch (error) {
    console.error('[Referral] Error processing reward:', error);
    // Don't throw - referral failures shouldn't break subscription processing
  }
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
          const workspaceId = hashWorkspaceId(customer.id);
          
          await upsertSubscription(
            customer.id,
            customer.email || '',
            tier,
            subscription.status,
            subscription.id,
            new Date((subscription as any).current_period_end * 1000),
            subscription.status === 'trialing'
          );

          // Check for referral code in metadata and record the referral
          const referralCode = session.metadata?.referralCode;
          if (referralCode) {
            try {
              // Find the referrer
              const referrerResult = await q(
                `SELECT workspace_id FROM referrals WHERE referral_code = $1`,
                [referralCode.toUpperCase()]
              );

              if (referrerResult.length > 0 && referrerResult[0].workspace_id !== workspaceId) {
                // Record the referral signup
                await q(
                  `INSERT INTO referral_signups 
                   (referrer_workspace_id, referee_workspace_id, referee_email, referral_code, status, created_at)
                   VALUES ($1, $2, $3, $4, 'pending', NOW())
                   ON CONFLICT (referee_workspace_id) DO NOTHING`,
                  [referrerResult[0].workspace_id, workspaceId, customer.email, referralCode.toUpperCase()]
                );
                console.log(`[Webhook] Recorded referral: ${customer.email} referred by code ${referralCode}`);
              }
            } catch (refError) {
              console.error('[Webhook] Error recording referral:', refError);
            }
          }

          // Process referral reward if subscription is active
          if (subscription.status === 'active') {
            await processReferralReward(workspaceId, customer.email || '');
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer;
        const priceId = subscription.items.data[0]?.price.id || '';
        const tier = getTierFromPriceId(priceId);
        const workspaceId = hashWorkspaceId(customer.id);
        
        await upsertSubscription(
          customer.id,
          customer.email || '',
          tier,
          subscription.status,
          subscription.id,
          new Date((subscription as any).current_period_end * 1000),
          subscription.status === 'trialing'
        );

        // Process referral reward on new paid subscription
        if (event.type === 'customer.subscription.created' && subscription.status === 'active') {
          await processReferralReward(workspaceId, customer.email || '');
        }
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
