/**
 * Run Daily Picks Migration
 * 
 * @route GET /api/migrations/daily-picks?key=ADMIN_KEY
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const adminKey = searchParams.get("key");
  
  if (adminKey !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Create the daily_picks table
    await sql`
      CREATE TABLE IF NOT EXISTS daily_picks (
        id SERIAL PRIMARY KEY,
        asset_class VARCHAR(20) NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        score INTEGER NOT NULL,
        direction VARCHAR(10) NOT NULL,
        signals_bullish INTEGER DEFAULT 0,
        signals_bearish INTEGER DEFAULT 0,
        signals_neutral INTEGER DEFAULT 0,
        price DECIMAL(20, 8),
        change_percent DECIMAL(10, 4),
        indicators JSONB,
        scan_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(asset_class, symbol, scan_date)
      )
    `;

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_daily_picks_date ON daily_picks(scan_date DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_daily_picks_class_date ON daily_picks(asset_class, scan_date DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_daily_picks_score ON daily_picks(scan_date, asset_class, score DESC)`;

    return NextResponse.json({ 
      success: true, 
      message: "daily_picks table created successfully" 
    });

  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Migration failed" 
    }, { status: 500 });
  }
}
