/**
 * Crypto Derivatives decision inputs.
 * Approved 5 Oct 2026: funding, long/short and open interest. Liquidations are not collected
 * and are never treated as zero.
 */
export const DERIVATIVE_FEED_BASIS = 'Based on 3 of 4 feeds · liquidations not collected';

export function derivativeDecisionReady(
  feeds: { funding: boolean; longShort: boolean; openInterest: boolean },
  fetchErrorCount: number,
): boolean {
  return Boolean(feeds.funding && feeds.longShort && feeds.openInterest) && fetchErrorCount === 0;
}

/** Research wording for the merged conditions box. Permission and playbook are not shown. */
export function conditionsPhrase(permission: string): string | null {
  if (permission === 'Yes') return 'Conditions aligned';
  if (permission === 'Conditional') return 'Conditions partial';
  if (permission === 'No') return 'Conditions not aligned';
  return null;
}

/** Describes the score margin without a directional instruction. */
export function pressurePhrase(bias: string): string | null {
  if (bias === 'BULLISH') return 'Upside pressure';
  if (bias === 'LEAN BULLISH') return 'Upside lean';
  if (bias === 'BEARISH') return 'Downside pressure';
  if (bias === 'LEAN BEARISH') return 'Downside lean';
  if (bias === 'MIXED') return 'Mixed readings';
  if (bias === 'NEUTRAL') return 'Neutral readings';
  return null;
}

/** Clock in Australia/Sydney (AEDT in October). Returns null when the instant is missing. */
export function sydneyClock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const timeZone = 'Australia/Sydney';
  const time = new Intl.DateTimeFormat('en-AU', { timeZone, hour: 'numeric', minute: '2-digit' }).format(ms);
  const zone = new Intl.DateTimeFormat('en-AU', { timeZone, timeZoneName: 'short' })
    .formatToParts(ms)
    .find((part) => part.type === 'timeZoneName')?.value ?? 'AEDT';
  return `${time} ${zone}`;
}
