// Admin API for managing user trials
import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";

// Simple admin secret - set this in your environment variables
const ADMIN_SECRET = process.env.ADMIN_SECRET || "msp-admin-2024";

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const secret = authHeader?.replace("Bearer ", "");
  return secret === ADMIN_SECRET;
}

// GET - List all trials (active and expired)
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
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
  if (!isAuthorized(req)) {
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

    // Check if user already has an active trial
    const existing = await q(
      `SELECT id, expires_at FROM user_trials WHERE email = $1 AND expires_at > NOW()`,
      [email.toLowerCase().trim()]
    );

    if (existing.length > 0) {
      // Extend the existing trial instead of creating a new one
      const result = await q(
        `UPDATE user_trials 
         SET expires_at = expires_at + INTERVAL '${days} days',
             tier = $2,
             notes = COALESCE(notes, '') || ' | Extended: ' || $3
         WHERE email = $1 AND expires_at > NOW()
         RETURNING *`,
        [email.toLowerCase().trim(), tier, notes || `+${days} days`]
      );
      
      return NextResponse.json({ 
        ok: true, 
        message: `Extended existing trial by ${days} days`,
        trial: result[0]
      });
    }

    // Create new trial
    const result = await q(
      `INSERT INTO user_trials (email, tier, expires_at, granted_by, notes)
       VALUES ($1, $2, NOW() + INTERVAL '${days} days', 'admin', $3)
       RETURNING *`,
      [email.toLowerCase().trim(), tier, notes]
    );

    return NextResponse.json({ 
      ok: true, 
      message: `Trial granted: ${tier} for ${days} days`,
      trial: result[0]
    });
  } catch (error) {
    console.error("Failed to grant trial:", error);
    return NextResponse.json({ error: "Failed to grant trial" }, { status: 500 });
  }
}

// DELETE - Revoke a trial
export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Set expires_at to now (keeps record but deactivates)
    const result = await q(
      `UPDATE user_trials 
       SET expires_at = NOW(), notes = COALESCE(notes, '') || ' | Revoked by admin'
       WHERE email = $1 AND expires_at > NOW()
       RETURNING *`,
      [email.toLowerCase().trim()]
    );

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
