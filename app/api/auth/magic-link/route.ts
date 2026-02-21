import { NextRequest, NextResponse } from "next/server";
import { signToken } from "@/lib/auth";
import { sendAlertEmail } from "@/lib/email";
import { createRateLimiter, getClientIP } from "@/lib/rateLimit";
import { APP_URL } from "@/lib/appUrl";

const magicLinkLimiter = createRateLimiter("magic-link", {
  windowMs: 60 * 1000,
  max: 5,
});

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

    const exp = Math.floor(Date.now() / 1000) + 60 * 15;
    const token = signToken({
      purpose: "magic_login",
      email,
      exp,
    });

    // Use APP_URL constant – req.nextUrl.origin resolves to 0.0.0.0:10000 on Render
    const origin = APP_URL || req.nextUrl.origin;
    const verifyUrl = `${origin}/auth/verify?token=${encodeURIComponent(token)}`;

    const subject = "Your secure MarketScannerPros sign-in link";
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#070B14; color:#e5e7eb; padding:24px;">
        <div style="max-width:520px; margin:0 auto; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); border-radius:16px; padding:24px;">
          <div style="font-size:28px; margin-bottom:10px;">🔐</div>
          <h1 style="margin:0 0 8px 0; font-size:20px; color:#ffffff;">Sign in to MarketScannerPros</h1>
          <p style="margin:0 0 18px 0; font-size:14px; color:#cbd5e1;">Use this secure link to access your account. This link expires in 15 minutes.</p>
          <a href="${verifyUrl}" style="display:inline-block; background:rgba(16,185,129,0.2); color:#bbf7d0; border:1px solid rgba(74,222,128,0.35); border-radius:12px; padding:12px 16px; text-decoration:none; font-weight:600;">Sign In Securely</a>
          <p style="margin-top:16px; font-size:12px; color:#94a3b8; word-break:break-all;">If the button does not work, paste this URL into your browser:<br/>${verifyUrl}</p>
          <p style="margin-top:16px; font-size:12px; color:#64748b;">If you did not request this email, you can ignore it.</p>
        </div>
      </div>
    `;

    await sendAlertEmail({ to: email, subject, html });

    return NextResponse.json({
      ok: true,
      message: "Secure sign-in link sent. Check your inbox and spam/promotions folders.",
    });
  } catch (error) {
    console.error("Magic link send failed:", error);
    return NextResponse.json({ error: "Failed to send sign-in link." }, { status: 500 });
  }
}
