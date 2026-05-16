/**
 * lib/admin/arca-brain/regimePlaybookDecision.ts
 *
 * Rich evaluator for the Regime-Playbook Matrix. Wraps the existing
 * `playbookPermission` 3-state engine and returns a structured
 * decision the live cycle can act on: size multiplier, required
 * confirmations, disqualifiers, and reason text.
 *
 * Admin-only.
 */

import type { RegimePlaybookMatrixRow } from "./types";

export type RegimePlaybookStatus =
  | "ENABLED"
  | "REDUCE_SIZE"
  | "WAIT_FOR_CONFIRMATION"
  | "DISABLED"
  | "UNKNOWN_REGIME"
  | "UNKNOWN_PLAYBOOK";

export interface RegimePlaybookDecision {
  regime: string | null;
  playbookId: string | null;
  status: RegimePlaybookStatus;
  /** 0..1 multiplier to apply to final position size. 0 = no trade. */
  sizeMultiplier: number;
  reason: string;
  requiredConfirmations: string[];
  disqualifiers: string[];
  sourceRuleId: string | null;
}

export interface EvaluateRegimePlaybookOpts {
  /**
   * When true (default) UNKNOWN_REGIME becomes WAIT_FOR_CONFIRMATION
   * (size 0) and UNKNOWN_PLAYBOOK becomes REDUCE_SIZE at 0.25.
   * When false UNKNOWN_REGIME becomes REDUCE_SIZE at 0.5.
   */
  strict?: boolean;
  /** Optional asset class to enforce preferred/avoided lists. */
  assetClass?: string | null;
  /** Reduced-size multiplier (default 0.5). */
  reducedMultiplier?: number;
  /** Experimental multiplier for UNKNOWN_PLAYBOOK (default 0.25). */
  experimentalMultiplier?: number;
}

/**
 * Decide what the live cycle should do with this candidate given the
 * matrix row for the current regime. Pure — does not touch the DB.
 *
 * Hierarchy:
 *   1. No matrix row at all → UNKNOWN_REGIME
 *   2. Playbook missing → UNKNOWN_PLAYBOOK
 *   3. Asset class avoided → DISABLED
 *   4. Playbook in disabledPlaybooks → DISABLED
 *   5. enabledPlaybooks set & playbook not listed → DISABLED
 *      (matrix is an allow-list when enabledPlaybooks is non-empty)
 *   6. Playbook in reducedSizePlaybooks → REDUCE_SIZE
 *   7. requiredConfirmations present → WAIT_FOR_CONFIRMATION (caller
 *      may downgrade to ENABLED once confirmations are present —
 *      the cycle does not know that yet, so it is honest here)
 *   8. Else → ENABLED
 */
export function evaluateRegimePlaybook(
  matrix: RegimePlaybookMatrixRow | null,
  playbookId: string | null,
  opts: EvaluateRegimePlaybookOpts = {},
): RegimePlaybookDecision {
  const strict = opts.strict !== false;
  const reduced = opts.reducedMultiplier ?? 0.5;
  const experimental = opts.experimentalMultiplier ?? 0.25;
  const assetClass = opts.assetClass ?? null;

  const base = {
    regime: matrix?.regime ?? null,
    playbookId,
    requiredConfirmations: matrix?.requiredConfirmations ?? [],
    disqualifiers: [] as string[],
    sourceRuleId: matrix?.id ?? null,
  };

  // 1. No matrix row → unknown regime
  if (!matrix) {
    return {
      ...base,
      status: "UNKNOWN_REGIME",
      sizeMultiplier: strict ? 0 : reduced,
      reason: strict
        ? "no regime matrix row loaded — strict policy waits for confirmation"
        : "no regime matrix row loaded — running at reduced size",
      disqualifiers: ["regime_matrix_missing"],
    };
  }

  // 2. Playbook id absent
  if (!playbookId) {
    return {
      ...base,
      status: "UNKNOWN_PLAYBOOK",
      sizeMultiplier: strict ? experimental : reduced,
      reason: "candidate has no playbook id — treated as experimental",
      disqualifiers: ["playbook_id_missing"],
    };
  }

  // 3. Avoided asset class
  if (assetClass && matrix.avoidedAssetClasses.includes(assetClass)) {
    return {
      ...base,
      status: "DISABLED",
      sizeMultiplier: 0,
      reason: `asset_class=${assetClass} is avoided in regime=${matrix.regime}`,
      disqualifiers: [`avoided_asset_class:${assetClass}`],
    };
  }

  // 4. Explicit disabled
  if (matrix.disabledPlaybooks.includes(playbookId)) {
    return {
      ...base,
      status: "DISABLED",
      sizeMultiplier: 0,
      reason: `playbook=${playbookId} is DISABLED in regime=${matrix.regime}`,
      disqualifiers: [`disabled_playbook:${playbookId}`],
    };
  }

  // 5. Allow-list miss
  if (matrix.enabledPlaybooks.length > 0 && !matrix.enabledPlaybooks.includes(playbookId)) {
    return {
      ...base,
      status: "DISABLED",
      sizeMultiplier: 0,
      reason: `playbook=${playbookId} not in regime=${matrix.regime} enabledPlaybooks allow-list`,
      disqualifiers: [`not_in_allow_list:${playbookId}`],
    };
  }

  // 6. Reduced size
  if (matrix.reducedSizePlaybooks.includes(playbookId)) {
    return {
      ...base,
      status: "REDUCE_SIZE",
      sizeMultiplier: reduced,
      reason: `playbook=${playbookId} REDUCE_SIZE in regime=${matrix.regime}`,
    };
  }

  // 7. Required confirmations gate
  if (matrix.requiredConfirmations.length > 0) {
    return {
      ...base,
      status: "WAIT_FOR_CONFIRMATION",
      sizeMultiplier: 0,
      reason:
        `regime=${matrix.regime} requires confirmation(s): ` +
        matrix.requiredConfirmations.join(", "),
    };
  }

  // 8. Enabled
  return {
    ...base,
    status: "ENABLED",
    sizeMultiplier: 1,
    reason: `playbook=${playbookId} ENABLED in regime=${matrix.regime}`,
  };
}
