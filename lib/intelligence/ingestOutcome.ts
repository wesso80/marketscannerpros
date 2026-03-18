/**
 * Trade outcome ingestion — enriches closed journal entries into trade_outcomes.
 *
 * Pulls regime/indicator data from journal_trade_snapshots (entry-phase payload)
 * and computes derived analytics fields (hold duration, outcome label, day/hour).
 *
 * Can operate on a single entry (real-time hook) or bulk-backfill all closed trades.
 */

import { q } from '@/lib/db';
import { classifyOutcome, deriveOutcome } from './outcomeClassifier';
import { tagOutcome, computeLearningUpdate, type OutcomeTagInput } from '@/lib/learning-engine';

/* ── Types ─────────────────────────────────────────────────────────────── */

interface JournalRow {
  id: number;
  workspace_id: string;
  symbol: string;
  asset_class: string;
  side: string;
  trade_type: string;
  trade_date: string;
  exit_date: string | null;
  strategy: string | null;
  setup: string | null;
  tags: string[] | null;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number | null;
  target: number | null;
  planned_rr: number | null;
  equity_at_entry: number | null;
  pl: number | null;
  pl_percent: number | null;
  r_multiple: number | null;
  normalized_r: number | null;
  outcome: string;
  followed_plan: boolean | null;
  exit_reason: string | null;
  close_source: string | null;
}

