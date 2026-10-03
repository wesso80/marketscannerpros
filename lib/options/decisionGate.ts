/** A directional thesis cannot authorize an option entry without usable evidence. */
export function optionEntryBlocker(input: { quotedStrikes: number; freshness: string; hasExpiry: boolean; hasCurrentIV: boolean }): string | null {
  if (input.quotedStrikes < 1) return 'No usable two-sided quotes near spot on the selected expiry.';
  if (!input.hasExpiry) return 'No eligible listed expiry is available.';
  if (!input.hasCurrentIV) return 'Current ATM implied volatility is unavailable.';
  if (input.freshness !== 'REALTIME') return 'Live option quote timing is unverified; refresh before selecting an entry.';
  return null;
}

/** Dated research is distinct from an executable recommendation. Stale/missing evidence stays withheld. */
export function datedResearchCandidates<S, E>(strikes: S[], expiry: E | null, input: {
  freshness: string; asOf: string; quotedStrikes: number; hasCurrentIV: boolean;
}): {strikes:S[]; expiry:E; asOf:string; entryTiming:string} | null {
  if (!['EOD','REALTIME'].includes(input.freshness) || !/^\d{4}-\d{2}-\d{2}/.test(input.asOf) || !strikes.length || !expiry || input.quotedStrikes < 1 || !input.hasCurrentIV) return null;
  return {strikes,expiry,asOf:input.asOf,entryTiming:input.freshness==='REALTIME'?'Research only — review entry checks':'Wait for live quotes'};
}
