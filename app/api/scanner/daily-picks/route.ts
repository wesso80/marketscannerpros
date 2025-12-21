/**
 * Daily Top Picks API
 * 
 * @route GET /api/scanner/daily-picks
 * @description Returns pre-computed top picks for each asset class
 */

import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Get today's picks (or most recent if today not available)
    const picks = await q(`
      WITH ranked_picks AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (PARTITION BY asset_class ORDER BY score DESC) as rank
        FROM daily_picks
        WHERE scan_date = (SELECT MAX(scan_date) FROM daily_picks)
      )
      SELECT 
        asset_class,
        symbol,
        score,
        direction,
        signals_bullish,
        signals_bearish,
        signals_neutral,
        price,
        change_percent,
        indicators,
        scan_date
      FROM ranked_picks
      WHERE rank <= 3
      ORDER BY asset_class, score DESC
    `);

    // Get the scan date
    const scanDate = picks.length > 0 ? picks[0].scan_date : null;

    // Group by asset class
    const grouped: Record<string, typeof picks> = {
      equity: [],
      crypto: [],
      forex: []
    };

    for (const pick of picks) {
      if (grouped[pick.asset_class]) {
        grouped[pick.asset_class].push(pick);
      }
    }

    return NextResponse.json({
      success: true,
      scanDate,
      picks: grouped,
      topPicks: {
        equity: grouped.equity[0] || null,
        crypto: grouped.crypto[0] || null,
        forex: grouped.forex[0] || null
      }
    });

  } catch (error) {
    console.error("Daily picks error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to fetch daily picks",
      picks: { equity: [], crypto: [], forex: [] },
      topPicks: { equity: null, crypto: null, forex: null }
    }, { status: 500 });
  }
}
