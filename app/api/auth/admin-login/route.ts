// app/api/auth/admin-login/route.ts
// Direct login for admin emails only — no magic link required.
// Requires ADMIN_LOGIN_SECRET env var as passphrase.
import { NextRequest, NextResponse } from "next/server";
import { hashWorkspaceId, signSessionToken } from "@/lib/auth";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken, getAdminSessionCookieOptions } from '@/lib/adminAuth';
import { q } from "@/lib/db";
import crypto from "crypto";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

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
    const token = signSessionToken({ cid: `admin_${email}`, tier: "pro_trader", workspaceId, exp });

    await trackSubscription(workspaceId, email, "pro_trader", "active");

    // Ensure workspace row exists (needed for FK references in referrals, etc.)
    try {
      await q(`
        INSERT INTO workspaces (id, stripe_customer_id, email, created_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (id) DO NOTHING
      `, [workspaceId, `admin_${email}`, email]);
    } catch (e: any) {
      // Non-fatal — table may not exist yet
      if (!e?.message?.includes('does not exist')) {
        console.error('Workspace upsert error:', e);
      }
    }

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
    res.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(`admin_${email}`), getAdminSessionCookieOptions(req));
    return res;
  } catch (err) {
    console.error("Admin login error:", err);
    return NextResponse.json({ error: "Authentication failed." }, { status: 500 });
  }
}
