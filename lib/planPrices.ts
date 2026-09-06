/**
 * Centralized pricing configuration.
 * Single source of truth for all plan prices displayed in the UI.
 *
 * As of the 2026 pricing simplification there is exactly ONE paid plan: Pro.
 * The `pro_trader` block is retained (aliased to Pro) only so any UI or Stripe
 * record that still passes the legacy identifier continues to render correctly.
 * All new UI should read `PLAN_PRICES.pro`.
 */
export const PLAN_PRICES = {
  pro: {
    monthly: '$24.99',
    yearly: '$249',
    monthlyRaw: 24.99,
    yearlyRaw: 249,
    // $24.99 × 12 = $299.88 → ~$50 savings ≈ 2 months free
    yearlySavings: '~2 months free',
  },
  // Legacy alias — treated identically to Pro so existing subscribers and any
  // stale UI paths that still reference `pro_trader` show the same $24.99 plan.
  pro_trader: {
    monthly: '$24.99',
    yearly: '$249',
    monthlyRaw: 24.99,
    yearlyRaw: 249,
    yearlySavings: '~2 months free',
  },
} as const;
