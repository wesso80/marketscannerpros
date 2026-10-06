// Admin API for managing user trials
import { NextRequest, NextResponse } from "next/server";
import { q, tx } from "@/lib/db";
import { requireAdmin } from '@/lib/adminAuth';

/**
 * Move current_period_end on this email's non-Stripe trial subscription rows.
 * A row with a Stripe subscription id is left alone. Active paid rows, including
 * manual grants, are not trialing, so they are left alone too.
 */
const SYNC_NON_STRIPE_TRIAL_PERIOD_END = `
  UPDATE user_subscriptions
  SET current_period_end = $2, updated_at = NOW()
  WHERE LOWER(email) = LOWER($1)
    AND status = 'trialing'
    AND stripe_subscription_id IS NULL
`;

function latestExpiry(rows: { expires_at?: Date | string | null }[]): Date | string | null {
  let best: Date | string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    if (row.expires_at == null) continue;
    const ms = new Date(row.expires_at).getTime();
    if (Number.isFinite(ms) && ms >= bestMs) {
      best = row.expires_at;
      bestMs = ms;
    }
  }
  return best;
}

// GET - List all trials (active and expired)
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("active") === "true";

    let query = `
      SELECT id, email, tier, starts_at, expires_at, granted_by, notes, created_at,
             CASE WHEN expires_at > NOW() THEN true ELSE false END as is_active
      FROM user_trials
    `;
    
    if (activeOnly) {
      query += ` WHERE expires_at > NOW()`;
    }
    
    query += ` ORDER BY created_at DESC LIMIT 100`;

    const trials = await q(query);
    return NextResponse.json({ trials });
  } catch (error) {
    console.error("Failed to fetch trials:", error);
    return NextResponse.json({ error: "Failed to fetch trials" }, { status: 500 });
  }
}

// POST - Grant a new trial
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { email, tier = "pro_trader", days = 30, notes = "" } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    if (!["pro", "pro_trader"].includes(tier)) {
      return NextResponse.json({ error: "Tier must be 'pro' or 'pro_trader'" }, { status: 400 });
    }

    // Validate days is a positive integer to prevent injection
    const safeDays = Math.max(1, Math.min(365, Math.floor(Number(days))));
    if (!Number.isFinite(safeDays)) {
      return NextResponse.json({ error: "days must be a number 1-365" }, { status: 400 });
    }

    // Check if user already has an active trial
    const existing = await q(
      `SELECT id, expires_at FROM user_trials WHERE email = $1 AND expires_at > NOW()`,
      [email.toLowerCase().trim()]
    );

    if (existing.length > 0) {
      // Extend the existing trial, and the matching non-Stripe subscription
      // period, in one transaction. Login is the only other writer of
      // current_period_end, so without this the entitlement helper would
      // drop the user to Free at the old end.
      const normalizedEmail = email.toLowerCase().trim();
      const result = await tx(async (client) => {
        const updated = await client.query(
          `UPDATE user_trials 
           SET expires_at = expires_at + ($4 || ' days')::INTERVAL,
               tier = $2,
               notes = COALESCE(notes, '') || ' | Extended: ' || $3
           WHERE email = $1 AND expires_at > NOW()
           RETURNING *`,
          [normalizedEmail, tier, notes || `+${safeDays} days`, String(safeDays)]
        );
        const periodEnd = latestExpiry(updated.rows);
        if (periodEnd) {
          await client.query(SYNC_NON_STRIPE_TRIAL_PERIOD_END, [normalizedEmail, periodEnd]);
        }
        return updated.rows;
      });

      if (result.length === 0) {
        return NextResponse.json({ error: "No active trial found" }, { status: 404 });
      }
      
      return NextResponse.json({ 
        ok: true, 
        message: `Extended existing trial by ${safeDays} days`,
        trial: result[0]
      });
    }

    // Create new trial
    const result = await q(
      `INSERT INTO user_trials (email, tier, expires_at, granted_by, notes)
       VALUES ($1, $2, NOW() + ($4 || ' days')::INTERVAL, 'admin', $3)
       RETURNING *`,
      [email.toLowerCase().trim(), tier, notes, String(safeDays)]
    );

    return NextResponse.json({ 
      ok: true, 
      message: `Trial granted: ${tier} for ${safeDays} days`,
      trial: result[0]
    });
  } catch (error) {
    console.error("Failed to grant trial:", error);
    return NextResponse.json({ error: "Failed to grant trial" }, { status: 500 });
  }
}

// DELETE - Revoke a trial
export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Set expires_at to now (keeps record but deactivates). The subscription
    // period end moves to that same revoke time so the entitlement helper
    // treats the trial as Free without waiting for the old end.
    const normalizedEmail = email.toLowerCase().trim();
    const result = await tx(async (client) => {
      const updated = await client.query(
        `UPDATE user_trials 
         SET expires_at = NOW(), notes = COALESCE(notes, '') || ' | Revoked by admin'
         WHERE email = $1 AND expires_at > NOW()
         RETURNING *`,
        [normalizedEmail]
      );
      const periodEnd = latestExpiry(updated.rows);
      if (periodEnd) {
        await client.query(SYNC_NON_STRIPE_TRIAL_PERIOD_END, [normalizedEmail, periodEnd]);
      }
      return updated.rows;
    });

    if (result.length === 0) {
      return NextResponse.json({ error: "No active trial found" }, { status: 404 });
    }

    return NextResponse.json({ 
      ok: true, 
      message: "Trial revoked",
      trial: result[0]
    });
  } catch (error) {
    console.error("Failed to revoke trial:", error);
    return NextResponse.json({ error: "Failed to revoke trial" }, { status: 500 });
  }
}
