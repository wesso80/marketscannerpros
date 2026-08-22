import { NextResponse } from "next/server";
import { getFreeForAllPromo } from "@/lib/entitlements";

// Public status for the free-for-all promotion. Returns only whether the promo
// is active and when it ends — no session data, scores, or internal fields.
export const dynamic = "force-dynamic";

export async function GET() {
  const promo = getFreeForAllPromo();
  return NextResponse.json(promo, {
    headers: { "Cache-Control": "no-store" },
  });
}
