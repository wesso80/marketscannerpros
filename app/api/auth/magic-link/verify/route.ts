import { NextRequest, NextResponse } from "next/server";
import { verifyToken, signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : "";

    if (!token) {
      return NextResponse.json({ error: "Missing token." }, { status: 400 });
    }

    const payload = verifyToken(token) as { purpose?: string; email?: string };
    if (payload?.purpose !== "magic_login" || !payload?.email) {
      return NextResponse.json({ error: "Invalid sign-in link." }, { status: 400 });
    }

    // Issue a short-lived login nonce (2 min) that proves the magic link was verified.
    // The /api/auth/login endpoint requires this nonce — it can no longer be called with just an email.
    const loginNonce = signToken({
      purpose: "login_nonce",
      email: payload.email,
      exp: Math.floor(Date.now() / 1000) + 120, // 2 minutes
    });

    return NextResponse.json({ ok: true, email: payload.email, loginNonce });
  } catch {
    return NextResponse.json({ error: "Sign-in link is invalid or expired." }, { status: 400 });
  }
}
