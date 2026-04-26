/**
 * POST /api/admin/sync-stripe — Pull all active subscriptions from Stripe and upsert into DB
 * 
 * Fixes missed webhook events by directly querying Stripe's subscription list.
 * Admin-only endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { stripe } from '@/lib/stripe';
import { hashWorkspaceId } from '@/lib/auth';
import { q } from '@/lib/db';
import type Stripe from 'stripe';

export const runtime = 'nodejs';

// Price ID mappings (same as webhook)
const PRO_PRICE_IDS = [
  process.env.STRIPE_PRICE_PRO_MONTHLY || '',
  process.env.STRIPE_PRICE_PRO_YEARLY || '',
].filter(Boolean);
const PRO_TRADER_PRICE_IDS = [
  process.env.STRIPE_PRICE_PRO_TRADER_MONTHLY || '',
  process.env.STRIPE_PRICE_PRO_TRADER_YEARLY || '',
].filter(Boolean);

function getTierFromPriceId(priceId: string): 'pro' | 'pro_trader' | 'free' {
  if (PRO_TRADER_PRICE_IDS.includes(priceId)) return 'pro_trader';
  if (PRO_PRICE_IDS.includes(priceId)) return 'pro';
  return 'free';
}

function getTierFromProductName(name: string): 'pro' | 'pro_trader' | 'free' {
  const lower = name.toLowerCase();
  if (lower.includes('pro trader')) return 'pro_trader';
  if (lower.includes('pro')) return 'pro';
  return 'free';
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const synced: { email: string; tier: string; status: string }[] = [];
    const errors: string[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    // Pull ALL subscriptions from Stripe (active, trialing, past_due)
    while (hasMore) {
      const params: Stripe.SubscriptionListParams = {
        limit: 100,
        expand: ['data.customer'],
      };
      if (startingAfter) params.starting_after = startingAfter;

      const list = await stripe.subscriptions.list(params);

      for (const sub of list.data) {
        try {
          const customer = sub.customer as Stripe.Customer;
          if (!customer?.email) continue;

          const email = customer.email.toLowerCase().trim();
          const priceId = sub.items.data[0]?.price.id || '';
          
          // Try price ID first, fall back to product name
          let tier = getTierFromPriceId(priceId);
          if (tier === 'free' && sub.items.data[0]?.price.product) {
            const prodId = sub.items.data[0].price.product;
            const prodName = typeof prodId === 'string'
              ? (await stripe.products.retrieve(prodId)).name
              : (prodId as Stripe.Product).name;
            tier = getTierFromProductName(prodName);
          }

          const workspaceId = hashWorkspaceId(email);
          const periodEnd = (sub as any).current_period_end
            ? new Date((sub as any).current_period_end * 1000)
            : null;

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
              stripe_customer_id = EXCLUDED.stripe_customer_id,
              current_period_end = EXCLUDED.current_period_end,
              is_trial = EXCLUDED.is_trial,
              updated_at = NOW()
          `, [
            workspaceId, email, tier, sub.status, sub.id, customer.id,
            periodEnd, sub.status === 'trialing',
          ]);

          synced.push({ email, tier, status: sub.status });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(msg);
        }
      }

      hasMore = list.has_more;
      if (list.data.length > 0) {
        startingAfter = list.data[list.data.length - 1].id;
      }
    }

    return NextResponse.json({
      ok: true,
      synced: synced.length,
      subscriptions: synced,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: unknown) {
    console.error('[admin:sync-stripe] Error:', err);
    return NextResponse.json(
      { error: 'Sync failed', detail: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
