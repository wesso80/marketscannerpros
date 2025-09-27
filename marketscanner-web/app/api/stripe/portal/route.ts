import Stripe from "stripe";

export async function POST() {
  const key = process.env.STRIPE_SECRET_KEY;
  const customer = process.env.STRIPE_TEST_CUSTOMER_ID;
  const returnUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!key || !customer) {
    return Response.json(
      { error: "Stripe not configured (missing STRIPE_SECRET_KEY or STRIPE_TEST_CUSTOMER_ID)." },
      { status: 500 }
    );
  }

  const stripe = new Stripe(key, { apiVersion: "2024-06-20" });
  const session = await stripe.billingPortal.sessions.create({
    customer,
    return_url: returnUrl,
  });

  return Response.json({ url: session.url });
}
