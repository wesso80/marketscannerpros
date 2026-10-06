import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { getRecentSignals, getOverallStats } from "@/lib/signalRecorder";
import { q } from "@/lib/db";
import { ACCURACY_DISPLAY_HORIZONS, isAccuracyDisplayHorizon } from "@/lib/signals/accuracyHorizons";
import { decisiveOutcomes, directionAdjustedMoves, finiteNumber, moveExpectancy } from "@/lib/signals/accuracyDisplay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Minimum sample size to display accuracy (prevents noise from small samples)
const MIN_SAMPLE_SIZE = 30;

/**
 * GET /api/ai/accuracy
 * 
 * Returns learning stats for recorded setups:
 * - Past-threshold share by scanner type, direction, and the 1d / 1w horizons
 * - Recent setups with outcomes
 * - Overall statistics
 * 
 * Query params:
 * - scanner: Filter by scanner type (optional)
 * - horizon: Filter by horizon in minutes (optional)
 * - minSamples: Minimum correct+wrong outcomes to show a past-threshold share (default: 30)
 * The stored rows always cover the last 90 days (refresh_signal_accuracy(90)).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json(
        { error: "Please log in to view accuracy stats" },
        { status: 401 }
      );
    }
    
    const url = new URL(req.url);
    const scannerType = url.searchParams.get('scanner') || undefined;
    const horizonMinutes = url.searchParams.get('horizon') 
      ? parseInt(url.searchParams.get('horizon')!) 
      : undefined;
    const minSamples = parseInt(url.searchParams.get('minSamples') || String(MIN_SAMPLE_SIZE));
    
    // Build conditions
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;
    
    if (scannerType) {
      conditions.push(`sas.signal_type = $${paramIdx++}`);
      params.push(scannerType);
    }
    if (horizonMinutes) {
      conditions.push(`sas.horizon_minutes = $${paramIdx++}`);
      params.push(horizonMinutes);
    }
    // Past-threshold share is correct/(correct+wrong). Neutrals are labelled but excluded,
    // so the sample minimum counts only decisive outcomes. A missing column returns an empty list.
    conditions.push(`(COALESCE(sas.correct_count, 0) + COALESCE(sas.wrong_count, 0)) >= $${paramIdx++}`);
    params.push(minSamples);
    conditions.push(`sas.horizon_minutes IN (${ACCURACY_DISPLAY_HORIZONS.join(', ')})`);
    
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // 003 shape: scanner_version, labeled_signals, unknown_count, median_pct_move.
    const statsSql = `
      SELECT 
        sas.signal_type,
        sas.direction,
        sas.scanner_version,
        ot.horizon_label,
        sas.horizon_minutes,
        sas.total_signals,
        sas.labeled_signals,
        sas.unknown_count,
        sas.correct_count,
        sas.wrong_count,
        sas.neutral_count,
        sas.accuracy_pct as win_rate,
        sas.precision_pct,
        sas.avg_pct_when_correct as avg_win,
        sas.avg_pct_when_wrong as avg_loss,
        sas.median_pct_move,
        CASE WHEN sas.avg_pct_when_wrong != 0 AND sas.avg_pct_when_wrong IS NOT NULL
             THEN ROUND(ABS(sas.avg_pct_when_correct / sas.avg_pct_when_wrong)::numeric, 2)
             ELSE NULL END as risk_reward,
        sas.accuracy_score_76_100 as high_score_winrate,
        sas.window_start,
        sas.window_end,
        sas.computed_at
      FROM signal_accuracy_stats sas
      LEFT JOIN outcome_thresholds ot ON sas.horizon_minutes = ot.horizon_minutes
      ${where}
      ORDER BY sas.scanner_version DESC, sas.total_signals DESC, sas.signal_type, sas.horizon_minutes
    `;
    let stats: any[];
    let schemaNote: string | null = null;
    try {
      stats = await q(statsSql, params);
    } catch (e: any) {
      // 42703 = undefined_column: the deployed table predates migration 003's extra columns. Return an honest
      // empty result (page shows its empty state) instead of a 500; the real fix is applying migration 119.
      if (e?.code !== '42703' && !/does not exist/.test(String(e?.message))) throw e;
      stats = [];
      schemaNote = 'Accuracy statistics table is on an older schema; historical stats are unavailable until it is upgraded.';
    }
    stats = stats.filter((row) => isAccuracyDisplayHorizon(row?.horizon_minutes) && decisiveOutcomes(row?.correct_count, row?.wrong_count) >= minSamples);
    
    // Normalise recent signal rows to the shape rendered by the page.
    // signalRecorder stores one signal with multiple horizon outcomes; display the
    // latest resolved horizon so each row has one coherent outcome/date.
    const rawRecentSignals: any[] = await getRecentSignals(25);
    const recentSignals = rawRecentSignals.map((signal: any) => {
      const outcomes = Array.isArray(signal.outcomes) ? signal.outcomes : [];
      const latestOutcome = outcomes.length ? outcomes[outcomes.length - 1] : null;
      return {
        symbol: signal.symbol,
        direction: signal.direction,
        scanner_type: signal.signal_type,
        score: Number(signal.score) || 0,
        outcome: latestOutcome?.outcome || 'pending',
        created_at: signal.signal_at,
        pct_move: latestOutcome?.pct_move == null ? null : Number(latestOutcome.pct_move),
      };
    });

    // Overall statistics are signal-level: one latest resolved outcome per signal.
    const raw: any = await getOverallStats();
    const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);
    const decisive = num(raw.correct_outcomes) + num(raw.wrong_outcomes);
    const overall = raw && Object.keys(raw).length
      ? {
          total: num(raw.total_signals),
          labeled: num(raw.signals_with_outcomes),
          correct: num(raw.correct_outcomes),
          wrong: num(raw.wrong_outcomes),
          neutral: num(raw.neutral_outcomes),
          // Withhold the share until correct+wrong reaches the sample minimum.
          // One decisive outcome among many neutrals must not read as 100%.
          win_rate: decisive >= minSamples ? (num(raw.correct_outcomes) / decisive) * 100 : null,
        }
      : null;
    
    // Get threshold configuration
    const thresholds = (await q(`
      SELECT horizon_minutes, horizon_label, correct_threshold, wrong_threshold
      FROM outcome_thresholds
      WHERE horizon_minutes IN (${ACCURACY_DISPLAY_HORIZONS.join(', ')})
      ORDER BY horizon_minutes
    `)).filter((row: { horizon_minutes?: unknown }) => isAccuracyDisplayHorizon(row?.horizon_minutes));
    
    // Direction-adjusted moves: bearish raw price changes flip sign so favorable is positive.
    // Expectancy uses those signed averages. A symmetric 50/50 pair is about 0.
    const statsWithExpectancy = stats.map((s: any) => {
      const { avgCorrect, avgWrong } = directionAdjustedMoves(s.direction, s.avg_win, s.avg_loss);
      const winRate = finiteNumber(s.win_rate);
      const expectancy = winRate != null && avgCorrect != null && avgWrong != null
        ? moveExpectancy(winRate, avgCorrect, avgWrong).toFixed(2)
        : null;
      return {
        ...s,
        avg_win: avgCorrect == null ? null : avgCorrect.toFixed(4),
        avg_loss: avgWrong == null ? null : avgWrong.toFixed(4),
        expectancy,
        // Quality indicator: % of signals with known outcomes
        data_quality: s.total_signals > 0 
          ? ((s.labeled_signals / s.total_signals) * 100).toFixed(1) + '%'
          : 'N/A'
      };
    });
    
    // Summary stats across all scanners
    const summary = {
      total_signals_all: stats.reduce((sum: number, s: any) => sum + (parseInt(s.total_signals) || 0), 0),
      total_labeled_all: stats.reduce((sum: number, s: any) => sum + (parseInt(s.labeled_signals) || 0), 0),
      total_unknown_all: stats.reduce((sum: number, s: any) => sum + (parseInt(s.unknown_count) || 0), 0),
      scanner_versions: [...new Set(stats.map((s: any) => s.scanner_version))]
    };
    
    return NextResponse.json({
      success: true,
      stats: statsWithExpectancy,
      summary,
      recentSignals,
      overall,
      thresholds,
      metadata: {
        timestamp: new Date().toISOString(),
        lookbackDays: 90,
        horizonMinutes: horizonMinutes || 'all',
        scannerType: scannerType || 'all',
        minSamples,
        schemaNote,
        note: `Past-threshold shares exclude neutral outcomes. They are shown when correct and wrong outcomes together reach at least ${minSamples}, on the 1d (±2%) and 1w (±4%) horizons only. The window is the last 90 days. Unknown outcomes are excluded. This is not a closed trade.`
      }
    });
    
  } catch (error: any) {
    console.error('[ai/accuracy] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch accuracy stats' },
      { status: 500 }
    );
  }
}
