/**
 * Profit-factor scoring for the backtest page (edge score, WAIT/PREP/EXECUTE, next-step
 * text, timeframe/universe ranking).
 *
 * Profit factor is null when there are no losing trades. That used to score as 0, so an
 * all-winner run ranked below losing runs. Now:
 *  - winners and no losers  -> the top of the scale (PROFIT_FACTOR_SCORE_CAP)
 *  - no trades, or only break-even trades -> 0 (unchanged)
 *  - numeric PF -> capped at the same maximum, so "no losses" is never out-ranked by a
 *    finite PF and one huge PF can't dominate the ranking on its own.
 * EXECUTE also needs at least MIN_TRADES_FOR_EXECUTE trades, the same threshold the
 * backtest diagnostics already use for "low_sample_size" (lib/backtest/diagnostics.ts),
 * so a lucky 2-for-2 run can't become EXECUTE.
 */

/** Edge score = PF x 25 + ..., clamped to 99; PF 4 already fills the scale. */
export const PROFIT_FACTOR_SCORE_CAP = 4;
/** Same as diagnostics' low_sample_size rule (fewer than 8 trades). */
export const MIN_TRADES_FOR_EXECUTE = 8;

export interface ProfitFactorInput {
  profitFactor: number | null | undefined;
  totalTrades: number;
  totalReturn?: number;
  winningTrades?: number;
  losingTrades?: number;
}

/** Winners and zero losers: profit factor is undefined because gross loss is 0. */
export function hasNoLosses(r: ProfitFactorInput): boolean {
  if (r.profitFactor != null || !(r.totalTrades > 0)) return false;
  if (r.losingTrades != null && r.losingTrades > 0) return false;
  if (r.winningTrades != null) return r.winningTrades > 0;
  // Rows without win/loss counts: with no losses, a positive total means there were winners.
  return (r.totalReturn ?? 0) > 0;
}

export function scoreProfitFactor(r: ProfitFactorInput): number {
  if (r.profitFactor == null) return hasNoLosses(r) ? PROFIT_FACTOR_SCORE_CAP : 0;
  if (!Number.isFinite(r.profitFactor)) return r.profitFactor > 0 ? PROFIT_FACTOR_SCORE_CAP : 0;
  return Math.min(r.profitFactor, PROFIT_FACTOR_SCORE_CAP);
}

export function hasSufficientSample(r: Pick<ProfitFactorInput, 'totalTrades'>): boolean {
  return r.totalTrades >= MIN_TRADES_FOR_EXECUTE;
}

export type BacktestAction = 'WAIT' | 'PREP' | 'EXECUTE';

/** EXECUTE needs PF score >= 1.25, drawdown <= 20% and an adequate sample; else PREP (>= 1) or WAIT. */
export function backtestAction(r: ProfitFactorInput & { maxDrawdown: number }): BacktestAction {
  const pf = scoreProfitFactor(r);
  if (pf >= 1.25 && r.maxDrawdown <= 20 && hasSufficientSample(r)) return 'EXECUTE';
  return pf >= 1 ? 'PREP' : 'WAIT';
}

/** Would be EXECUTE on profit factor and drawdown, but the trade sample is too small. */
export function isBlockedBySampleSize(r: ProfitFactorInput & { maxDrawdown: number }): boolean {
  return scoreProfitFactor(r) >= 1.25 && r.maxDrawdown <= 20 && !hasSufficientSample(r);
}

/** "1.85", "∞ (no losses)", or "n/a" (no trades / only break-even trades). */
export function formatProfitFactorValue(r: ProfitFactorInput): string {
  if (r.profitFactor != null && Number.isFinite(r.profitFactor)) return r.profitFactor.toFixed(2);
  return hasNoLosses(r) ? '∞ (no losses)' : 'n/a';
}
