import { safeNext } from '@/lib/free/safeNext';
import { NextRequest, NextResponse } from "next/server";
import { signSessionToken } from "@/lib/auth";
import { sendSignInEmail } from "@/lib/email";
import { createRateLimiter, getClientIP } from "@/lib/rateLimit";
import { APP_URL } from "@/lib/appUrl";
import { claimMagicLinkEmailCooldown, releaseMagicLinkEmailCooldown } from "@/lib/magicLinkCooldown";
import { maskEmail } from "@/lib/maskEmail";

const magicLinkLimiter = createRateLimiter("magic-link", {
  windowMs: 60 * 1000,
  max: 5,
});

export function signInCooldownMessage(email: string): string {
  return `We sent a sign-in link to ${maskEmail(email)}. Check your spam folder, then try again in a minute.`;
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  const rateCheck = magicLinkLimiter.check(ip);

  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a minute.", retryAfter: rateCheck.retryAfter },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter ?? 60) } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    const cooldown = claimMagicLinkEmailCooldown(email);
    if (!cooldown.allowed) {
      return NextResponse.json(
        { error: signInCooldownMessage(email) },
        { status: 429, headers: { "Retry-After": String(cooldown.retryAfterSec) } },
      );
    }

    try {
      const exp = Math.floor(Date.now() / 1000) + 60 * 15;
      const token = signSessionToken({
        purpose: "magic_login",
        email,
        exp,
      });

      // Use APP_URL constant – req.nextUrl.origin resolves to 0.0.0.0:10000 on Render
      const origin = APP_URL || req.nextUrl.origin;
      const next = safeNext(body.next);
      const verifyUrl = `${origin}/auth/verify?token=${encodeURIComponent(token)}${next ? `&next=${encodeURIComponent(next)}` : ''}`;

      await sendSignInEmail({ to: email, verifyUrl });
    } catch (error) {
      releaseMagicLinkEmailCooldown(email);
      console.error("Magic link send failed:", error instanceof Error ? error.message : "send failed");
      return NextResponse.json({ error: "Failed to send sign-in link." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Secure sign-in link sent. Check your inbox and spam/promotions folders.",
    });
  } catch (error) {
    console.error("Magic link send failed:", error instanceof Error ? error.message : "send failed");
    return NextResponse.json({ error: "Failed to send sign-in link." }, { status: 500 });
  }
}
