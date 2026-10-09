/**
 * Which equity symbols the daily scan still needs to fetch.
 * A symbol is due when its newest stored scan_date is before the last completed US session.
 * When every symbol is already on that session, the catch-up run makes no vendor calls.
 */
export function symbolsBehindEquitySession(
  stored: ReadonlyArray<{ symbol: string; scanDate: string | null }>,
  expectedSession: string,
  universe: readonly string[],
): string[] {
  const have = new Map(stored.map((row) => [row.symbol.toUpperCase(), row.scanDate ?? '']));
  return universe.filter((symbol) => (have.get(symbol.toUpperCase()) ?? '') < expectedSession);
}
