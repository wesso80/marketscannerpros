import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { getClientIP } from '@/lib/rateLimit';
import { createRateLimiter } from '@/lib/rateLimit';
import crypto from 'crypto';

const clickLimiter = createRateLimiter('referral-click', {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,                   // 10 clicks per IP per hour
});

/**
 * POST /api/referral/track
 * Records an anonymised click when someone visits /pricing?ref=CODE
 */
export async function POST(req: NextRequest) {
  try {
    const { referralCode } = await req.json();
    if (!referralCode || typeof referralCode !== 'string') {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const code = referralCode.toUpperCase().slice(0, 16);

    // Validate code exists
    const exists = await q(
      `SELECT 1 FROM referrals WHERE referral_code = $1 LIMIT 1`,
      [code]
    );
    if (exists.length === 0) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const ip = getClientIP(req);
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
    const uaHash = crypto.createHash('sha256')
      .update(req.headers.get('user-agent') || '')
      .digest('hex');

    // Rate limit per IP
    const rl = clickLimiter.check(ipHash);
    if (!rl.allowed) {
      return NextResponse.json({ ok: true }); // Silent — don't reveal rate limiting
    }

    // Dedupe: max 1 click per IP per code per hour
    const recent = await q(
      `SELECT 1 FROM referral_clicks
       WHERE referral_code = $1 AND ip_hash = $2 AND created_at > NOW() - INTERVAL '1 hour'
       LIMIT 1`,
      [code, ipHash]
    );
    if (recent.length > 0) {
      return NextResponse.json({ ok: true });
    }

    await q(
      `INSERT INTO referral_clicks (referral_code, ip_hash, user_agent_hash)
       VALUES ($1, $2, $3)`,
      [code, ipHash, uaHash]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Referral Track] Error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