interface SnapshotPayload {
  scannerScore?: number;
  score?: number;
  confidence?: number;
  confluenceCount?: number;
  signals?: { bullish?: number; bearish?: number; neutral?: number };
  regime?: string;
  volatilityRegime?: string;
  volRegime?: string;
  atr?: number;
  adx?: number;
  rsi?: number;
  // Flat indicator fields from scan results
  atr_at_entry?: number;
  adx_at_entry?: number;
  rsi_at_entry?: number;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseTs(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function holdDurationMinutes(entry: Date, exit: Date | null): number | null {
  if (!exit) return null;
  const diff = exit.getTime() - entry.getTime();
  return diff > 0 ? Math.round(diff / 60_000) : null;
}

/**
 * Extract regime + indicator data from the best available entry-phase snapshot.
 */
function extractSnapshotContext(payload: SnapshotPayload | null): {
  scannerScore: number | null;
  confidence: number | null;
  confluenceCount: number | null;
  regime: string | null;
  volatilityRegime: string | null;
  atr: number | null;
  adx: number | null;
  rsi: number | null;
} {
  if (!payload) {
    return { scannerScore: null, confidence: null, confluenceCount: null, regime: null, volatilityRegime: null, atr: null, adx: null, rsi: null };
  }

  const signals = payload.signals;
  const confluenceCount = payload.confluenceCount ??
    (signals ? (signals.bullish ?? 0) + (signals.bearish ?? 0) + (signals.neutral ?? 0) : null);

  return {
    scannerScore: toNum(payload.scannerScore ?? payload.score),
    confidence: toNum(payload.confidence),
    confluenceCount: confluenceCount != null ? Number(confluenceCount) : null,
    regime: payload.regime || null,
    volatilityRegime: payload.volatilityRegime ?? payload.volRegime ?? null,
    atr: toNum(payload.atr ?? payload.atr_at_entry),
    adx: toNum(payload.adx ?? payload.adx_at_entry),
    rsi: toNum(payload.rsi ?? payload.rsi_at_entry),
  };
}

/* ── Learning feedback helper ──────────────────────────────────────────── */

interface LearningFeedback {
  label: 'win' | 'loss' | 'flat' | 'skipped';
  efficiency: number;
  quality: number;
  weightDelta: number;
  thresholdDelta: number;
  key: string;
}

/**
 * Compute learning-engine feedback from available trade data.
 * Approximates MFE/MAE since we don't track intra-trade excursions yet.
 */
function computeLearningFeedback(
  entry: JournalRow,
  rMul: number | null,
  pl: number | null,
  regime: string | null,
  volatilityRegime: string | null,
): LearningFeedback {
  const resultR = rMul ?? 0;
  const taken = true; // entry is closed → trade was taken

  // Approximate MFE: if hit target, assume captured planned R:R; else use actual R
  const plannedRR = toNum(entry.planned_rr);
  const mfeR = entry.exit_reason === 'tp' && plannedRR != null
    ? plannedRR
    : resultR >= 0
      ? resultR * 1.1   // winners usually saw slightly more than final R
      : resultR * 0.3;  // losers may have briefly been positive

  // Approximate MAE: if hit stop, full loss was experienced; else moderate drawdown
  const maeR = entry.exit_reason === 'sl'
    ? resultR
    : resultR >= 0
      ? -0.3            // winning trades had small adverse excursion
      : resultR * 0.8;  // losing trades saw most of loss before close

  // Rule adherence: followed_plan is the best proxy we have
  const ruleAdherence = entry.followed_plan === true ? 80
    : entry.followed_plan === false ? 40
    : 60;

  const flowState = volatilityRegime || 'NEUTRAL';
  const playbook = entry.strategy?.toLowerCase().trim() || 'unknown';

  const tagInput: OutcomeTagInput = {
    symbol: entry.symbol,
    regime: regime || 'UNKNOWN',
    flowState,
    playbook,
    taken,
    resultR,
    mfeR,
    maeR,
    ruleAdherence,
  };

  const tag = tagOutcome(tagInput);
  const update = computeLearningUpdate(tag);

  return {
    label: tag.label,
    efficiency: tag.efficiency,
    quality: tag.quality,
    weightDelta: update.weightDelta,
    thresholdDelta: update.thresholdDelta,
    key: tag.key,
  };
}

/* ── Single-entry ingest (real-time hook) ──────────────────────────────── */

export async function ingestTradeOutcome(
  workspaceId: string,
  journalEntryId: number
): Promise<{ ingested: boolean; reason?: string }> {
  // Fetch the closed journal entry
  const entries = await q<JournalRow>(
    `SELECT * FROM journal_entries WHERE workspace_id = $1 AND id = $2 AND is_open = false`,
    [workspaceId, journalEntryId]
  );

  const entry = entries[0];
  if (!entry) return { ingested: false, reason: 'entry_not_found_or_open' };

  // Fetch best entry-phase snapshot
  const snapshots = await q<{ payload: SnapshotPayload }>(
    `SELECT payload FROM journal_trade_snapshots
     WHERE workspace_id = $1 AND journal_entry_id = $2 AND phase = 'entry'
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, journalEntryId]
  );

  const snapshotCtx = extractSnapshotContext(snapshots[0]?.payload ?? null);

  const entryTs = parseTs(entry.trade_date);
  const exitTs = parseTs(entry.exit_date);
  if (!entryTs) return { ingested: false, reason: 'invalid_entry_date' };

  const rMul = toNum(entry.r_multiple);
  const pl = toNum(entry.pl);
  const rawOutcome = entry.outcome && entry.outcome !== 'open'
    ? entry.outcome
    : deriveOutcome(rMul, pl);
  // Normalize "scratch" → "breakeven" (UI legacy; DB CHECK rejects scratch)
  const outcome = rawOutcome === 'scratch' ? 'breakeven' : rawOutcome;

  // Compute learning-engine feedback
  const learning = computeLearningFeedback(entry, rMul, pl, snapshotCtx.regime, snapshotCtx.volatilityRegime);

  await q(
    `INSERT INTO trade_outcomes (
       workspace_id, journal_entry_id,
       symbol, asset_class, side, trade_type,
       entry_ts, exit_ts, hold_duration_m, day_of_week, hour_of_day,
       strategy, setup, tags,
       scanner_score, confidence, confluence_count,
       regime, volatility_regime, atr_at_entry, adx_at_entry, rsi_at_entry,
       entry_price, exit_price, stop_loss, target, planned_rr, equity_at_entry,
       realized_pl, pl_percent, r_multiple, normalized_r,
       outcome, outcome_label,
       followed_plan, exit_reason, close_source,
       learning_label, learning_efficiency, learning_quality,
       learning_weight_delta, learning_threshold_delta, learning_key,
       computed_at
     ) VALUES (
       $1, $2,
       $3, $4, $5, $6,
       $7, $8, $9, $10, $11,
       $12, $13, $14,
       $15, $16, $17,
       $18, $19, $20, $21, $22,
       $23, $24, $25, $26, $27, $28,
       $29, $30, $31, $32,
       $33, $34,
       $35, $36, $37,
       $38, $39, $40,
       $41, $42, $43,
       NOW()
     )
     ON CONFLICT (workspace_id, journal_entry_id)
     DO UPDATE SET
       exit_ts          = EXCLUDED.exit_ts,
       hold_duration_m  = EXCLUDED.hold_duration_m,
       exit_price       = EXCLUDED.exit_price,
       realized_pl      = EXCLUDED.realized_pl,
       pl_percent       = EXCLUDED.pl_percent,
       r_multiple       = EXCLUDED.r_multiple,
       normalized_r     = EXCLUDED.normalized_r,
       outcome          = EXCLUDED.outcome,
       outcome_label    = EXCLUDED.outcome_label,
       followed_plan    = EXCLUDED.followed_plan,
       exit_reason      = EXCLUDED.exit_reason,
       close_source     = EXCLUDED.close_source,
       learning_label           = EXCLUDED.learning_label,
       learning_efficiency      = EXCLUDED.learning_efficiency,
       learning_quality         = EXCLUDED.learning_quality,
       learning_weight_delta    = EXCLUDED.learning_weight_delta,
       learning_threshold_delta = EXCLUDED.learning_threshold_delta,
       learning_key             = EXCLUDED.learning_key,
       learning_processed       = false,
       computed_at      = NOW(),
       version          = trade_outcomes.version + 1`,
    [
      workspaceId, journalEntryId,
      entry.symbol, entry.asset_class || 'equity', entry.side, entry.trade_type || 'Spot',
      entryTs.toISOString(), exitTs?.toISOString() ?? null,
      holdDurationMinutes(entryTs, exitTs),
      entryTs.getUTCDay(), entryTs.getUTCHours(),
      entry.strategy?.toLowerCase().trim() || null,
      entry.setup?.toLowerCase().trim() || null,
      entry.tags || [],
      snapshotCtx.scannerScore, snapshotCtx.confidence, snapshotCtx.confluenceCount,
      snapshotCtx.regime, snapshotCtx.volatilityRegime,
      snapshotCtx.atr, snapshotCtx.adx, snapshotCtx.rsi,
      Number(entry.entry_price), toNum(entry.exit_price),
      toNum(entry.stop_loss), toNum(entry.target), toNum(entry.planned_rr),
      toNum(entry.equity_at_entry),
      toNum(entry.pl), toNum(entry.pl_percent),
      rMul, toNum(entry.normalized_r),
      outcome, classifyOutcome(rMul, pl),
      entry.followed_plan, entry.exit_reason || null, entry.close_source || null,
      learning.label, learning.efficiency, learning.quality,
      learning.weightDelta, learning.thresholdDelta, learning.key,
    ]
  );

  return { ingested: true };
}

/* ── Bulk backfill (rebuild all outcomes for a workspace) ───────────────── */

export async function backfillTradeOutcomes(
  workspaceId: string
): Promise<{ processed: number; ingested: number; errors: number; orphansRemoved: number }> {
  // P1-3: Remove orphaned trade_outcomes whose journal entries no longer exist
  let orphansRemoved = 0;
  try {
    const orphanResult = await q<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM trade_outcomes
         WHERE workspace_id = $1
           AND journal_entry_id NOT IN (
             SELECT id FROM journal_entries WHERE workspace_id = $1
           )
         RETURNING 1
       ) SELECT COUNT(*)::TEXT AS count FROM deleted`,
      [workspaceId]
    );
    orphansRemoved = parseInt(orphanResult[0]?.count ?? '0', 10);
    if (orphansRemoved > 0) {
      console.log(`[ingestOutcome] Removed ${orphansRemoved} orphaned trade_outcomes for workspace ${workspaceId}`);
    }
  } catch {
    // trade_outcomes table may not exist yet — ignore
  }

  // P1-4: Batch-load all closed entries + snapshots in 2 queries instead of N+1
  const closedEntries = await q<JournalRow>(
    `SELECT * FROM journal_entries WHERE workspace_id = $1 AND is_open = false ORDER BY trade_date`,
    [workspaceId]
  );

  if (closedEntries.length === 0) {
    return { processed: 0, ingested: 0, errors: 0, orphansRemoved };
  }

  const entryIds = closedEntries.map(e => e.id);

  // Batch-load all entry-phase snapshots keyed by journal_entry_id
  const snapshotRows = await q<{ journal_entry_id: number; payload: SnapshotPayload }>(
    `SELECT DISTINCT ON (journal_entry_id) journal_entry_id, payload
     FROM journal_trade_snapshots
     WHERE workspace_id = $1 AND journal_entry_id = ANY($2) AND phase = 'entry'
     ORDER BY journal_entry_id, created_at DESC`,
    [workspaceId, entryIds]
  );

  const snapshotMap = new Map<number, SnapshotPayload>();
  for (const row of snapshotRows) {
    snapshotMap.set(row.journal_entry_id, row.payload);
  }

  let ingested = 0;
  let errors = 0;

  for (const entry of closedEntries) {
    try {
      const snapshotCtx = extractSnapshotContext(snapshotMap.get(entry.id) ?? null);
      const entryTs = parseTs(entry.trade_date);
      const exitTs = parseTs(entry.exit_date);
      if (!entryTs) continue;

      const rMul = toNum(entry.r_multiple);
      const pl = toNum(entry.pl);
      const rawOutcome = entry.outcome && entry.outcome !== 'open'
        ? entry.outcome
        : deriveOutcome(rMul, pl);
      // Normalize "scratch" → "breakeven" (UI legacy; DB CHECK rejects scratch)
      const outcome = rawOutcome === 'scratch' ? 'breakeven' : rawOutcome;

      // Compute learning-engine feedback
      const learning = computeLearningFeedback(entry, rMul, pl, snapshotCtx.regime, snapshotCtx.volatilityRegime);

      await q(
        `INSERT INTO trade_outcomes (
           workspace_id, journal_entry_id,
           symbol, asset_class, side, trade_type,
           entry_ts, exit_ts, hold_duration_m, day_of_week, hour_of_day,
           strategy, setup, tags,
           scanner_score, confidence, confluence_count,
           regime, volatility_regime, atr_at_entry, adx_at_entry, rsi_at_entry,
           entry_price, exit_price, stop_loss, target, planned_rr, equity_at_entry,
           realized_pl, pl_percent, r_multiple, normalized_r,
           outcome, outcome_label,
           followed_plan, exit_reason, close_source,
           learning_label, learning_efficiency, learning_quality,
           learning_weight_delta, learning_threshold_delta, learning_key,
           computed_at
         ) VALUES (
           $1, $2,
           $3, $4, $5, $6,
           $7, $8, $9, $10, $11,
           $12, $13, $14,
           $15, $16, $17,
           $18, $19, $20, $21, $22,
           $23, $24, $25, $26, $27, $28,
           $29, $30, $31, $32,
           $33, $34,
           $35, $36, $37,
           $38, $39, $40,
           $41, $42, $43,
           NOW()
         )
         ON CONFLICT (workspace_id, journal_entry_id)
         DO UPDATE SET
           exit_ts          = EXCLUDED.exit_ts,
           hold_duration_m  = EXCLUDED.hold_duration_m,
           exit_price       = EXCLUDED.exit_price,
           realized_pl      = EXCLUDED.realized_pl,
           pl_percent       = EXCLUDED.pl_percent,
           r_multiple       = EXCLUDED.r_multiple,
           normalized_r     = EXCLUDED.normalized_r,
           outcome          = EXCLUDED.outcome,
           outcome_label    = EXCLUDED.outcome_label,
           followed_plan    = EXCLUDED.followed_plan,
           exit_reason      = EXCLUDED.exit_reason,
           close_source     = EXCLUDED.close_source,
           learning_label           = EXCLUDED.learning_label,
           learning_efficiency      = EXCLUDED.learning_efficiency,
           learning_quality         = EXCLUDED.learning_quality,
           learning_weight_delta    = EXCLUDED.learning_weight_delta,
           learning_threshold_delta = EXCLUDED.learning_threshold_delta,
           learning_key             = EXCLUDED.learning_key,
           learning_processed       = false,
           computed_at      = NOW(),
           version          = trade_outcomes.version + 1`,
        [
          workspaceId, entry.id,
          entry.symbol, entry.asset_class || 'equity', entry.side, entry.trade_type || 'Spot',
          entryTs.toISOString(), exitTs?.toISOString() ?? null,
          holdDurationMinutes(entryTs, exitTs),
          entryTs.getUTCDay(), entryTs.getUTCHours(),
          entry.strategy?.toLowerCase().trim() || null,
          entry.setup?.toLowerCase().trim() || null,
          entry.tags || [],
          snapshotCtx.scannerScore, snapshotCtx.confidence, snapshotCtx.confluenceCount,
          snapshotCtx.regime, snapshotCtx.volatilityRegime,
          snapshotCtx.atr, snapshotCtx.adx, snapshotCtx.rsi,
          Number(entry.entry_price), toNum(entry.exit_price),
          toNum(entry.stop_loss), toNum(entry.target), toNum(entry.planned_rr),
          toNum(entry.equity_at_entry),
          toNum(entry.pl), toNum(entry.pl_percent),
          rMul, toNum(entry.normalized_r),
          outcome, classifyOutcome(rMul, pl),
          entry.followed_plan, entry.exit_reason || null, entry.close_source || null,
          learning.label, learning.efficiency, learning.quality,
          learning.weightDelta, learning.thresholdDelta, learning.key,
        ]
      );
      ingested++;
    } catch (err) {
      errors++;
      console.error(`[ingestOutcome] Failed entry ${entry.id}:`, err);
    }
  }

  return { processed: closedEntries.length, ingested, errors, orphansRemoved };
}

/* ── Auto-evolution trigger ────────────────────────────────────────────── */

const AUTO_EVOLUTION_THRESHOLD = 10; // Run evolution cycle after N unprocessed outcomes

/**
 * Check if a workspace has accumulated enough new learning outcomes to auto-trigger
 * an evolution cycle. Called after single-entry ingest or backfill.
 */
export async function maybeAutoEvolve(workspaceId: string): Promise<{ triggered: boolean; reason: string }> {
  try {
    const countRows = await q<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM trade_outcomes
       WHERE workspace_id = $1 AND learning_processed = false`,
      [workspaceId]
    );
    const unprocessed = parseInt(countRows[0]?.count ?? '0', 10);

    if (unprocessed < AUTO_EVOLUTION_THRESHOLD) {
      return { triggered: false, reason: `${unprocessed}/${AUTO_EVOLUTION_THRESHOLD} unprocessed outcomes` };
    }

    // Dynamically import evolution engine to avoid circular dependencies
    const { loadEvolutionSamples, saveEvolutionAdjustment } = await import('@/lib/evolution-store');
    const { runEvolutionCycle } = await import('@/lib/evolution-engine');

    const samples = await loadEvolutionSamples(workspaceId, undefined, 400);
    if (samples.length < 30) {
      return { triggered: false, reason: `Only ${samples.length} total samples (need 30)` };
    }

    const { getLatestEvolutionAdjustments } = await import('@/lib/evolution-store');
    const latest = (await getLatestEvolutionAdjustments(workspaceId, 1))[0] || null;

    const baseWeights = {
      regimeFit: 0.25, capitalFlow: 0.2, structureQuality: 0.2,
      optionsAlignment: 0.15, timing: 0.1, dataHealth: 0.1,
    };

    // Use latest saved weights if available
    const adj = latest?.adjustments_json as Record<string, any> | null;
    const weights = adj?.weights;
    const safeWeights = weights ? {
      regimeFit: Number(weights.regimeFit) || baseWeights.regimeFit,
      capitalFlow: Number(weights.capitalFlow) || baseWeights.capitalFlow,
      structureQuality: Number(weights.structureQuality) || baseWeights.structureQuality,
      optionsAlignment: Number(weights.optionsAlignment) || baseWeights.optionsAlignment,
      timing: Number(weights.timing) || baseWeights.timing,
      dataHealth: Number(weights.dataHealth) || baseWeights.dataHealth,
    } : baseWeights;

    const armedThreshold = Number(adj?.thresholds?.armedThreshold) || 0.7;

    const output = runEvolutionCycle({
      symbolGroup: 'General',
      cadence: 'daily',
      baselineWeights: safeWeights,
      armedThreshold,
      samples,
    });

    await saveEvolutionAdjustment(workspaceId, 'daily', output);

    // Mark all outcomes as processed
    await q(
      `UPDATE trade_outcomes SET learning_processed = true
       WHERE workspace_id = $1 AND learning_processed = false`,
      [workspaceId]
    );

    console.log(`[ingestOutcome] Auto-evolution triggered for workspace ${workspaceId}: ${unprocessed} outcomes processed, confidence=${output.confidence.toFixed(2)}`);
    return { triggered: true, reason: `Evolution cycle ran on ${unprocessed} new outcomes` };
  } catch (err) {
    console.warn('[ingestOutcome] Auto-evolution failed (non-blocking):', err);
    return { triggered: false, reason: 'error' };
  }
}
