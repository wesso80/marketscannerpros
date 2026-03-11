// app/api/auth/admin-login/route.ts
// Direct login for admin emails only — no magic link required.
// Requires ADMIN_LOGIN_SECRET env var as passphrase.
import { NextRequest, NextResponse } from "next/server";
import { hashWorkspaceId, signToken } from "@/lib/auth";
import { q } from "@/lib/db";
import crypto from "crypto";

const ADMIN_EMAILS = [
  "xxneutronxx@yahoo.com",
  "bradleywessling@yahoo.com.au",
];

function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

async function trackSubscription(
  workspaceId: string,
  email: string,
  tier: string,
  status: string,
) {
  try {
    await q(`
      INSERT INTO user_subscriptions 
        (workspace_id, email, tier, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (workspace_id) 
      DO UPDATE SET 
        email = EXCLUDED.email,
        tier = EXCLUDED.tier,
        status = EXCLUDED.status,
        updated_at = NOW()
    `, [workspaceId, email, tier, status]);
  } catch (error: any) {
    if (!error?.message?.includes('does not exist')) {
      console.error("Track subscription error:", error);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
    const passphrase = typeof body?.passphrase === "string" ? body.passphrase : "";

    if (!email || !passphrase) {
      return NextResponse.json({ error: "Missing credentials." }, { status: 400 });
    }

    // Only admin emails allowed
    if (!isAdminEmail(email)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    // Verify passphrase against env var
    const secret = process.env.ADMIN_LOGIN_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Admin login not configured." }, { status: 500 });
    }

    // Timing-safe comparison
    const inputBuf = Buffer.from(passphrase, "utf8");
    const secretBuf = Buffer.from(secret, "utf8");
    if (inputBuf.length !== secretBuf.length || !crypto.timingSafeEqual(inputBuf, secretBuf)) {
      return NextResponse.json({ error: "Invalid passphrase." }, { status: 403 });
    }

    // Issue 365-day pro_trader session
    const workspaceId = hashWorkspaceId(`admin_${email}`);
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
    const token = signToken({ cid: `admin_${email}`, tier: "pro_trader", workspaceId, exp });

    await trackSubscription(workspaceId, email, "pro_trader", "active");

    const host = req.headers.get("host") || "";
    const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");

    const cookieOptions = isLocalhost
      ? { httpOnly: true, secure: false, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 365 }
      : { httpOnly: true, secure: true, sameSite: "lax" as const, domain: ".marketscannerpros.app", path: "/", maxAge: 60 * 60 * 24 * 365 };

    const res = NextResponse.json({
      ok: true,
      tier: "pro_trader",
      workspaceId,
      message: "Admin session activated (365 days).",
    });
    res.cookies.set("ms_auth", token, cookieOptions);
    return res;
  } catch (err) {
    console.error("Admin login error:", err);
    return NextResponse.json({ error: "Authentication failed." }, { status: 500 });
  }
}
