/**
 * lib/admin/arca-brain/regimePlaybookMatrix.ts
 *
 * Per-regime playbook permissions (enabled / reduced-size / disabled).
 * Decision engines must consult this before ranking candidates.
 *
 * Admin-only.
 */

import { q } from "@/lib/db";
import { mapRegimeMatrix } from "./rowMappers";
import type { RegimePlaybookMatrixRow } from "./types";

export async function upsertRegimeMatrix(
  row: Omit<RegimePlaybookMatrixRow, "id" | "createdAt" | "updatedAt">,
): Promise<RegimePlaybookMatrixRow> {
  const rows = await q<Record<string, unknown>>(
    `INSERT INTO arca_regime_playbook_matrix
       (workspace_id, regime, enabled_playbooks, reduced_size_playbooks,
        disabled_playbooks, preferred_asset_classes, avoided_asset_classes,
        required_confirmations, notes, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (workspace_id, regime) DO UPDATE
       SET enabled_playbooks       = EXCLUDED.enabled_playbooks,
           reduced_size_playbooks  = EXCLUDED.reduced_size_playbooks,
           disabled_playbooks      = EXCLUDED.disabled_playbooks,
           preferred_asset_classes = EXCLUDED.preferred_asset_classes,
           avoided_asset_classes   = EXCLUDED.avoided_asset_classes,
           required_confirmations  = EXCLUDED.required_confirmations,
           notes                   = EXCLUDED.notes,
           updated_by              = EXCLUDED.updated_by
     RETURNING *`,
    [
      row.workspaceId,
      row.regime,
      row.enabledPlaybooks,
      row.reducedSizePlaybooks,
      row.disabledPlaybooks,
      row.preferredAssetClasses,
      row.avoidedAssetClasses,
      row.requiredConfirmations,
      row.notes ?? null,
      row.updatedBy,
    ],
  );
  return mapRegimeMatrix(rows[0]);
}

export async function listRegimeMatrix(workspaceId: string): Promise<RegimePlaybookMatrixRow[]> {
  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM arca_regime_playbook_matrix WHERE workspace_id = $1 ORDER BY regime`,
    [workspaceId],
  );
  return rows.map(mapRegimeMatrix);
}

export async function getRegimeMatrix(workspaceId: string, regime: string): Promise<RegimePlaybookMatrixRow | null> {
  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM arca_regime_playbook_matrix WHERE workspace_id = $1 AND regime = $2 LIMIT 1`,
    [workspaceId, regime],
  );
  return rows.length ? mapRegimeMatrix(rows[0]) : null;
}

/**
 * Decides whether a playbook may run under the current regime.
 * Returns: 'allow' | 'reduce' | 'block'.
 */
export function playbookPermission(
  matrix: RegimePlaybookMatrixRow | null,
  playbookId: string | null,
): "allow" | "reduce" | "block" {
  if (!matrix || !playbookId) return "allow";
  if (matrix.disabledPlaybooks.includes(playbookId)) return "block";
  if (matrix.reducedSizePlaybooks.includes(playbookId)) return "reduce";
  if (matrix.enabledPlaybooks.length > 0 && !matrix.enabledPlaybooks.includes(playbookId)) return "block";
  return "allow";
}
