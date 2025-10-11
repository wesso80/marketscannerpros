import { NextResponse } from "next/server";
import { getEffectiveTier } from "@/lib/db";
import { verify } from "@/lib/signer";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wid = searchParams.get("wid") || "";
    const sig = searchParams.get("sig") || "";
    
    if (!wid) {
      return NextResponse.json({ error: "Missing wid" }, { status: 400 });
    }
    
    if (!verify(wid, sig)) {
      return NextResponse.json({ error: "Bad signature" }, { status: 401 });
    }
    
    // If payments disabled, everyone gets pro_trader for free
    if (process.env.ENABLE_PAYMENTS !== 'true') {
      return NextResponse.json({ wid, tier: 'pro_trader' });
    }
    
    const tier = await getEffectiveTier(wid);
    return NextResponse.json({ wid, tier });
  } catch (e: any) {
    console.error("Subscription status error:", e);
    return NextResponse.json({ error: e.message || "failed" }, { status: 500 });
  }
}
