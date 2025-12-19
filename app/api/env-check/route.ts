import { NextResponse } from "next/server";

export function GET() {
  const has = (k: string) => Boolean(process.env[k]);
  return NextResponse.json({
    STRIPE_SECRET_KEY: has("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: has("STRIPE_WEBHOOK_SECRET"),
    APP_SIGNING_SECRET: has("APP_SIGNING_SECRET"),
    OPENAI_API_KEY: has("OPENAI_API_KEY"),
    DATABASE_URL: has("DATABASE_URL"),
    POSTGRES_URL: has("POSTGRES_URL"),
    FREE_FOR_ALL_MODE: process.env.FREE_FOR_ALL_MODE || null,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || null,
    NEXT_PUBLIC_PRICE_PRO: process.env.NEXT_PUBLIC_PRICE_PRO || null,
    NEXT_PUBLIC_PRICE_PRO_TRADER: process.env.NEXT_PUBLIC_PRICE_PRO_TRADER || null,
  });
}
