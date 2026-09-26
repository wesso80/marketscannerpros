/**
 * Close-review answers from the Journal Close modal.
 *
 * Nothing is preset: setup quality, followed plan and error type start "not answered" and are only
 * saved when the user picks a value. The outcome isn't asked for at all; it comes from the realised
 * P&L (same rule as /api/journal/close-trade: > 0 win, < 0 loss, 0 breakeven).
 */

export type SetupQuality = 'A' | 'B' | 'C' | 'D';
export type CloseErrorType =
  | 'none'
  | 'entry_early'
  | 'entry_late'
  | 'no_stop'
  | 'oversize'
  | 'ignored_signal'
  | 'bad_liquidity'
  | 'chop'
  | 'news_spike'
  | 'emotion'
  | 'unknown';
export type CloseOutcome = 'win' | 'loss' | 'breakeven';

/** Outcome from the realised P&L of a close at `exitPrice` (sign only; the multiplier doesn't change it). */
export function closeOutcomeFromPrices(side: 'long' | 'short' | string, entryPrice: number, exitPrice: number): CloseOutcome | null {
  if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || entryPrice <= 0 || exitPrice <= 0) return null;
  const pl = (exitPrice - entryPrice) * (String(side).toLowerCase() === 'short' ? -1 : 1);
  return pl > 0 ? 'win' : pl < 0 ? 'loss' : 'breakeven';
}

/** Tri-state select value → what the API stores in followed_plan. */
export function followedPlanValue(choice: '' | 'yes' | 'no'): boolean | null {
  return choice === 'yes' ? true : choice === 'no' ? false : null;
}

/**
 * Exit notes saved with the close. Only answered fields are included, each labelled.
 * (Previously every close saved "none | breakeven | B | …" even when nothing was chosen.)
 */
export function buildCloseReviewNotes(input: {
  setupQuality?: SetupQuality | '' | null;
  errorType?: CloseErrorType | '' | null;
  reviewText?: string | null;
}): string {
  const parts: string[] = [];
  if (input.setupQuality) parts.push(`Setup quality: ${input.setupQuality}`);
  if (input.errorType) parts.push(`Error type: ${input.errorType}`);
  const text = (input.reviewText || '').trim();
  if (text) parts.push(text);
  return parts.join(' | ');
}
