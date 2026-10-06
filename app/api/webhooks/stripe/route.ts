import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { q } from '@/lib/db';
import { hashWorkspaceId } from '@/lib/auth';
import { sendWelcomeEmail } from '@/lib/email';
import { checkContestEntry } from '@/lib/referralContest';
import { invoiceSubscriptionId, subscriptionPeriodDate } from '@/lib/stripeSubscriptionPeriod';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

// Health check — verify endpoint is reachable
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

// Price ID mappings — read from environment variables.
// New (2026 pricing simplification): STRIPE_PRO_MONTHLY_PRICE_ID / STRIPE_PRO_ANNUAL_PRICE_ID.
// Legacy: STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_PRO_YEARLY (retained for existing Pro subs).
// Legacy Pro Trader: STRIPE_PRICE_PRO_TRADER_MONTHLY / STRIPE_PRICE_PRO_TRADER_YEARLY.
// All new subscriptions map to tier "pro". Existing pro_trader subscriptions keep their
// "pro_trader" DB label (which the app treats as fully-paid Pro) so we do not force any
// legacy subscriber to re-subscribe.
const PRO_PRICE_IDS = [
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID || "",
  process.env.STRIPE_PRO_ANNUAL_PRICE_ID || "",
  process.env.STRIPE_PRICE_PRO_MONTHLY || "",
  process.env.STRIPE_PRICE_PRO_YEARLY || "",
].filter(Boolean);
const PRO_TRADER_PRICE_IDS = [
  process.env.STRIPE_PRICE_PRO_TRADER_MONTHLY || "",
  process.env.STRIPE_PRICE_PRO_TRADER_YEARLY || "",
].filter(Boolean);

function getTierFromPriceId(priceId: string): 'pro' | 'pro_trader' | 'free' {
  // Legacy Pro Trader IDs continue to record tier="pro_trader" so existing
  // subscribers keep their historical label. Everything else that matches a
  // known Pro price ID (new or legacy) is recorded as "pro".
  if (PRO_TRADER_PRICE_IDS.includes(priceId)) return 'pro_trader';
  if (PRO_PRICE_IDS.includes(priceId)) return 'pro';
  return 'free';
}

// Referral credit — a single Pro plan is sold, but legacy Pro Trader
// renewals may still trigger webhook events, so the map keeps both keys.
const REFERRAL_CREDIT_BY_TIER: Record<string, number> = {
  pro: 500,         // $5
  pro_trader: 1000, // $10 — legacy only
};
const REFERRAL_MONTHLY_CAP = 20;

function getReferralCreditCents(tier: string): number {
  return REFERRAL_CREDIT_BY_TIER[tier] || 500;
}

function safePeriodEnd(periodEnd: Date | null): Date | null {
  if (periodEnd == null) return null;
  if (!(periodEnd instanceof Date) || Number.isNaN(periodEnd.getTime())) {
    console.error('[Webhook] Refusing invalid current_period_end; storing null');
    return null;
  }
  return periodEnd;
}

type LoadedCustomer = { id: string; email: string };

function loadCustomer(customer: unknown): LoadedCustomer | 'deleted' | 'no-email' {
  if (!customer || typeof customer !== 'object') return 'no-email';
  const record = customer as { id?: unknown; email?: unknown; deleted?: unknown };
  if (record.deleted === true) return 'deleted';
  const email = typeof record.email === 'string' ? record.email.trim() : '';
  const id = typeof record.id === 'string' ? record.id : '';
  if (!email || !id) return 'no-email';
  return { id, email };
}

function skipCustomerWrite(eventType: string, reason: 'deleted' | 'no-email', detail: string): void {
  const why = reason === 'deleted' ? 'Stripe customer is deleted' : 'customer email is empty';
  console.error(`[Webhook] ${eventType}: ${why}; not writing (${detail})`);
}

/** A different subscription must not clobber a live active or trialing row. */
function mayReplaceSubscription(
  existing: { stripe_subscription_id?: string | null; status?: string | null },
  incomingSubscriptionId: string,
): boolean {
  const currentId = typeof existing.stripe_subscription_id === 'string' ? existing.stripe_subscription_id : '';
  if (!currentId || currentId === incomingSubscriptionId) return true;
  const status = existing.status || '';
  return status !== 'active' && status !== 'trialing';
}

const seenSideEffectEventIds = new Set<string>();

