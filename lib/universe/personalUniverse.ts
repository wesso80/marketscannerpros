/**
 * lib/universe/personalUniverse.ts
 *
 * CRUD + kill-switch helpers for the operator's personal watch universe.
 *
 * Personal caps (max_position_usd, max_position_pct_equity) are advisory
 * inputs to the pre-trade checklist's personal_cap gate.
 *
 * Kill switch: when enabled, callers must skip alert emission and any
 * outbound notification. This module exposes `isKillSwitchOn(workspaceId)`
 * for that gate. Toggles append to kill_switch_log for audit.
 */

import { q } from '@/lib/db';
import { notifyAdmin } from '@/lib/admin/notifyAdmin';

export interface UniverseEntry {
  id: number;
  workspaceId: string;
  symbol: string;
  assetClass: string;
  thesis: string | null;
  tags: string[];
  maxPositionUsd: number | null;
  maxPositionPctEquity: number | null;
  active: boolean;
  addedAt: string;
  updatedAt: string;
}

interface UniverseRow {
  id: number;
  workspace_id: string;
  symbol: string;
  asset_class: string;
  thesis: string | null;
  tags: string[] | null;
  max_position_usd: string | null;
  max_position_pct_equity: string | null;
  active: boolean;
  added_at: Date;
  updated_at: Date;
}

