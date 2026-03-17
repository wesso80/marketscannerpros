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
  const outcome = entry.outcome && entry.outcome !== 'open'
    ? entry.outcome
    : deriveOutcome(rMul, pl);

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
      const outcome = entry.outcome && entry.outcome !== 'open'
        ? entry.outcome
        : deriveOutcome(rMul, pl);

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
