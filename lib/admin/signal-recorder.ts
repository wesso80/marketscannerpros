/**
 * Admin Terminal — Signal Recorder
 * Logs every scanner pipeline hit into ai_signal_log for outcome tracking.
 * Uses existing ai_signal_log table (migration 048).
 *
 * Called server-side after each admin scan completes.
 */

import { q } from "@/lib/db";
import type { CandidatePipeline } from "@/lib/operator/orchestrator";
import { computeEliteSignalScore } from "@/lib/operator/elite-score";
import { isUsRegularSessionOpen, nyDateTime } from "@/lib/time/usSession";

const WORKSPACE_ID = "operator-terminal";
const SCANNER_VERSION = "admin-v2";

export type SignalSkipReason = "blocked" | "score_zero" | "no_direction" | "market_closed";

/**
 * Why a pipeline should NOT be logged as a signal, or null to log it. Only signals that can be graded
 * are logged:
 * - blocked (market or governance permission BLOCK): never an actionable signal;
 * - score 0 (confidence rounds to 0, or elite score 0): nothing to grade;
 * - no LONG/SHORT direction: the labeller cannot score it (#167 skips these);
 * - US equities outside the regular session (weekend / overnight rescans): Friday-close setups would be graded
 *   against Monday's gap, or only resolve neutral/expired.
 */
export function signalSkipReason(p: CandidatePipeline, market: string, nowMs: number = Date.now()): SignalSkipReason | null {
  const v = p.verdict;
  const g = p.governance;
  if (String(market).toUpperCase() === "EQUITIES" && !isUsRegularSessionOpen(nowMs)) return "market_closed";
  if (v.permission === "BLOCK" || g.finalPermission === "BLOCK") return "blocked";
  if (v.direction !== "LONG" && v.direction !== "SHORT") return "no_direction";
  if (Math.round((v.confidenceScore ?? 0) * 100) <= 0) return "score_zero";
  if ((computeEliteSignalScore(p).score ?? 0) <= 0) return "score_zero";
  return null;
}

/**
 * Record a batch of pipeline results as signals into ai_signal_log.
 * Skips pipelines that can't be graded (see signalSkipReason) and dedupes on symbol + playbook + direction +
 * NY session day (it used to be symbol + regime within 15 minutes, so each rescan re-logged the same setup).
 */
export async function recordSignals(
  pipelines: CandidatePipeline[],
  market: string,
  timeframe: string,
  nowMs: number = Date.now(),
): Promise<number> {
  if (!pipelines.length) return 0;

  let recorded = 0;
  const nyDay = nyDateTime(nowMs).ymd;

  for (const p of pipelines) {
    const v = p.verdict;
    const g = p.governance;
    const c = p.candidate;
    if (signalSkipReason(p, market, nowMs)) continue;
    const marketPrice = p.lastPrice ?? c.entryZone?.min ?? null;
    const elite = computeEliteSignalScore(p);

    // Dedupe: same symbol + playbook + direction already logged this NY session day.
    try {
      const recent = await q(
        `SELECT id FROM ai_signal_log
         WHERE workspace_id = $1
           AND symbol = $2
           AND trade_bias = $3
           AND COALESCE(decision_trace->>'playbook', '') = $4
           AND (signal_at AT TIME ZONE 'America/New_York')::date = $5::date
         LIMIT 1`,
        [WORKSPACE_ID, v.symbol, v.direction, String(v.playbook ?? ""), nyDay],
      );
      if (recent.length > 0) continue;
    } catch {
      // Table may not exist — skip dedup check
    }

    try {
      const inserted = await q<{ id: number }>(
        `INSERT INTO ai_signal_log (
           workspace_id, symbol, asset_type, timeframe, signal_at,
           regime, confluence_score, confidence, verdict, trade_bias,
           price_at_signal, entry_price, stop_loss, target_1, target_2,
           decision_trace, outcome
         ) VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending')
         RETURNING id`,
        [
          WORKSPACE_ID,
          v.symbol,
          market.toLowerCase(),
          timeframe,
          v.regime,
          Math.round(v.confidenceScore * 100),
          Math.round(v.qualityScore * 100),
          g.finalPermission,
          v.direction,
          marketPrice,
          c.entryZone?.min ?? null,
          c.invalidationPrice ?? null,
          c.targets?.[0] ?? null,
          c.targets?.[1] ?? null,
          JSON.stringify({
            verdictId: v.verdictId,
            playbook: v.playbook,
            sizeMultiplier: v.sizeMultiplier,
            evidence: v.evidence,
            blockReasons: g.blockReasons,
            penalties: v.penalties?.map((pen) => pen.code),
            reasonCodes: v.reasonCodes,
            lifecycle: {
              state: elite.setupState,
              triggerDistancePct: elite.triggerDistancePct,
            },
            eliteScore: elite,
            scannerVersion: SCANNER_VERSION,
          }),
        ],
      );
      const id = inserted[0]?.id;
      if (id) {
        await updateLifecycleColumns(id, elite).catch(() => null);
      }
      recorded++;
    } catch (err) {
      console.error(`[signal-recorder] Failed to log ${v.symbol}:`, err);
    }
  }

  return recorded;
}

async function updateLifecycleColumns(
  id: number,
  elite: ReturnType<typeof computeEliteSignalScore>,
) {
  await q(
    `UPDATE ai_signal_log
     SET lifecycle_state = $1,
         setup_state = $2,
         trigger_distance_pct = $3,
         elite_score = $4,
         elite_grade = $5,
         triggered_at = CASE WHEN $1 = 'TRIGGERED' THEN NOW() ELSE triggered_at END,
         invalidated_at = CASE WHEN $1 = 'INVALIDATED' THEN NOW() ELSE invalidated_at END
     WHERE id = $6`,
    [
      elite.setupState,
      elite.setupState,
      elite.triggerDistancePct,
      elite.score,
      elite.grade,
      id,
    ],
  );
}
