/**
 * Plain labels for the legacy (v2.0) execution diagnostics (`scoreV2.execution.blockReasons`, app/api/scanner/bulk)
 * that the Pro table's Reason column still surfaces. They are diagnostics only: permission comes from the canonical
 * engine and hard blocks, never from these.
 *
 * `risk_mode_block` is raised both for a risk-off tape (ATR ≥ 6% or a ≥ 8% move today) AND whenever the MSP factor
 * composite has no net direction (it then also raises `direction_neutral`). The second case used to be shown as "Risk
 * mode blocks escalation", which read as a regime cap; it only means the MSP factors cancel out (hence a low MSP score).
 */
export function legacyExecutionReason(blockReasons: readonly string[] | null | undefined): string | null {
  const r = blockReasons ?? [];
  if (r.includes('direction_neutral')) return 'MSP factors split (no net direction)';
  if (r.includes('risk_mode_block')) return 'Risk-off tape (ATR ≥ 6% or ≥ 8% move today)';
  if (r.includes('tf_alignment_low')) return 'Alignment below threshold';
  return null;
}
