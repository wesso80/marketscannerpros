/**
 * Daily Ranked Research API
 * 
 * @route GET /api/scanner/daily-picks
 * @description Returns pre-computed educational research observations for each asset class.
 *              Includes both bullish-alignment and bearish-alignment observations.
 */

import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { scannerComplianceMetadata, scannerDataQualityMetadata } from "@/lib/scanner/compliance";
import { evaluateDailyPickTrust, summarizeDailyPickTrust, type DailyPickTrust } from "@/lib/scanner/dailyPickTrust";
import { canonicalPickFields, rankDailyPicks, readStoredCanonical, storedLegacyScore } from "@/lib/scoring/canonical/dailyPick";
import { formatSessionDate, toYmd } from "@/lib/time/usSession";

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
    
    // Get research observations (or most recent if today not available)
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
              -- canonical score columns rank both sides high-is-better; legacy bottom rows rank low-is-better
              CASE WHEN COALESCE(dp.rank_type, 'top') = 'top' OR dp.indicators->>'scoreColumn' = 'canonical' THEN dp.score ELSE -dp.score END DESC
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
        created_at,
        COALESCE(rank_type, 'top') as rank_type
      FROM ranked_picks
      WHERE rank <= $1
      ORDER BY asset_class, rank_type, 
        CASE WHEN COALESCE(rank_type, 'top') = 'top' OR indicators->>'scoreColumn' = 'canonical' THEN score ELSE -score END DESC
    `, [limit]);

    // The scan date is the US market session the data belongs to, returned as a plain YYYY-MM-DD (a DATE serialised as
    // an ISO midnight timestamp would read as the previous day in US time zones).
    const scanDate = picks.length > 0 ? toYmd(picks[0].scan_date) : null;

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

    // Per-ticker trust from what was actually stored (indicator coverage + data age), not a blanket "fresh, 100%".
    const nowMs = Date.now();
    const trusts: DailyPickTrust[] = [];
    for (const pick of picks) {
      const target = pick.rank_type === 'bottom' ? bottomPicks : topPicks;
      if (target[pick.asset_class]) {
        const trust = evaluateDailyPickTrust(pick, nowMs);
        trusts.push(trust);
        target[pick.asset_class].push({
          ...pick,
          scan_date: toYmd(pick.scan_date),
          // Canonical verdict (primary: permission / grade / setup / direction). From Phase 3 the `score` + `direction`
          // columns hold the canonical values too (indicators.scoreColumn = 'canonical'); legacyScore is the old
          // signal-count score.
          ...canonicalPickFields(readStoredCanonical(pick.indicators)),
          legacyScore: storedLegacyScore(pick.indicators, Number(pick.score)),
          trust,
          dataTimestamp: trust.dataTimestamp,
          signals: {
            bullish: pick.signals_bullish,
            bearish: pick.signals_bearish,
            neutral: pick.signals_neutral
          }
        });
      }
    }

    // Within the stored top picks, order canonical-first (rows from older scans without a verdict keep score order).
    for (const k of Object.keys(topPicks)) topPicks[k] = rankDailyPicks(topPicks[k] as any[]) as typeof picks;
    for (const k of Object.keys(bottomPicks)) {
      if ((bottomPicks[k] as any[]).some((p) => p.canonical)) bottomPicks[k] = rankDailyPicks(bottomPicks[k] as any[]) as typeof picks;
    }

    return NextResponse.json({
      success: true,
      compliance: scannerComplianceMetadata(),
      scanDate,
      scanDateLabel: scanDate ? `US session ${formatSessionDate(scanDate)}` : null,
      scanDateBasis: 'US equity market session (America/New_York) the scan belongs to. Crypto rows use the latest completed UTC daily candle at scan time; each row carries its own dataTimestamp.',
      // Highest bullish-alignment observations
      topPicks: {
        equity: topPicks.equity,
        crypto: topPicks.crypto,
        forex: topPicks.forex
      },
      // Highest bearish-alignment observations
      bottomPicks: {
        equity: bottomPicks.equity,
        crypto: bottomPicks.crypto,
        forex: bottomPicks.forex
      },
      dataQuality: (() => {
        const summary = summarizeDailyPickTrust(trusts);
        return {
          ...scannerDataQualityMetadata({
            source: 'daily_picks_database',
            computedAt: scanDate,
            stale: summary.stale,
            coverageScore: summary.coverageScore,
            warnings: picks.length ? [
              ...(summary.staleCount ? [`${summary.staleCount} observation(s) are based on stale data.`] : []),
              ...(summary.insufficientCount ? [`${summary.insufficientCount} observation(s) have insufficient indicator coverage.`] : []),
            ] : ['No daily research observations are available yet.'],
          }),
          oldestDataTimestamp: summary.oldestDataTimestamp,
        };
      })(),
      // Quick access to #1 research observations
      featured: {
        topEquity: topPicks.equity[0] || null,
        topCrypto: topPicks.crypto[0] || null,
        bottomEquity: bottomPicks.equity[0] || null,
        bottomCrypto: bottomPicks.crypto[0] || null
      },
      // Powered by attribution
      attribution: {
        marketData: "Powered by licensed market data providers"
      }
    });

  } catch (error) {
    console.error("Daily picks error:", error);
    return NextResponse.json({ 
      success: false, 
      compliance: scannerComplianceMetadata(),
      error: "Failed to fetch daily research observations",
      topPicks: { equity: [], crypto: [], forex: [] },
      bottomPicks: { equity: [], crypto: [], forex: [] },
      featured: { topEquity: null, topCrypto: null, bottomEquity: null, bottomCrypto: null },
      dataQuality: scannerDataQualityMetadata({
        source: 'error',
        stale: true,
        coverageScore: 0,
        warnings: ['Unable to load daily research observations.'],
      }),
    }, { status: 500 });
  }
}
