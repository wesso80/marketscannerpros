import Stripe from "stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY;

export async function userHasPaidPlan(userEmail: string) {
  if (!stripeKey) return false;

  // Match the same API version used in your other routes
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
  const customer = customers.data[0];
  if (!customer) return false;

  const subs = await stripe.subscriptions.list({
    customer: customer.id,
    status: "active",
    limit: 1,
  });

  return subs.data.length > 0;
}
