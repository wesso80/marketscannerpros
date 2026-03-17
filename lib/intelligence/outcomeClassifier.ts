/**
 * Outcome classification for the intelligence layer.
 * Labels trades by R-multiple magnitude to enable edge-profile stratification.
 */

export type OutcomeLabel =
  | 'big_win'      // R >= 2.0
  | 'small_win'    // 0.5 <= R < 2.0
  | 'breakeven'    // -0.5 < R < 0.5
  | 'small_loss'   // -1.0 <= R <= -0.5
  | 'big_loss';    // R < -1.0

export function classifyOutcome(
  rMultiple: number | null | undefined,
  pl?: number | null
): OutcomeLabel {
  if (rMultiple != null && Number.isFinite(rMultiple)) {
    if (rMultiple >= 2.0) return 'big_win';
    if (rMultiple >= 0.5) return 'small_win';
    if (rMultiple > -0.5) return 'breakeven';
    if (rMultiple >= -1.0) return 'small_loss';
    return 'big_loss';
  }
  // Fallback: coarse classification from P&L when no R-multiple
  if (pl != null && Number.isFinite(pl)) {
    if (pl > 0) return 'small_win';
    if (pl < 0) return 'small_loss';
  }
  return 'breakeven';
}

/**
 * Coarse outcome from R (win/loss/breakeven) used when journal outcome is missing.
 * Falls back to P&L when R-multiple is unavailable.
 */
export function deriveOutcome(
  rMultiple: number | null | undefined,
  pl?: number | null
): 'win' | 'loss' | 'breakeven' {
  if (rMultiple != null && Number.isFinite(rMultiple)) {
    if (rMultiple >= 0.5) return 'win';
    if (rMultiple <= -0.5) return 'loss';
    return 'breakeven';
  }
  // Fallback: use raw P&L when R-multiple is unavailable
  if (pl != null && Number.isFinite(pl)) {
    if (pl > 0) return 'win';
    if (pl < 0) return 'loss';
  }
  return 'breakeven';
}
