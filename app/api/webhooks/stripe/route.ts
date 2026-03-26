import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { q } from '@/lib/db';
import { hashWorkspaceId } from '@/lib/auth';
import { sendWelcomeEmail } from '@/lib/email';
import { checkContestEntry } from '@/lib/referralContest';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

// Health check — verify endpoint is reachable
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

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
// Plan-based referral credits: $5 for Pro, $10 for Pro Trader
// Non-trial: referee gets discount via Stripe coupon at checkout (already applied), referrer gets matching balance credit.
// Trial conversion: both referee and referrer get balance credit.
const REFERRAL_CREDIT_BY_TIER: Record<string, number> = {
  pro: 500,        // $5
  pro_trader: 1000, // $10
};
const REFERRAL_MONTHLY_CAP = 20;

function getReferralCreditCents(tier: string): number {
  return REFERRAL_CREDIT_BY_TIER[tier] || 500;
}

async function processReferralReward(
  workspaceId: string,
  email: string,
  stripeCustomerId: string,
  refereeCouponApplied: boolean = false,
  refereeTier: string = 'pro'
) {
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
    console.log(`[Referral] Found pending referral for ${email}, couponApplied=${refereeCouponApplied}`);

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

    const creditCents = getReferralCreditCents(refereeTier);

    if (refereeCouponApplied) {
      // Referee already received discount via checkout coupon — just record it
      await q(
        `INSERT INTO referral_rewards (workspace_id, referral_signup_id, reward_type, credit_amount_cents, stripe_balance_txn_id, applied_at)
         VALUES ($1, $2, 'coupon', $3, 'checkout_coupon', NOW())
         ON CONFLICT DO NOTHING`,
        [workspaceId, referral.id, creditCents]
      );
    } else {
      // Trial conversion — referee needs balance credit (no coupon was applied)
      const refereeTxn = await stripe.customers.createBalanceTransaction(stripeCustomerId, {
        amount: -creditCents,
        currency: 'usd',
        description: `Referral welcome credit — $${creditCents / 100} off your next invoice`,
      });
      await q(
        `INSERT INTO referral_rewards (workspace_id, referral_signup_id, reward_type, credit_amount_cents, stripe_balance_txn_id, applied_at)
         VALUES ($1, $2, 'credit', $3, $4, NOW())`,
        [workspaceId, referral.id, creditCents, refereeTxn.id]
      );
    }

    // Credit the REFERRER — look up their Stripe customer ID
    const referrerSub = await q(
      `SELECT stripe_customer_id FROM user_subscriptions WHERE workspace_id = $1 LIMIT 1`,
      [referral.referrer_workspace_id]
    );
    if (referrerSub.length > 0 && referrerSub[0].stripe_customer_id) {
      const referrerTxn = await stripe.customers.createBalanceTransaction(
        referrerSub[0].stripe_customer_id,
        {
          amount: -creditCents,
          currency: 'usd',
          description: `Referral reward: you invited ${email}`,
        }
      );
      await q(
        `INSERT INTO referral_rewards (workspace_id, referral_signup_id, reward_type, credit_amount_cents, stripe_balance_txn_id, applied_at)
         VALUES ($1, $2, 'credit', $3, $4, NOW())`,
        [referral.referrer_workspace_id, referral.id, creditCents, referrerTxn.id]
      );
    }

    // Update referral status to rewarded
    await q(
      `UPDATE referral_signups SET status = 'rewarded', reward_applied_at = NOW(), converted_at = NOW() WHERE id = $1`,
      [referral.id]
    );

    // Check if referrer earned a contest entry (every 5 referrals)
    await checkContestEntry(referral.referrer_workspace_id);

    console.log(`[Referral] ✅ Referee ${email} (${refereeTier}) — referrer credited $${creditCents / 100}`);

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
  const workspaceId = hashWorkspaceId(email.toLowerCase().trim());
  
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
    console.error('[Webhook] Missing stripe-signature header');
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  if (!webhookSecret) {
    console.error('[Webhook] STRIPE_WEBHOOK_SECRET env var is not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
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
          const workspaceId = hashWorkspaceId((customer.email || '').toLowerCase().trim());
          
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

          // Process referral reward if subscription is active (not trialing)
          // Coupon was applied at checkout, so refereeCouponApplied = true
          if (subscription.status === 'active') {
            await processReferralReward(workspaceId, customer.email || '', customer.id, true, tier);
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
        const workspaceId = hashWorkspaceId((customer.email || '').toLowerCase().trim());
        
        await upsertSubscription(
          customer.id,
          customer.email || '',
          tier,
          subscription.status,
          subscription.id,
          new Date((subscription as any).current_period_end * 1000),
          subscription.status === 'trialing'
        );

        // Process referral reward on new paid subscription or trial→active conversion
        if (subscription.status === 'active') {
          // On subscription.updated (trial→active), referee didn't get coupon — give balance credit
          // On subscription.created with active status, coupon was applied at checkout
          const couponApplied = event.type === 'customer.subscription.created';
          await processReferralReward(workspaceId, customer.email || '', customer.id, couponApplied, tier);
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
          const workspaceId = hashWorkspaceId((customer.email || '').toLowerCase().trim());
          
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
