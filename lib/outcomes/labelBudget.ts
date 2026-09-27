/** Rows per horizon per run (oldest first). AI_OUTCOME_MAX_ROWS overrides; admin pages now log more calls. */
export function maxRowsPerHorizon(): number {
  const n = Number(process.env.AI_OUTCOME_MAX_ROWS);
  return Number.isFinite(n) && n >= 1 ? Math.min(1000, Math.floor(n)) : 300;
}
/**
 * Budget for starting new rows per run (including rows with cached prices). The Render cron (label-signal-outcomes) curls this route with
 * --max-time 120 and --retry 3 --retry-all-errors: a run that outlasts curl is retried while the first one is still
 * going, duplicating every AV call. Past the budget, remaining rows
 * wait for the next run (every 6 h). AI_OUTCOME_TIME_BUDGET_MS overrides (default 90 s).
 */
export function labellerTimeBudgetMs(): number {
  const n = Number(process.env.AI_OUTCOME_TIME_BUDGET_MS);
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 90_000;
}
/**
 * Price-lookup budget for the 6w/12w horizons, which run after 4h/24h: whatever is left of the main budget, at least
 * 5 s (so rows whose daily bars load quickly still progress) and at most 30 s (bounds new work; an in-flight lookup or query may overrun).
 */
export function positionBudgetMs(mainBudgetMs: number, elapsedMs: number): number {
  return Math.max(5_000, Math.min(30_000, mainBudgetMs - elapsedMs));
}
