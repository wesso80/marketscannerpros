/**
 * Daily Top Picks API
 * 
 * @route GET /api/scanner/daily-picks
 * @description Returns pre-computed top 10 picks for each asset class
 *              Includes both bullish (top) and bearish (bottom) opportunities
 */

import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Get query params
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20);
    const rankType = searchParams.get('type') || 'all'; // 'top', 'bottom', or 'all'
    
    // Build the query based on rank type
    let rankFilter = '';
    if (rankType === 'top') {
      rankFilter = "AND (rank_type = 'top' OR rank_type IS NULL)";
    } else if (rankType === 'bottom') {
      rankFilter = "AND rank_type = 'bottom'";
    }
    
    // Get picks (or most recent if today not available)
    const picks = await q(`
      WITH latest_date AS (
        SELECT MAX(scan_date) as scan_date FROM daily_picks
      ),
      ranked_picks AS (
        SELECT 
          dp.*,
          ROW_NUMBER() OVER (
            PARTITION BY dp.asset_class, COALESCE(dp.rank_type, 'top')
            ORDER BY 
              CASE WHEN COALESCE(dp.rank_type, 'top') = 'top' THEN dp.score ELSE -dp.score END DESC
          ) as rank
        FROM daily_picks dp
        CROSS JOIN latest_date ld
        WHERE dp.scan_date = ld.scan_date ${rankFilter}
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
        scan_date,
        COALESCE(rank_type, 'top') as rank_type
      FROM ranked_picks
      WHERE rank <= $1
      ORDER BY asset_class, rank_type, 
        CASE WHEN COALESCE(rank_type, 'top') = 'top' THEN score ELSE -score END DESC
    `, [limit]);

    // Get the scan date
    const scanDate = picks.length > 0 ? picks[0].scan_date : null;

    // Group by asset class and rank type
    const topPicks: Record<string, typeof picks> = {
      equity: [],
      crypto: [],
      forex: []
    };
    
    const bottomPicks: Record<string, typeof picks> = {
      equity: [],
      crypto: [],
      forex: []
    };

    for (const pick of picks) {
      const target = pick.rank_type === 'bottom' ? bottomPicks : topPicks;
      if (target[pick.asset_class]) {
        target[pick.asset_class].push({
          ...pick,
          signals: {
            bullish: pick.signals_bullish,
            bearish: pick.signals_bearish,
            neutral: pick.signals_neutral
          }
        });
      }
    }

    return NextResponse.json({
      success: true,
      scanDate,
      // Top bullish opportunities
      topPicks: {
        equity: topPicks.equity,
        crypto: topPicks.crypto,
        forex: topPicks.forex
      },
      // Bottom bearish opportunities (for shorts)
      bottomPicks: {
        equity: bottomPicks.equity,
        crypto: bottomPicks.crypto,
        forex: bottomPicks.forex
      },
      // Quick access to #1 picks
      featured: {
        topEquity: topPicks.equity[0] || null,
        topCrypto: topPicks.crypto[0] || null,
        bottomEquity: bottomPicks.equity[0] || null,
        bottomCrypto: bottomPicks.crypto[0] || null
      },
      // Powered by attribution
      attribution: {
        crypto: "Powered by Yahoo Finance"
      }
    });

  } catch (error) {
    console.error("Daily picks error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to fetch daily picks",
      topPicks: { equity: [], crypto: [], forex: [] },
      bottomPicks: { equity: [], crypto: [], forex: [] },
      featured: { topEquity: null, topCrypto: null, bottomEquity: null, bottomCrypto: null }
    }, { status: 500 });
  }
}
