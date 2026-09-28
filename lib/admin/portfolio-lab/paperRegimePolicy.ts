import { q } from '@/lib/db';
import { mapRegimeMatrix } from '@/lib/admin/arca-brain/rowMappers';
import type { RegimePlaybookMatrixRow } from '@/lib/admin/arca-brain/types';

export const PAPER_POLICY_VERSION = 'paper-trend-pilot.v1';
type PolicyInput = Omit<RegimePlaybookMatrixRow, 'id' | 'createdAt' | 'updatedAt'>;

/** Explicit paper-test starting policy; installation is an authenticated operator action. */
export function baselinePaperPolicies(workspaceId: string, updatedBy: string): PolicyInput[] {
  return ['equity', 'crypto'].flatMap(asset => ['risk_on', 'neutral', 'risk_off'].map(regime => ({
    workspaceId, regime: `${asset}:${regime}`, enabledPlaybooks: [],
    reducedSizePlaybooks: regime === 'risk_on' ? ['TREND_CONTINUATION'] : [],
    disabledPlaybooks: [], preferredAssetClasses: [asset],
    avoidedAssetClasses: ['equity', 'crypto', 'commodity', 'options', 'futures'].filter(a => a !== asset),
    requiredConfirmations: regime === 'risk_on' ? ['position_levels_valid', 'long_only'] : [],
    notes: `${PAPER_POLICY_VERSION}: ${regime === 'risk_on'
      ? 'Long trend-continuation paper pilot at 0.5x regime size; current weekly/daily levels required. All other setup, evidence and risk checks remain in force.'
      : 'Stand down: no new entries.'} Unproven paper policy; not a calibrated performance claim.`,
    updatedBy,
  })));
}

/** Insert missing exact keys only. Existing operator policies are never overwritten. Caller owns the transaction/audit. */
export async function installMissingPaperPolicies(workspaceId: string, updatedBy: string): Promise<RegimePlaybookMatrixRow[]> {
  const rows = await q<Record<string, unknown>>(`
    INSERT INTO arca_regime_playbook_matrix
      (workspace_id, regime, enabled_playbooks, reduced_size_playbooks, disabled_playbooks,
       preferred_asset_classes, avoided_asset_classes, required_confirmations, notes, updated_by)
    SELECT $1::uuid, r.regime, r.enabled, r.reduced, r.disabled, r.preferred, r.avoided, r.confirmations, r.notes, $3
    FROM jsonb_to_recordset($2::jsonb) AS r(regime text, enabled text[], reduced text[], disabled text[],
      preferred text[], avoided text[], confirmations text[], notes text)
    ON CONFLICT (workspace_id, regime) DO NOTHING RETURNING *`,
    [workspaceId, JSON.stringify(baselinePaperPolicies(workspaceId, updatedBy).map(p => ({
      regime: p.regime, enabled: p.enabledPlaybooks, reduced: p.reducedSizePlaybooks, disabled: p.disabledPlaybooks,
      preferred: p.preferredAssetClasses, avoided: p.avoidedAssetClasses, confirmations: p.requiredConfirmations, notes: p.notes,
    }))), updatedBy]);
  return rows.map(mapRegimeMatrix);
}
