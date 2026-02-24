/**
 * Centralized pricing configuration.
 * Single source of truth for all plan prices displayed in the UI.
 * Update these values when Stripe prices change.
 */
export const PLAN_PRICES = {
  pro: {
    monthly: '$39.99',
    yearly: '$399.99',
    monthlyRaw: 39.99,
    yearlyRaw: 399.99,
    yearlySavings: '2 months free',
  },
  pro_trader: {
    monthly: '$89.99',
    yearly: '$899.99',
    monthlyRaw: 89.99,
    yearlyRaw: 899.99,
    yearlySavings: '2 months free',
  },
} as const;
