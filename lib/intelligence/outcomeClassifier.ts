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

export function classifyOutcome(rMultiple: number | null | undefined): OutcomeLabel {
  if (rMultiple == null || !Number.isFinite(rMultiple)) return 'breakeven';
  if (rMultiple >= 2.0) return 'big_win';
  if (rMultiple >= 0.5) return 'small_win';
  if (rMultiple > -0.5) return 'breakeven';
  if (rMultiple >= -1.0) return 'small_loss';
  return 'big_loss';
}

/**
 * Coarse outcome from R (win/loss/breakeven) used when journal outcome is missing.
 */
export function deriveOutcome(rMultiple: number | null | undefined): 'win' | 'loss' | 'breakeven' {
  if (rMultiple == null || !Number.isFinite(rMultiple)) return 'breakeven';
  if (rMultiple >= 0.5) return 'win';
  if (rMultiple <= -0.5) return 'loss';
  return 'breakeven';
}
