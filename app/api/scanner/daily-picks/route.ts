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
import { dailyPickPriceBasis } from "@/lib/scanner/dailyPickPriceBasis";
import { evaluateDailyPickTrust, summarizeDailyPickTrust, type DailyPickTrust } from "@/lib/scanner/dailyPickTrust";
import { canonicalPickFields, rankDailyPicks, readStoredCanonical, storedLegacyScore } from "@/lib/scoring/canonical/dailyPick";
import { omitForexPicks } from "@/lib/scanner/omitForexPicks";
import { formatSessionDate, toYmd } from "@/lib/time/usSession";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Get query params
    const { searchParams } = new URL(req.url);
    const rawLimit = Number(searchParams.get('limit') ?? 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(Math.floor(rawLimit),20)) : 10;
    const date = searchParams.get('date');
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) {
      return NextResponse.json({error:'date must be a valid YYYY-MM-DD'}, {status:400});
    }
    // Fixed SQL fragments only; user dates are bound parameters.
    const source = date ? `SELECT (jsonb_populate_record(NULL::daily_picks, pick)).* FROM daily_picks_history WHERE scan_date = $2::date` : `SELECT * FROM daily_picks`;

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
      WITH source_picks AS (${source}), latest_date AS (
        SELECT asset_class, MAX(scan_date) as scan_date FROM source_picks GROUP BY asset_class
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
        FROM source_picks dp
        JOIN latest_date ld ON dp.asset_class = ld.asset_class
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
    `, date ? [limit, date] : [limit]);

    // Forex rows are leftover stored scans. They stay in the table; this response does not serve them.
    const visiblePicks = omitForexPicks(picks);

    // The scan date is the US market session the data belongs to, returned as a plain YYYY-MM-DD (a DATE serialised as
    // an ISO midnight timestamp would read as the previous day in US time zones).
    const scanDate = visiblePicks.length > 0 ? toYmd(visiblePicks[0].scan_date) : null;

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
    for (const pick of visiblePicks) {
      const target = pick.rank_type === 'bottom' ? bottomPicks : topPicks;
      if (target[pick.asset_class]) {
        const trust = evaluateDailyPickTrust(pick, nowMs);
        trusts.push(trust);
        const storedCanonical = readStoredCanonical(pick.indicators);
        target[pick.asset_class].push({
          ...pick,
          scan_date: toYmd(pick.scan_date),
          // Says which price `price` is: crypto rows store a scan-time spot quote, the verdict uses the completed bar.
          ...dailyPickPriceBasis(pick.price, storedCanonical, pick.asset_class),
          // Canonical verdict (primary: permission / grade / setup / direction). From Phase 3 the `score` + `direction`
          // columns hold the canonical values too (indicators.scoreColumn = 'canonical'); legacyScore is the old
          // signal-count score.
          ...canonicalPickFields(storedCanonical),
          legacyScore: storedLegacyScore(pick.indicators, Number(pick.score)),
          trust,
          dataTimestamp: trust.dataTimestamp,
          data_as_of: trust.dataAsOf,
          entryBasis: "bar close",
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
      history: date ? {requestedDate:date, basis:"first publication; legacy rows archived at migration time"} : null,
      compliance: scannerComplianceMetadata(),
      scanDate,
      scanDateLabel: scanDate ? `Latest per-market daily snapshots` : null,
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
            warnings: visiblePicks.length ? [
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
