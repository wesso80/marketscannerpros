/**
 * Plain labels for the legacy (v2.0) execution diagnostics (`scoreV2.execution.blockReasons`, app/api/scanner/bulk)
 * that the Pro table's Reason column still surfaces. They are diagnostics only: permission comes from the canonical
 * engine and hard blocks, never from these.
 *
 * `risk_mode_block` is raised both for a risk-off tape (ATR% or today's move at/above the asset class's
 * riskOffThresholds(); equity 6% / 8%) AND whenever the MSP factor
 * composite has no net direction (it then also raises `direction_neutral`). The second case used to be shown as "Risk
 * mode blocks escalation", which read as a regime cap; it only means the MSP factors cancel out (hence a low MSP score).
 */
export interface RiskOffThresholdsUsed {
  atrPct: number;
  movePct: number;
  assetClass?: string;
}

/** `thresholds` = the ones the scan actually used (`scoreV2.context.riskOffThresholds`); older payloads fall back to equity 6% / 8%. */
export function legacyExecutionReason(
  blockReasons: readonly string[] | null | undefined,
  thresholds?: RiskOffThresholdsUsed | null,
): string | null {
  const r = blockReasons ?? [];
  if (r.includes('direction_neutral')) return 'MSP factors split (no net direction)';
  if (r.includes('risk_mode_block')) {
    const t = thresholds && Number.isFinite(thresholds.atrPct) && Number.isFinite(thresholds.movePct)
      ? thresholds
      : { atrPct: 6, movePct: 8, assetClass: 'equity' };
    const cls = t.assetClass ? `${t.assetClass} ` : '';
    return `Risk-off tape (${cls}ATR ≥ ${t.atrPct}% or ≥ ${t.movePct}% move today)`;
  }
  if (r.includes('tf_alignment_low')) return 'Alignment below threshold';
  return null;
}
