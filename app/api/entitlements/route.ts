import { NextRequest, NextResponse } from "next/server";
import { verifyBearer } from "@/lib/jwt";

// Response type
type Ent = {
  tier: "free" | "pro";
  status: "active" | "expired";
  source?: "revenuecat" | "override" | "database";
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
    const ent = j?.subscriber?.entitlements?.["pro"];
    if (!ent) return null;

    const exp = ent.expires_date ? Date.parse(ent.expires_date) : 0;
    const active = exp > Date.now();
    return {
      tier: "pro",
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
    // ===== TEMPORARY: EVERYONE GETS PRO FOR FREE =====
    // This keeps everything free until you're ready to enable payments
    // Set FREE_FOR_ALL_MODE=false in env to disable
    const freeForAll = process.env.FREE_FOR_ALL_MODE !== "false"; // defaults to true
    if (freeForAll) {
      return NextResponse.json({ 
        tier: "pro", 
        status: "active", 
        source: "free_mode",
        expiresAt: null 
      });
    }
    // ===== END TEMPORARY FREE MODE =====

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
    if (rc && rc.status === "active" && rc.tier === "pro") {
      return NextResponse.json(rc);
    }

    // TODO: Check database entitlements table

    return NextResponse.json({ tier: "free", status: "active" });
  } catch {
    return NextResponse.json({ tier: "free", status: "active" });
  }
}
