import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { getRecentSignals, getOverallStats } from "@/lib/signalRecorder";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Minimum sample size to display accuracy (prevents noise from small samples)
const MIN_SAMPLE_SIZE = 30;

/**
 * GET /api/ai/accuracy
 * 
 * Returns AI learning stats:
 * - Win rate by scanner type, direction, and horizon
 * - Recent signals with outcomes
 * - Overall statistics
 * 
 * Query params:
 * - scanner: Filter by scanner type (optional)
 * - horizon: Filter by horizon in minutes (optional)
 * - days: Lookback window - 30, 90 (default), or 'all'
 * - minSamples: Minimum sample size to show stats (default: 30)
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
    const lookbackDays = url.searchParams.get('days') === 'all' 
      ? null 
      : parseInt(url.searchParams.get('days') || '90');
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
    // Filter by minimum LABELED sample size (excludes unknown outcomes)
    conditions.push(`sas.labeled_signals >= $${paramIdx++}`);
    params.push(minSamples);
    
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get accuracy stats with rolling windows
    const stats = await q(`
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
    `, params);
    
    // Get recent signals with their outcomes
    const recentSignals = await getRecentSignals(25);
    
    // Get overall summary
    const overall = await getOverallStats();
    
    // Get threshold configuration
    const thresholds = await q(`
      SELECT horizon_minutes, horizon_label, correct_threshold, wrong_threshold
      FROM outcome_thresholds
      ORDER BY horizon_minutes
    `);
    
    // Compute expectancy for each stat row
    // Expectancy = (Win% × AvgWin) + (Loss% × AvgLoss)
    // Positive expectancy = edge
    const statsWithExpectancy = stats.map((s: any) => {
      let expectancy = null;
      if (s.win_rate != null && s.avg_win != null && s.avg_loss != null) {
        const winPct = parseFloat(s.win_rate) / 100;
        const avgWin = parseFloat(s.avg_win);
        const avgLoss = parseFloat(s.avg_loss); // Already negative for losses
        expectancy = (winPct * avgWin + (1 - winPct) * Math.abs(avgLoss)).toFixed(2);
      }
      return {
        ...s,
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
        lookbackDays: lookbackDays || 'all',
        horizonMinutes: horizonMinutes || 'all',
        scannerType: scannerType || 'all',
        minSamples,
        note: `Win rates only shown for signal types with >= ${minSamples} labeled samples. Unknown outcomes excluded from accuracy calculations.`
      }
    });
    
  } catch (error: any) {
    console.error('[ai/accuracy] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch accuracy stats', details: error?.message },
      { status: 500 }
    );
  }
}
