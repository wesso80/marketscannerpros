import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY");

// Use SDK default version to satisfy TS literal type
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export function appBaseUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "";
  return base.startsWith("http") ? base : `https://${base}`;
}

export const PRICE_IDS = {
  pro: process.env.STRIPE_PRICE_PRO!,
} as const;
