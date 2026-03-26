/**
 * Centralized pricing configuration.
 * Single source of truth for all plan prices displayed in the UI.
 * Update these values when Stripe prices change.
 */
export const PLAN_PRICES = {
  pro: {
    monthly: '$25',
    yearly: '$225',
    monthlyRaw: 25,
    yearlyRaw: 225,
    yearlySavings: 'Save $75/yr',
  },
  pro_trader: {
    monthly: '$50',
    yearly: '$550',
    monthlyRaw: 50,
    yearlyRaw: 550,
    yearlySavings: '1 month free',
  },
} as const;
