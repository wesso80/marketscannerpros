import { safeNext } from '@/lib/free/safeNext';

export type CheckoutBilling = 'monthly' | 'yearly';

/** Pricing path that preserves the chosen Pro billing period. Always same-origin. */
export function checkoutReturnPath(billing: CheckoutBilling): string {
  const path = `/pricing?billing=${billing}&plan=pro`;
  return safeNext(path) ?? '/pricing';
}

/** Sign-in URL whose `next` is the validated pricing return path. */
export function checkoutSignInPath(billing: CheckoutBilling): string {
  return `/auth?next=${encodeURIComponent(checkoutReturnPath(billing))}`;
}

/**
 * After sign-in, resume Pro checkout only for an explicit pricing return.
 * Paid members are left on plan management. An unknown billing value stays monthly.
 */
export function shouldResumeCheckout(search: string, signedIn: boolean, paid: boolean): CheckoutBilling | null {
  if (!signedIn || paid) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (params.get('plan') !== 'pro') return null;
  return params.get('billing') === 'yearly' ? 'yearly' : 'monthly';
}

/** Email or existing Stripe customer from the session id. Anonymous ids are not billable. */
export function checkoutCustomerFromSession(cid: string): { customer?: string; customer_email?: string } | null {
  const prefixed = /^(?:free_|trial_|admin_)(.+@.+)$/i.exec(cid);
  const email = prefixed?.[1] ?? (cid.includes('@') ? cid : null);
  if (email?.includes('@')) return { customer_email: email.toLowerCase() };
  if (cid.startsWith('cus_')) return { customer: cid };
  return null;
}

export function goTo(href: string) {
  window.location.assign(href);
}
