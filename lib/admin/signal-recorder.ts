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

const WORKSPACE_ID = "operator-terminal";
const SCANNER_VERSION = "admin-v1";

/**
 * Record a batch of pipeline results as signals into ai_signal_log.
 * Skips signals already logged within the last 15 minutes for the same symbol+regime
 * to avoid flooding the table on rapid polling.
 */
export async function recordSignals(
  pipelines: CandidatePipeline[],
  market: string,
  timeframe: string,
): Promise<number> {
  if (!pipelines.length) return 0;

  let recorded = 0;

  for (const p of pipelines) {
    const v = p.verdict;
    const g = p.governance;
    const c = p.candidate;
    const marketPrice = p.lastPrice ?? c.entryZone?.min ?? null;
    const elite = computeEliteSignalScore(p);

    // Dedupe: skip if same symbol+regime logged in last 15 min
    try {
      const recent = await q(
        `SELECT id FROM ai_signal_log
         WHERE workspace_id = $1
           AND symbol = $2
           AND regime = $3
           AND signal_at > NOW() - INTERVAL '15 minutes'
         LIMIT 1`,
        [WORKSPACE_ID, v.symbol, v.regime],
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