function rowToEntry(r: UniverseRow): UniverseEntry {
  return {
    id: Number(r.id),
    workspaceId: r.workspace_id,
    symbol: r.symbol,
    assetClass: r.asset_class,
    thesis: r.thesis,
    tags: r.tags ?? [],
    maxPositionUsd: r.max_position_usd === null ? null : Number(r.max_position_usd),
    maxPositionPctEquity: r.max_position_pct_equity === null ? null : Number(r.max_position_pct_equity),
    active: r.active,
    addedAt: r.added_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listUniverse(workspaceId: string, includeInactive = false): Promise<UniverseEntry[]> {
  const sql = includeInactive
    ? `SELECT * FROM personal_universe WHERE workspace_id = $1 ORDER BY symbol ASC`
    : `SELECT * FROM personal_universe WHERE workspace_id = $1 AND active = TRUE ORDER BY symbol ASC`;
  const rows = await q<UniverseRow>(sql, [workspaceId]);
  return rows.map(rowToEntry);
}

export interface UpsertUniverseInput {
  workspaceId: string;
  symbol: string;
  assetClass?: string;
  thesis?: string | null;
  tags?: string[];
  maxPositionUsd?: number | null;
  maxPositionPctEquity?: number | null;
  active?: boolean;
}

export async function upsertUniverseEntry(input: UpsertUniverseInput): Promise<UniverseEntry> {
  const sym = input.symbol.toUpperCase().trim();
  if (!sym) throw new Error('symbol required');
  const rows = await q<UniverseRow>(
    `INSERT INTO personal_universe (
       workspace_id, symbol, asset_class, thesis, tags,
       max_position_usd, max_position_pct_equity, active, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, TRUE), NOW())
     ON CONFLICT (workspace_id, symbol) DO UPDATE SET
       asset_class = EXCLUDED.asset_class,
       thesis = EXCLUDED.thesis,
       tags = EXCLUDED.tags,
       max_position_usd = EXCLUDED.max_position_usd,
       max_position_pct_equity = EXCLUDED.max_position_pct_equity,
       active = EXCLUDED.active,
       updated_at = NOW()
     RETURNING *`,
    [
      input.workspaceId,
      sym,
      input.assetClass ?? 'equity',
      input.thesis ?? null,
      input.tags ?? [],
      input.maxPositionUsd ?? null,
      input.maxPositionPctEquity ?? null,
      input.active ?? true,
    ],
  );
  return rowToEntry(rows[0]);
}

export async function deleteUniverseEntry(workspaceId: string, symbol: string): Promise<boolean> {
  const rows = await q<{ id: number }>(
    `DELETE FROM personal_universe WHERE workspace_id = $1 AND symbol = $2 RETURNING id`,
    [workspaceId, symbol.toUpperCase().trim()],
  );
  return rows.length > 0;
}

export async function getUniverseEntry(workspaceId: string, symbol: string): Promise<UniverseEntry | null> {
  const rows = await q<UniverseRow>(
    `SELECT * FROM personal_universe WHERE workspace_id = $1 AND symbol = $2`,
    [workspaceId, symbol.toUpperCase().trim()],
  );
  return rows[0] ? rowToEntry(rows[0]) : null;
}

// ----------------------------- Kill switch -----------------------------

export interface KillSwitchState {
  workspaceId: string;
  enabled: boolean;
  reason: string | null;
  setAt: string | null;
  notes: string | null;
  updatedAt: string;
}

export async function getKillSwitchState(workspaceId: string): Promise<KillSwitchState> {
  const rows = await q<{
    workspace_id: string;
    kill_switch_enabled: boolean;
    kill_switch_reason: string | null;
    kill_switch_set_at: Date | null;
    notes: string | null;
    updated_at: Date;
  }>(
    `SELECT * FROM workspace_settings WHERE workspace_id = $1`,
    [workspaceId],
  );
  if (rows.length === 0) {
    return {
      workspaceId, enabled: false, reason: null, setAt: null, notes: null,
      updatedAt: new Date().toISOString(),
    };
  }
  const r = rows[0];
  return {
    workspaceId: r.workspace_id,
    enabled: r.kill_switch_enabled,
    reason: r.kill_switch_reason,
    setAt: r.kill_switch_set_at ? r.kill_switch_set_at.toISOString() : null,
    notes: r.notes,
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function isKillSwitchOn(workspaceId: string): Promise<boolean> {
  const s = await getKillSwitchState(workspaceId);
  return s.enabled;
}

export async function setKillSwitch(opts: {
  workspaceId: string;
  enabled: boolean;
  reason?: string | null;
  actor?: string | null;
}): Promise<KillSwitchState> {
  await q(
    `INSERT INTO workspace_settings (
       workspace_id, kill_switch_enabled, kill_switch_reason, kill_switch_set_at, updated_at
     ) VALUES ($1, $2, $3, CASE WHEN $2 THEN NOW() ELSE NULL END, NOW())
     ON CONFLICT (workspace_id) DO UPDATE SET
       kill_switch_enabled = EXCLUDED.kill_switch_enabled,
       kill_switch_reason  = EXCLUDED.kill_switch_reason,
       kill_switch_set_at  = CASE WHEN EXCLUDED.kill_switch_enabled THEN NOW() ELSE NULL END,
       updated_at = NOW()`,
    [opts.workspaceId, opts.enabled, opts.reason ?? null],
  );
  await q(
    `INSERT INTO kill_switch_log (workspace_id, enabled, reason, actor)
     VALUES ($1, $2, $3, $4)`,
    [opts.workspaceId, opts.enabled, opts.reason ?? null, opts.actor ?? 'admin'],
  );
  // Fire admin notification (never throws). Toggle ON => critical, OFF => warn.
  notifyAdmin({
    subject: opts.enabled
      ? `Kill switch ENABLED · ${opts.workspaceId.slice(0, 8)}`
      : `Kill switch cleared · ${opts.workspaceId.slice(0, 8)}`,
    body: opts.enabled
      ? `Research alerts paused for workspace ${opts.workspaceId}.\nReason: ${opts.reason ?? '(none)'}\nActor: ${opts.actor ?? 'admin'}`
      : `Research alerts resumed for workspace ${opts.workspaceId}.\nActor: ${opts.actor ?? 'admin'}`,
    severity: opts.enabled ? 'critical' : 'warn',
    context: {
      workspaceId: opts.workspaceId,
      enabled: opts.enabled,
      reason: opts.reason ?? null,
      actor: opts.actor ?? 'admin',
    },
    link: { label: 'Open Risk Console', url: 'https://app.marketscannerpros.app/admin/risk' },
  }).catch((e) => console.warn('[killSwitch] notifyAdmin failed:', e));
  return getKillSwitchState(opts.workspaceId);
}

export interface KillSwitchLogEntry {
  id: number;
  enabled: boolean;
  reason: string | null;
  actor: string | null;
  createdAt: string;
}

export async function listKillSwitchLog(workspaceId: string, limit = 20): Promise<KillSwitchLogEntry[]> {
  const rows = await q<{
    id: number; enabled: boolean; reason: string | null;
    actor: string | null; created_at: Date;
  }>(
    `SELECT id, enabled, reason, actor, created_at
       FROM kill_switch_log
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [workspaceId, Math.max(1, Math.min(100, limit))],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    enabled: r.enabled,
    reason: r.reason,
    actor: r.actor,
    createdAt: r.created_at.toISOString(),
  }));
}