function rememberSideEffect(eventId: string): boolean {
  if (seenSideEffectEventIds.has(eventId)) return false;
  seenSideEffectEventIds.add(eventId);
  return true;
}

function isMissingProcessedEventsTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ((error as { code?: unknown }).code === '42P01') return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('stripe_processed_events') && message.toLowerCase().includes('does not exist');
}

/** 'claimed' runs side effects. 'duplicate' skips them. 'untracked' means the gate table is unavailable. */
async function claimSideEffects(eventId: string, eventType: string): Promise<'claimed' | 'duplicate' | 'untracked'> {
  try {
    const rows = await q(
      `INSERT INTO stripe_processed_events (event_id, event_type)
       VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [eventId, eventType],
    );
    return rows.length > 0 ? 'claimed' : 'duplicate';
  } catch (error) {
    if (isMissingProcessedEventsTable(error)) {
      console.error(`[Webhook] stripe_processed_events is not migrated yet; guarding side effects without it (${eventId})`);
    } else {
      console.error(`[Webhook] could not record processed event ${eventId}; guarding side effects without the table`, error);
    }
    return 'untracked';
  }
}

async function runSideEffectsOnce(event: Stripe.Event, work: () => Promise<void>): Promise<void> {
  const gate = await claimSideEffects(event.id, event.type);
  if (gate === 'duplicate') {
    console.error(`[Webhook] ${event.type} ${event.id} already processed; skipping welcome email and referral credit`);
    return;
  }
  if (gate === 'untracked' && !rememberSideEffect(event.id)) {
    console.error(`[Webhook] ${event.type} ${event.id} already handled in this process; skipping side effects`);
    return;
  }
  await work();
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

    // Claim the pending signup before any Stripe credit so a second delivery cannot pay twice.
    const claimed = await q(
      `UPDATE referral_signups
       SET status = 'rewarded', reward_applied_at = NOW(), converted_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [referral.id],
    );
    if (claimed.length === 0) {
      console.error(`[Referral] signup ${referral.id} is no longer pending; not applying credit again`);
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
  const normalizedEmail = email.trim();
  if (!normalizedEmail) {
    console.error('[Webhook] Refusing subscription write with an empty email');
    return;
  }
  const workspaceId = hashWorkspaceId(normalizedEmail.toLowerCase());
  const periodEndValue = safePeriodEnd(periodEnd);

  try {
    const existing = await q<{ stripe_subscription_id: string | null; status: string }>(
      `SELECT stripe_subscription_id, status FROM user_subscriptions WHERE workspace_id = $1 LIMIT 1`,
      [workspaceId],
    );
    if (existing[0] && !mayReplaceSubscription(existing[0], stripeSubscriptionId)) {
      console.error(`[Webhook] Not overwriting ${existing[0].status} subscription ${existing[0].stripe_subscription_id} with ${stripeSubscriptionId} for ${normalizedEmail}`);
      return;
    }

    const written = await q(`
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
      WHERE user_subscriptions.stripe_subscription_id IS NULL
         OR user_subscriptions.stripe_subscription_id = EXCLUDED.stripe_subscription_id
         OR user_subscriptions.status NOT IN ('active', 'trialing')
      RETURNING workspace_id
    `, [workspaceId, normalizedEmail, tier, status, stripeSubscriptionId, customerId, periodEndValue, isTrial]);

    if (written.length === 0) {
      console.error(`[Webhook] Upsert skipped by conflict guard for ${normalizedEmail} (${stripeSubscriptionId})`);
      return;
    }
    console.log(`[Webhook] Upserted subscription: ${normalizedEmail} - ${tier} (${status})`);
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
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const customer = await stripe.customers.retrieve(session.customer as string);
          const loaded = loadCustomer(customer);
          if (loaded === 'deleted' || loaded === 'no-email') {
            skipCustomerWrite(event.type, loaded === 'deleted' ? 'deleted' : 'no-email', subscription.id);
            break;
          }
          const priceId = subscription.items.data[0]?.price.id || '';
          const tier = getTierFromPriceId(priceId);
          const workspaceId = hashWorkspaceId(loaded.email.toLowerCase());
          const periodEnd = subscriptionPeriodDate(subscription, 'current_period_end');
          if (!periodEnd) {
            console.error(`[Webhook] checkout.session.completed subscription ${subscription.id}: current_period_end missing or unusable on items.data[0] and on the subscription; storing null`);
          }
          
          await upsertSubscription(
            loaded.id,
            loaded.email,
            tier,
            subscription.status,
            subscription.id,
            periodEnd,
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
                  [referrerResult[0].workspace_id, workspaceId, loaded.email, referralCode.toUpperCase()]
                );
                console.log(`[Webhook] Recorded referral: ${loaded.email} referred by code ${referralCode}`);
              }
            } catch (refError) {
              console.error('[Webhook] Error recording referral:', refError);
            }
          }

          await runSideEffectsOnce(event, async () => {
            // Coupon was applied at checkout, so refereeCouponApplied = true
            if (subscription.status === 'active') {
              await processReferralReward(workspaceId, loaded.email, loaded.id, true, tier);
            }
            if (tier === 'pro' || tier === 'pro_trader') {
              try {
                await sendWelcomeEmail(loaded.email, tier);
                console.log(`[Webhook] Welcome email sent to ${loaded.email} (${tier})`);
              } catch (emailErr) {
                console.error('[Webhook] Welcome email failed (non-blocking):', emailErr);
              }
            }
          });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const snapshot = event.data.object as Stripe.Subscription;
        // Replay can deliver an old 'active' snapshot after a cancellation. Write the live subscription.
        const subscription = await stripe.subscriptions.retrieve(snapshot.id);
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        const loaded = loadCustomer(customer);
        if (loaded === 'deleted' || loaded === 'no-email') {
          skipCustomerWrite(event.type, loaded === 'deleted' ? 'deleted' : 'no-email', subscription.id);
          break;
        }
        const priceId = subscription.items.data[0]?.price.id || '';
        const tier = getTierFromPriceId(priceId);
        const workspaceId = hashWorkspaceId(loaded.email.toLowerCase());
        const periodEnd = subscriptionPeriodDate(subscription, 'current_period_end');
        if (!periodEnd) {
          console.error(`[Webhook] ${event.type} subscription ${subscription.id}: current_period_end missing or unusable on items.data[0] and on the subscription; storing null`);
        }
        
        await upsertSubscription(
          loaded.id,
          loaded.email,
          tier,
          subscription.status,
          subscription.id,
          periodEnd,
          subscription.status === 'trialing'
        );

        if (subscription.status === 'active') {
          await runSideEffectsOnce(event, async () => {
            // On subscription.updated (trial→active), referee didn't get coupon — give balance credit
            // On subscription.created with active status, coupon was applied at checkout
            const couponApplied = event.type === 'customer.subscription.created';
            await processReferralReward(workspaceId, loaded.email, loaded.id, couponApplied, tier);
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        const loaded = loadCustomer(customer);
        if (loaded === 'deleted' || loaded === 'no-email') {
          skipCustomerWrite(event.type, loaded === 'deleted' ? 'deleted' : 'no-email', subscription.id);
          break;
        }
        
        await upsertSubscription(
          loaded.id,
          loaded.email,
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
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          if (subscription.status !== 'past_due' && subscription.status !== 'unpaid') {
            console.error(`[Webhook] invoice.payment_failed subscription ${subscriptionId} live status is ${subscription.status}; not writing past_due`);
            break;
          }
          const customer = await stripe.customers.retrieve((invoice as any).customer as string);
          const loaded = loadCustomer(customer);
          if (loaded === 'deleted' || loaded === 'no-email') {
            skipCustomerWrite(event.type, loaded === 'deleted' ? 'deleted' : 'no-email', subscriptionId);
            break;
          }
          const workspaceId = hashWorkspaceId(loaded.email.toLowerCase());
          
          await q(`
            UPDATE user_subscriptions 
            SET status = 'past_due', updated_at = NOW()
            WHERE workspace_id = $1
              AND (stripe_subscription_id IS NULL OR stripe_subscription_id = $2)
          `, [workspaceId, subscriptionId]);
          
          console.log(`[Webhook] Marked subscription as past_due: ${loaded.email}`);
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Webhook] Error processing event:', error);
    // Only a deleted-subscription event whose customer is already gone can be
    // acknowledged. Retrying resource_missing never succeeds. Every other failure
    // stays 500 so Stripe retries.
    if (
      event.type === 'customer.subscription.deleted' &&
      error !== null &&
      typeof error === 'object' &&
      (error as { code?: unknown }).code === 'resource_missing'
    ) {
      console.error('[Webhook] customer.subscription.deleted: Stripe resource_missing; acknowledging without retry');
      return NextResponse.json({ received: true });
    }
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
