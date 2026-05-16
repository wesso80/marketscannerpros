/**
 * lib/edge/ledger.ts — Edge Ledger writer/reader.
 *
 * Every setup the system surfaces (taken or not) MUST be recorded here.
 * Outcomes are labelled separately by lib/edge/outcomeLabeller.ts.
 *
 * Use:
 *   await recordSetupSurfaced({ workspaceId, symbol, market, setupType, direction, ... });
 *   await markSetupTaken(workspaceId, setupKey, { entryPrice, journalEntryId });
 *   await markSetupSkipped(workspaceId, setupKey, 'didn't like the regime');
 *
 * The deterministic setup_key prevents duplicate rows when the same setup
 * is re-surfaced on the same day (e.g. the scanner reruns every 5 min).
 */

import { q } from '@/lib/db';
import crypto from 'crypto';

export type SetupDirection = 'long' | 'short';
export type SetupType = 'breakout' | 'reversal' | 'continuation' | 'fade' | 'mean-revert' | 'event-driven';
export type SetupStatus = 'surfaced' | 'taken' | 'skipped' | 'invalidated';
export type Confidence = 'high' | 'medium' | 'low';
export type Regime = 'trend-up' | 'trend-down' | 'chop' | 'vol-expand' | 'vol-contract' | 'risk-off';

export interface RecordSetupInput {
  workspaceId: string;
  symbol: string;
  market: 'equity' | 'crypto' | 'options' | 'futures';
  playbook?: string;
  setupType: SetupType;
  direction: SetupDirection;
  packetId?: string;
  regime?: Regime;
  vixLevel?: number | null;
  ivPercentile?: number | null;
  sector?: string;
  catalystProximityDays?: number | null;
  evidenceQuality?: number | null;
  opportunityScore?: number | null;
  confidence?: Confidence;
  entryPrice?: number | null;
  stopPrice?: number | null;
  targetPrice?: number | null;
  featureVector?: Record<string, number | string | boolean | null>;
}

