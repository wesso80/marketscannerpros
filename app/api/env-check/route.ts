import { NextRequest, NextResponse } from "next/server";

export function GET(req: NextRequest) {
  // Only allow in development or with admin secret
  const isDevMode = process.env.NODE_ENV === 'development';
  const authHeader = req.headers.get('authorization');
  const adminSecret = process.env.ADMIN_SECRET;
  const isAdmin = adminSecret && authHeader === `Bearer ${adminSecret}`;

  if (!isDevMode && !isAdmin) {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const has = (k: string) => Boolean(process.env[k]);
  return NextResponse.json({
    STRIPE_SECRET_KEY: has("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: has("STRIPE_WEBHOOK_SECRET"),
    APP_SIGNING_SECRET: has("APP_SIGNING_SECRET"),
    OPENAI_API_KEY: has("OPENAI_API_KEY"),
    DATABASE_URL: has("DATABASE_URL"),
    POSTGRES_URL: has("POSTGRES_URL"),
    FREE_FOR_ALL_MODE: has("FREE_FOR_ALL_MODE"),
  });
}
