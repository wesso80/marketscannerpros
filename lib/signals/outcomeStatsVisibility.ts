/**
 * Historical outcome totals built from signal_outcomes (and signal_accuracy_stats).
 * Hidden while those labels are untrustworthy. Flip to true only after the stored rows are checked.
 * The same switch keeps win rate, hit rate, and accuracy figures out of AI prompts.
 */
export const SHOW_SIGNAL_OUTCOME_STATS = false;

/** Regime rows for a model prompt. The win_rate column is selected only while outcome stats are visible. */
export function regimeStatsSql(): string {
  if (!SHOW_SIGNAL_OUTCOME_STATS) {
    return `SELECT regime, COUNT(*) as count
     FROM ai_signal_log WHERE workspace_id = $1 AND signal_at > NOW() - INTERVAL '90 days'
     GROUP BY regime ORDER BY count DESC`;
  }
  return `SELECT regime, COUNT(*) as count,
            ROUND(100.0 * COUNT(*) FILTER (WHERE outcome = 'correct') / NULLIF(COUNT(*) FILTER (WHERE outcome != 'pending'), 0), 1) as win_rate
     FROM ai_signal_log WHERE workspace_id = $1 AND signal_at > NOW() - INTERVAL '90 days'
     GROUP BY regime ORDER BY count DESC`;
}

export function regimeStatsForPrompt(
  rows: ReadonlyArray<{ regime: string; count: string | number; win_rate?: string | null }> | null | undefined,
): Array<{ regime: string; count: number; winRate?: number }> {
  return (rows ?? []).map((row) => {
    const count = parseInt(String(row.count), 10);
    if (!SHOW_SIGNAL_OUTCOME_STATS) return { regime: row.regime, count };
    return { regime: row.regime, count, winRate: parseFloat(row.win_rate || '0') };
  });
}

/** Reason codes placed in a model prompt or a client JSON payload. Win-rate, hit-rate, and accuracy lines stay out while the flag is off. */
export function reasonsForPrompt(codes: readonly string[]): string[] {
  if (SHOW_SIGNAL_OUTCOME_STATS) return [...codes];
  return codes.filter((code) => !/win[\s_-]*rate|hit[\s_-]*rate|\baccuracy\b/i.test(code));
}
