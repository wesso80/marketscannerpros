import { NextRequest, NextResponse } from "next/server";
import { verifyBearer } from "@/lib/jwt";
import { isFreeForAllMode } from "@/lib/entitlements";

// Response type
type Ent = {
  tier: "free" | "pro" | "pro_trader";
  status: "active" | "expired";
  source?: "revenuecat" | "override" | "database" | "free_mode";
  expiresAt?: string | null;
};

// Ask RevenueCat for this user's entitlements
async function rcEntitlements(appUserId: string): Promise<Ent | null> {
  try {
    const key = process.env.REVENUECAT_SECRET_API_KEY;
    if (!key || !appUserId) return null;

    const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!r.ok) return null;

    const j = await r.json();
    const proTraderEnt = j?.subscriber?.entitlements?.["pro_trader"];
    const proEnt = j?.subscriber?.entitlements?.["pro"];
    const ent = proTraderEnt || proEnt;
    if (!ent) return null;

    const exp = ent.expires_date ? Date.parse(ent.expires_date) : 0;
    const active = exp > Date.now();
    return {
      tier: proTraderEnt ? "pro_trader" : "pro",
      status: active ? "active" : "expired",
      source: "revenuecat",
      expiresAt: ent.expires_date ?? null,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const freeForAll = isFreeForAllMode();
    if (freeForAll) {
      return NextResponse.json({ 
        tier: "pro_trader", 
        status: "active", 
        source: "free_mode",
        expiresAt: null 
      });
    }

    const auth = req.headers.get("authorization") ?? "";
    const claims = await verifyBearer(auth);

    // ===== TEMP PRO OVERRIDE (for specific emails) =====
    const raw = process.env.PRO_OVERRIDE_EMAILS || "";
    const overrides = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const claimEmail = String((claims?.email ?? claims?.userId) || "").toLowerCase();
    if (claimEmail && overrides.includes(claimEmail)) {
      return NextResponse.json({ tier: "pro", status: "active", source: "override" });
    }
    // ===== END TEMP PRO OVERRIDE =====

    // No token/claims → Free
    const userId = String(claims?.userId ?? claims?.email ?? "");
    if (!userId) {
      return NextResponse.json({ tier: "free", status: "active" });
    }

    // Ask RevenueCat
    const rc = await rcEntitlements(userId);
    if (rc && rc.status === "active") {
      return NextResponse.json(rc);
    }

    // TODO: Check database entitlements table

    return NextResponse.json({ tier: "free", status: "active" });
  } catch (err) {
    console.error('[entitlements] Failed to resolve tier — defaulting to free:', err);
    return NextResponse.json({ tier: "free", status: "active" });
  }
}
