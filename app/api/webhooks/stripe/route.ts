import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { q } from '@/lib/db';
import { hashWorkspaceId } from '@/lib/auth';
import { sendWelcomeEmail } from '@/lib/email';
import { checkContestEntry } from '@/lib/referralContest';

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
// Referee gets $20 off via Stripe coupon at checkout (already applied).
// Referrer gets $20 Stripe balance credit here.
const REFERRAL_CREDIT_CENTS = parseInt(process.env.REFERRAL_CREDIT_CENTS || '2000', 10);
const REFERRAL_MONTHLY_CAP = 20;

async function processReferralReward(workspaceId: string, email: string, stripeCustomerId: string) {
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
    console.log(`[Referral] Found pending referral for ${email}, processing referrer reward...`);

    // Anti-abuse: monthly cap per referrer
    const monthlyRewards = await q(
      `SELECT COUNT(*)::int AS cnt FROM referral_rewards
       WHERE workspace_id = $1 AND applied_at >= date_trunc('month', NOW())`,
      [referral.referrer_workspace_id]
    );
    if ((monthlyRewards[0]?.cnt || 0) >= REFERRAL_MONTHLY_CAP) {
      console.warn(`[Referral] Monthly cap (${REFERRAL_MONTHLY_CAP}) reached for referrer ${referral.referrer_workspace_id.slice(0, 8)}`);
      return;
    }

    // Referee already received $20 off via checkout coupon — record it as a reward
    await q(
      `INSERT INTO referral_rewards (workspace_id, referral_signup_id, reward_type, credit_amount_cents, stripe_balance_txn_id, applied_at)
       VALUES ($1, $2, 'coupon_20', $3, 'checkout_coupon', NOW())
       ON CONFLICT DO NOTHING`,
      [workspaceId, referral.id, REFERRAL_CREDIT_CENTS]
    );

    // Credit the REFERRER — look up their Stripe customer ID
    const referrerSub = await q(
      `SELECT stripe_customer_id FROM user_subscriptions WHERE workspace_id = $1 LIMIT 1`,
      [referral.referrer_workspace_id]
    );
    if (referrerSub.length > 0 && referrerSub[0].stripe_customer_id) {
      const referrerTxn = await stripe.customers.createBalanceTransaction(
        referrerSub[0].stripe_customer_id,
        {
          amount: -REFERRAL_CREDIT_CENTS,
          currency: 'usd',
          description: `Referral reward: you invited ${email}`,
        }
      );
      await q(
        `INSERT INTO referral_rewards (workspace_id, referral_signup_id, reward_type, credit_amount_cents, stripe_balance_txn_id, applied_at)
         VALUES ($1, $2, 'credit_20', $3, $4, NOW())`,
        [referral.referrer_workspace_id, referral.id, REFERRAL_CREDIT_CENTS, referrerTxn.id]
      );
    }

    // Update referral status to rewarded
    await q(
      `UPDATE referral_signups SET status = 'rewarded', reward_applied_at = NOW(), converted_at = NOW() WHERE id = $1`,
      [referral.id]
    );

    // Check if referrer earned a contest entry (every 5 referrals)
    await checkContestEntry(referral.referrer_workspace_id);

    console.log(`[Referral] ✅ Referee ${email} got coupon at checkout, referrer credited $${REFERRAL_CREDIT_CENTS / 100}`);

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
            await processReferralReward(workspaceId, customer.email || '', customer.id);
          }

          // Send welcome email to new paid subscribers
          if (customer.email && (tier === 'pro' || tier === 'pro_trader')) {
            try {
              await sendWelcomeEmail(customer.email, tier);
              console.log(`[Webhook] Welcome email sent to ${customer.email} (${tier})`);
            } catch (emailErr) {
              console.error('[Webhook] Welcome email failed (non-blocking):', emailErr);
            }
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
          await processReferralReward(workspaceId, customer.email || '', customer.id);
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
