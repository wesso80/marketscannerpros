/** Stripe Customer ids only. Session ids such as admin_email are not customers. */
export const STRIPE_CUSTOMER_ID = /^cus_[A-Za-z0-9]+$/;

export const NO_BILLING_ACCOUNT_MESSAGE =
  "There's no billing account on this login yet. Pro access here isn't billed through Stripe.";

export function isStripeCustomerId(value: string | null | undefined): value is string {
  return typeof value === 'string' && STRIPE_CUSTOMER_ID.test(value);
}
