import { NextResponse } from "next/server";

export function GET() {
  const has = (k: string) => Boolean(process.env[k]);
  return NextResponse.json({
    STRIPE_SECRET_KEY: has("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: has("STRIPE_WEBHOOK_SECRET"),
    APP_SIGNING_SECRET: has("APP_SIGNING_SECRET"),
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || null,
    NEXT_PUBLIC_PRICE_PRO: process.env.NEXT_PUBLIC_PRICE_PRO || null,
    NEXT_PUBLIC_PRICE_PRO_TRADER: process.env.NEXT_PUBLIC_PRICE_PRO_TRADER || null,
  });
}
