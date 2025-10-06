import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const pro = process.env.STRIPE_PRO_PRICE_ID || "";
  const proTrader = process.env.STRIPE_PROTRADER_PRICE_ID || "";
  const looksPro = pro.startsWith("price_");
  const looksProTrader = proTrader.startsWith("price_");
  return NextResponse.json({
    ok: true,
    prices: { pro: looksPro, proTrader: looksProTrader },
  });
}