export function deriveSetupKey(input: Pick<RecordSetupInput, 'symbol' | 'setupType' | 'direction' | 'playbook'>): string {
  const day = new Date().toISOString().slice(0, 10);
  const raw = `${day}|${input.symbol.toUpperCase()}|${input.setupType}|${input.direction}|${input.playbook ?? 'na'}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function computeRR(entry: number | null | undefined, stop: number | null | undefined, target: number | null | undefined, dir: SetupDirection): { risk: number | null; rr: number | null } {
  if (typeof entry !== 'number' || typeof stop !== 'number') return { risk: null, rr: null };
  const risk = dir === 'long' ? entry - stop : stop - entry;
  if (risk <= 0) return { risk: null, rr: null };
  if (typeof target !== 'number') return { risk, rr: null };
  const reward = dir === 'long' ? target - entry : entry - target;
  if (reward <= 0) return { risk, rr: null };
  return { risk, rr: reward / risk };
}

/**
 * Record a setup as 'surfaced'. Idempotent on (workspace_id, setup_key).
 * Returns the row id (existing or new).
 */
export async function recordSetupSurfaced(input: RecordSetupInput): Promise<number> {
  const key = deriveSetupKey(input);
  const { risk, rr } = computeRR(input.entryPrice, input.stopPrice, input.targetPrice, input.direction);
  const rows = await q<{ id: number }>(
    `INSERT INTO edge_ledger_setups
       (workspace_id, setup_key, symbol, market, playbook, setup_type, direction,
        packet_id, regime, vix_level, iv_percentile, sector, catalyst_proximity_days,
        evidence_quality, opportunity_score, confidence,
        entry_price, stop_price, target_price, risk_per_share, reward_risk,
        feature_vector, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'surfaced')
       ON CONFLICT (workspace_id, setup_key) DO UPDATE
         SET evidence_quality = COALESCE(EXCLUDED.evidence_quality, edge_ledger_setups.evidence_quality),
             opportunity_score = COALESCE(EXCLUDED.opportunity_score, edge_ledger_setups.opportunity_score),
             confidence = COALESCE(EXCLUDED.confidence, edge_ledger_setups.confidence)
       RETURNING id`,
    [
      input.workspaceId, key, input.symbol.toUpperCase(), input.market,
      input.playbook ?? null, input.setupType, input.direction,
      input.packetId ?? null, input.regime ?? null,
      input.vixLevel ?? null, input.ivPercentile ?? null,
      input.sector ?? null, input.catalystProximityDays ?? null,
      input.evidenceQuality ?? null, input.opportunityScore ?? null,
      input.confidence ?? null,
      input.entryPrice ?? null, input.stopPrice ?? null, input.targetPrice ?? null,
      risk, rr,
      input.featureVector ? JSON.stringify(input.featureVector) : null,
    ],
  );
  return rows[0]?.id ?? 0;
}

export async function markSetupTaken(workspaceId: string, setupKey: string, opts: { takenAt?: string; entryPrice?: number } = {}): Promise<void> {
  await q(
    `UPDATE edge_ledger_setups
        SET status = 'taken',
            taken_at = COALESCE($3, NOW()),
            entry_price = COALESCE($4, entry_price)
      WHERE workspace_id = $1 AND setup_key = $2`,
    [workspaceId, setupKey, opts.takenAt ?? null, opts.entryPrice ?? null],
  );
}

export async function markSetupSkipped(workspaceId: string, setupKey: string, reason?: string): Promise<void> {
  await q(
    `UPDATE edge_ledger_setups
        SET status = 'skipped',
            skipped_reason = $3
      WHERE workspace_id = $1 AND setup_key = $2`,
    [workspaceId, setupKey, reason ?? null],
  );
}

export async function markSetupInvalidated(workspaceId: string, setupKey: string, reason?: string): Promise<void> {
  await q(
    `UPDATE edge_ledger_setups
        SET status = 'invalidated',
            skipped_reason = $3
      WHERE workspace_id = $1 AND setup_key = $2`,
    [workspaceId, setupKey, reason ?? null],
  );
}

export interface LedgerRow {
  id: number;
  setupKey: string;
  symbol: string;
  market: string;
  playbook: string | null;
  setupType: SetupType;
  direction: SetupDirection;
  regime: Regime | null;
  sector: string | null;
  evidenceQuality: number | null;
  opportunityScore: number | null;
  confidence: Confidence | null;
  entryPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  rewardRisk: number | null;
  status: SetupStatus;
  takenAt: string | null;
  skippedReason: string | null;
  surfacedAt: string;
}

export async function readRecentSetups(opts: {
  workspaceId: string;
  status?: SetupStatus;
  playbook?: string;
  symbol?: string;
  sinceISO?: string;
  limit?: number;
}): Promise<LedgerRow[]> {
  const where: string[] = ['workspace_id = $1'];
  const params: unknown[] = [opts.workspaceId];
  let p = 2;
  if (opts.status) { where.push(`status = $${p++}`); params.push(opts.status); }
  if (opts.playbook) { where.push(`playbook = $${p++}`); params.push(opts.playbook); }
  if (opts.symbol) { where.push(`symbol = $${p++}`); params.push(opts.symbol.toUpperCase()); }
  if (opts.sinceISO) { where.push(`surfaced_at >= $${p++}`); params.push(new Date(opts.sinceISO)); }
  params.push(opts.limit ?? 200);
  const rows = await q<{
    id: number; setup_key: string; symbol: string; market: string; playbook: string | null;
    setup_type: SetupType; direction: SetupDirection; regime: Regime | null; sector: string | null;
    evidence_quality: string | null; opportunity_score: string | null; confidence: Confidence | null;
    entry_price: string | null; stop_price: string | null; target_price: string | null;
    reward_risk: string | null; status: SetupStatus; taken_at: Date | null;
    skipped_reason: string | null; surfaced_at: Date;
  }>(
    `SELECT id, setup_key, symbol, market, playbook, setup_type, direction, regime, sector,
            evidence_quality, opportunity_score, confidence,
            entry_price, stop_price, target_price, reward_risk,
            status, taken_at, skipped_reason, surfaced_at
       FROM edge_ledger_setups
      WHERE ${where.join(' AND ')}
      ORDER BY surfaced_at DESC
      LIMIT $${p}`,
    params,
  );
  const numOrNull = (v: string | null) => (v === null ? null : Number(v));
  return rows.map((r) => ({
    id: r.id,
    setupKey: r.setup_key,
    symbol: r.symbol,
    market: r.market,
    playbook: r.playbook,
    setupType: r.setup_type,
    direction: r.direction,
    regime: r.regime,
    sector: r.sector,
    evidenceQuality: numOrNull(r.evidence_quality),
    opportunityScore: numOrNull(r.opportunity_score),
    confidence: r.confidence,
    entryPrice: numOrNull(r.entry_price),
    stopPrice: numOrNull(r.stop_price),
    targetPrice: numOrNull(r.target_price),
    rewardRisk: numOrNull(r.reward_risk),
    status: r.status,
    takenAt: r.taken_at ? r.taken_at.toISOString() : null,
    skippedReason: r.skipped_reason,
    surfacedAt: r.surfaced_at.toISOString(),
  }));
}

export async function recordSelfAttribution(opts: {
  workspaceId: string;
  setupId: number;
  journalEntryId?: string;
  action: 'taken' | 'skipped' | 'partial' | 'modified';
  overrideReason?: string;
  sizeDeltaPct?: number;
  entryDeltaBps?: number;
  stopDeltaPct?: number;
  targetDeltaPct?: number;
  checklistOverrides?: string[];
  wasRevengeTrade?: boolean;
  wasOvertrade?: boolean;
}): Promise<void> {
  await q(
    `INSERT INTO edge_ledger_self_attribution
       (workspace_id, setup_id, journal_entry_id, action, override_reason,
        size_delta_pct, entry_delta_bps, stop_delta_pct, target_delta_pct,
        checklist_overrides, was_revenge_trade, was_overtrade)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      opts.workspaceId, opts.setupId, opts.journalEntryId ?? null, opts.action,
      opts.overrideReason ?? null,
      opts.sizeDeltaPct ?? null, opts.entryDeltaBps ?? null,
      opts.stopDeltaPct ?? null, opts.targetDeltaPct ?? null,
      opts.checklistOverrides ? JSON.stringify(opts.checklistOverrides) : null,
      opts.wasRevengeTrade ?? null, opts.wasOvertrade ?? null,
    ],
  );
}
