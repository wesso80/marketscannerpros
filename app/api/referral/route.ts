/**
 * Referral System API
 * 
 * @route GET /api/referral - Get user's referral code and stats
 * @route POST /api/referral - Record a referral signup
 * 
 * How it works:
 * 1. User gets unique referral code (hash of their workspace ID)
 * 2. Friend signs up with referral code in URL (?ref=CODE)
 * 3. When friend completes PAID subscription, both get 1 month Pro Trader free
 * 4. Rewards are applied via Stripe subscription credits/coupons
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import crypto from 'crypto';

const FRIEND_CODE_SALT = process.env.FRIEND_CODE_SALT || 'referral-salt';

// Generate a unique, short referral code from workspace ID
function generateReferralCode(workspaceId: string): string {
  const hash = crypto.createHash('sha256')
    .update(workspaceId + FRIEND_CODE_SALT)
    .digest('hex');
  // Take first 8 chars, uppercase for readability
  return hash.substring(0, 8).toUpperCase();
}

// Validate a referral code and return the referrer's workspace ID
async function validateReferralCode(code: string): Promise<string | null> {
  // Look up who owns this referral code
  const result = await q(
    `SELECT workspace_id FROM referrals WHERE referral_code = $1 LIMIT 1`,
    [code.toUpperCase()]
  );
  
  if (result.length > 0) {
    return result[0].workspace_id;
  }
  return null;
}

// GET: Get user's referral code and stats
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 });
    }

    const workspaceId = session.workspaceId;
    const referralCode = generateReferralCode(workspaceId);

    // Ensure referral code is stored in DB
    await q(
      `INSERT INTO referrals (workspace_id, referral_code, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (workspace_id) DO UPDATE SET referral_code = $2`,
      [workspaceId, referralCode]
    );

    // Get referral stats
    const statsResult = await q(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'rewarded') as rewarded
       FROM referral_signups 
       WHERE referrer_workspace_id = $1`,
      [workspaceId]
    );

    const stats = statsResult[0] || { pending: 0, completed: 0, rewarded: 0 };

    // Get referral URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.marketscannerpros.app';
    const referralUrl = `${baseUrl}/pricing?ref=${referralCode}`;

    return NextResponse.json({
      success: true,
      referralCode,
      referralUrl,
      stats: {
        pending: parseInt(stats.pending) || 0,
        completed: parseInt(stats.completed) || 0,
        rewarded: parseInt(stats.rewarded) || 0,
        totalReferrals: (parseInt(stats.pending) || 0) + (parseInt(stats.completed) || 0) + (parseInt(stats.rewarded) || 0),
      }
    });

  } catch (error) {
    console.error('Referral GET error:', error);
    return NextResponse.json({ error: 'Failed to get referral info' }, { status: 500 });
  }
}

// POST: Record a referral signup (called during checkout/signup)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { referralCode, refereeWorkspaceId, refereeEmail } = body;

    if (!referralCode || !refereeWorkspaceId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Find the referrer
    const referrerResult = await q(
      `SELECT workspace_id FROM referrals WHERE referral_code = $1`,
      [referralCode.toUpperCase()]
    );

    if (referrerResult.length === 0) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 });
    }

    const referrerWorkspaceId = referrerResult[0].workspace_id;

    // Don't allow self-referral
    if (referrerWorkspaceId === refereeWorkspaceId) {
      return NextResponse.json({ error: 'Cannot refer yourself' }, { status: 400 });
    }

    // Check if this referee was already referred
    const existingResult = await q(
      `SELECT id FROM referral_signups WHERE referee_workspace_id = $1`,
      [refereeWorkspaceId]
    );

    if (existingResult.length > 0) {
      return NextResponse.json({ error: 'Already referred' }, { status: 400 });
    }

    // Record the referral (pending until they complete a paid subscription)
    await q(
      `INSERT INTO referral_signups 
       (referrer_workspace_id, referee_workspace_id, referee_email, referral_code, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())`,
      [referrerWorkspaceId, refereeWorkspaceId, refereeEmail || null, referralCode.toUpperCase()]
    );

    return NextResponse.json({
      success: true,
      message: 'Referral recorded. Reward will be applied when subscription is activated.'
    });

  } catch (error) {
    console.error('Referral POST error:', error);
    return NextResponse.json({ error: 'Failed to record referral' }, { status: 500 });
  }
}
