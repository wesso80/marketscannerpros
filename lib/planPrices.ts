/**
 * Centralized pricing configuration.
 * Single source of truth for all plan prices displayed in the UI.
 * Update these values when Stripe prices change.
 *
 * Internal keys remain `pro` / `pro_trader` for Stripe & DB compatibility.
 * User-facing names: Retail / Institutional.
 */
export const PLAN_PRICES = {
  pro: {
    monthly: '$39.99',
    yearly: '$399.99',
    monthlyRaw: 39.99,
    yearlyRaw: 399.99,
    yearlySavings: '2 months free',
    displayName: 'Retail',
    tagline: 'Everything you need to trade confidently',
  },
  pro_trader: {
    monthly: '$89.99',
    yearly: '$899.99',
    monthlyRaw: 89.99,
    yearlyRaw: 899.99,
    yearlySavings: '2 months free',
    displayName: 'Institutional',
    tagline: 'Full decision architecture — no simplification',
  },
} as const;

/** Map internal tier key → user-facing display name */
export function tierDisplayName(tier: string): string {
  if (tier === 'pro_trader') return 'Institutional';
  if (tier === 'pro') return 'Retail';
  if (tier === 'free') return 'Free';
  return tier;
}
