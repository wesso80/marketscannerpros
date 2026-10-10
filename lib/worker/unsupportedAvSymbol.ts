/**
 * Symbols the equity worker and the stock alert checker must not send to Alpha Vantage.
 *
 * TIME_SERIES_* and REALTIME_BULK_QUOTES answer "Invalid API call" for a futures
 * root, a single-letter ticker AV does not list, or a known-invalid symbol.
 * One bad symbol in a bulk list fails the whole batch. These are dropped first.
 * A and H stay: the universe hygiene fixture treats them as real equities.
 *
 * known_invalid review
 * Brad reviews KNOWN_INVALID and INVALID_SINGLE_LETTER. Add a symbol when the
 * worker log shows Alpha Vantage "Invalid API call" for it, and it is not already
 * a futures root, an index, or a protected equity (A and H). Review the list
 * when that log line appears, and again before a release that changes which
 * symbols are fetched.
 * To remove an entry, delete the symbol from the set and update the tests in
 * the same code change. Do not disable or edit symbol_universe rows here.
 * A universe enable or disable is a separate data change for Brad.
 */
import { KNOWN_FUTURE_ROOTS } from '@/lib/universe/assetClass';

export type AvSkipKind = 'future' | 'single_letter' | 'known_invalid' | 'bad_encoding';

export type AvSymbolDecision =
  | { action: 'fetch'; symbol: string }
  | { action: 'skip'; symbol: string; kind: AvSkipKind; reason: string };

/** Reported Invalid API call symbols that are not futures and not single-letter. */
const KNOWN_INVALID = new Set(['NV', 'GOL', 'ALBT']);
/** Single-letter symbols AV rejects. A and H are real equities and are not here. */
const INVALID_SINGLE_LETTER = new Set(['X', 'I']);

const TICKER = /^[A-Z0-9][A-Z0-9.\-]{0,14}$/;

export function classifyAvEquitySymbol(symbol: string): AvSymbolDecision {
  const raw = String(symbol ?? '').trim();
  const upper = raw.toUpperCase();
  if (!upper) {
    return { action: 'skip', symbol: '', kind: 'bad_encoding', reason: 'empty symbol' };
  }
  if (upper.includes('%') || /\s/.test(raw)) {
    return { action: 'skip', symbol: upper, kind: 'bad_encoding', reason: `${upper} is percent-encoded or not a bare ticker` };
  }
  if (upper.startsWith('/')) {
    return {
      action: 'skip',
      symbol: upper,
      kind: 'future',
      reason: `${upper} is a futures root; Alpha Vantage equity calls do not support it`,
    };
  }
  const root = KNOWN_FUTURE_ROOTS[upper];
  if (root === 'future') {
    return { action: 'skip', symbol: upper, kind: 'future', reason: `${upper} is a futures root, not an Alpha Vantage equity ticker` };
  }
  if (root === 'index') {
    return { action: 'skip', symbol: upper, kind: 'known_invalid', reason: `${upper} is an index, not an Alpha Vantage equity ticker` };
  }
  if (INVALID_SINGLE_LETTER.has(upper)) {
    return { action: 'skip', symbol: upper, kind: 'single_letter', reason: `${upper} is a single-letter symbol Alpha Vantage rejects` };
  }
  if (KNOWN_INVALID.has(upper)) {
    return { action: 'skip', symbol: upper, kind: 'known_invalid', reason: `${upper} is a known-invalid Alpha Vantage symbol` };
  }
  if (!TICKER.test(upper)) {
    return { action: 'skip', symbol: upper, kind: 'bad_encoding', reason: `${upper} is not an Alpha Vantage equity symbol` };
  }
  return { action: 'fetch', symbol: upper };
}

export function partitionAvEquitySymbols(symbols: readonly string[]): {
  fetch: string[];
  skipped: Array<Extract<AvSymbolDecision, { action: 'skip' }>>;
} {
  const fetch: string[] = [];
  const skipped: Array<Extract<AvSymbolDecision, { action: 'skip' }>> = [];
  const seen = new Set<string>();
  for (const symbol of symbols) {
    const decision = classifyAvEquitySymbol(symbol);
    if (decision.action === 'skip') {
      skipped.push(decision);
      continue;
    }
    if (seen.has(decision.symbol)) continue;
    seen.add(decision.symbol);
    fetch.push(decision.symbol);
  }
  return { fetch, skipped };
}

const logged = new Set<string>();

/** First time this process sees the symbol, the worker log line. Later calls are silent. */
export function unsupportedAvLogOnce(decision: AvSymbolDecision): string | null {
  if (decision.action !== 'skip') return null;
  const key = decision.symbol || decision.reason;
  if (logged.has(key)) return null;
  logged.add(key);
  return `[worker] skip ${decision.symbol}: ${decision.reason}`;
}

export function resetUnsupportedAvLogForTests(): void {
  logged.clear();
}
