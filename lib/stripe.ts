import Stripe from "stripe";

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  throw new Error("STRIPE_SECRET_KEY is missing");
}

export const stripe = new Stripe(secret, {
  apiVersion: undefined,
});

export const PRICE_IDS = {
  pro: process.env.STRIPE_PRICE_PRO ?? process.env.NEXT_PUBLIC_PRICE_PRO,
  pro_trader:
    process.env.STRIPE_PRICE_PRO_TRADER ??
    process.env.NEXT_PUBLIC_PRICE_PRO_TRADER,
};

export function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.VERCEL_URL ?? ""}`;
}
