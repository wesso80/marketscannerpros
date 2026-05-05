/**
 * Phase 8 — model / rules version registry helpers.
 *
 * Backed by the `brain_model_versions` table (migration 075). Append-only.
 * New rules ALWAYS get a new row; prior rows are preserved for replay.
 *
 * Hard contract:
 *   - Never UPDATE a prior row's body. Only `superseded_at` /
 *     `superseded_by_id` may be set on prior rows (handled by the
 *     `brain_register_model_version` SQL function).
 *   - `rulesHash` is sha256 of the rule body (prompt text, scoring
 *     constants, etc.) and lets us detect silent drift.
 */

import crypto from 'node:crypto';
import { q } from '@/lib/db';

export interface RegisterModelVersionParams {
  modelName: string;
  version: string;
  /** Free-form rule body whose sha256 will be stored as rules_hash. */
  rulesBody: string | Buffer;
  /** 'global' for system-wide; otherwise a workspace_id. */
  scope?: string;
  deployedBy?: string;
  notes?: string;
  meta?: Record<string, unknown>;
}

export interface ModelVersionRow {
  id: number;
  modelName: string;
  version: string;
  rulesHash: string;
  scope: string;
  deployedAt: Date;
  deployedBy: string | null;
  supersededAt: Date | null;
  supersededById: number | null;
  notes: string | null;
  meta: Record<string, unknown>;
}

export function hashRulesBody(body: string | Buffer): string {
  return crypto.createHash('sha256').update(body).digest('hex');
}

/**
 * Register a new (model_name, version, scope, rules_hash) row and atomically
 * supersede prior active rows for the same (model_name, scope).
 * Returns the new row id.
 */
export async function registerModelVersion(
  params: RegisterModelVersionParams,
): Promise<number> {
  const {
    modelName,
    version,
    rulesBody,
    scope = 'global',
    deployedBy = null,
    notes = null,
    meta = {},
  } = params;

  if (!modelName) throw new Error('registerModelVersion: modelName required');
  if (!version) throw new Error('registerModelVersion: version required');

  const rulesHash = hashRulesBody(rulesBody);

  const rows = await q<{ id: string | number }>(
    `SELECT brain_register_model_version($1, $2, $3, $4, $5, $6, $7::jsonb) AS id`,
    [modelName, version, rulesHash, scope, deployedBy, notes, JSON.stringify(meta)],
  );
  const id = rows[0]?.id;
  if (id == null) throw new Error('registerModelVersion: registration failed');
  return Number(id);
}

/** Fetch the currently-active row for (modelName, scope), or null. */
export async function getActiveModelVersion(
  modelName: string,
  scope = 'global',
): Promise<ModelVersionRow | null> {
  const rows = await q<{
    id: number;
    model_name: string;
    version: string;
    rules_hash: string;
    scope: string;
    deployed_at: string;
    deployed_by: string | null;
    superseded_at: string | null;
    superseded_by_id: number | null;
    notes: string | null;
    meta: Record<string, unknown>;
  }>(
    `SELECT id, model_name, version, rules_hash, scope, deployed_at, deployed_by,
            superseded_at, superseded_by_id, notes, meta
       FROM brain_model_versions
      WHERE model_name = $1 AND scope = $2 AND superseded_at IS NULL
      ORDER BY deployed_at DESC
      LIMIT 1`,
    [modelName, scope],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    modelName: r.model_name,
    version: r.version,
    rulesHash: r.rules_hash,
    scope: r.scope,
    deployedAt: new Date(r.deployed_at),
    deployedBy: r.deployed_by,
    supersededAt: r.superseded_at ? new Date(r.superseded_at) : null,
    supersededById: r.superseded_by_id,
    notes: r.notes,
    meta: r.meta ?? {},
  };
}

/** Full version history for (modelName, scope), newest first. */
export async function listModelVersions(
  modelName: string,
  scope = 'global',
): Promise<ModelVersionRow[]> {
  const rows = await q<{
    id: number;
    model_name: string;
    version: string;
    rules_hash: string;
    scope: string;
    deployed_at: string;
    deployed_by: string | null;
    superseded_at: string | null;
    superseded_by_id: number | null;
    notes: string | null;
    meta: Record<string, unknown>;
  }>(
    `SELECT id, model_name, version, rules_hash, scope, deployed_at, deployed_by,
            superseded_at, superseded_by_id, notes, meta
       FROM brain_model_versions
      WHERE model_name = $1 AND scope = $2
      ORDER BY deployed_at DESC`,
    [modelName, scope],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    modelName: r.model_name,
    version: r.version,
    rulesHash: r.rules_hash,
    scope: r.scope,
    deployedAt: new Date(r.deployed_at),
    deployedBy: r.deployed_by,
    supersededAt: r.superseded_at ? new Date(r.superseded_at) : null,
    supersededById: r.superseded_by_id,
    notes: r.notes,
    meta: r.meta ?? {},
  }));
}
