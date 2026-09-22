/** A directional thesis cannot authorize an option entry without usable evidence. */
export function optionEntryBlocker(input: { quotedStrikes: number; freshness: string; hasExpiry: boolean; hasCurrentIV: boolean }): string | null {
  if (input.quotedStrikes < 1) return 'No usable two-sided quotes near spot on the selected expiry.';
  if (!input.hasExpiry) return 'No eligible listed expiry is available.';
  if (!input.hasCurrentIV) return 'Current ATM implied volatility is unavailable.';
  if (input.freshness !== 'REALTIME') return 'Live option quote timing is unverified; refresh before selecting an entry.';
  return null;
}
