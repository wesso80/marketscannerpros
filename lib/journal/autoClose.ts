/**
 * Journal auto-close sweep (/api/jobs/journal-auto-close): the close rules and the price each
 * open trade is checked against.
 *
 * Options: stop, target and entry are the option's premium per share, so an option trade is
 * checked against its own contract mark (the same Alpha Vantage chain mark the Journal and
 * Portfolio use; usually the previous session's EOD value). The underlying's price is never
 * used for an option. If no usable contract mark exists the trade is skipped, not closed.
 */
import { optionContractSpec, type OptionContractSpec } from '@/lib/options/contractQuote';
import type { OptionContractMarkResult } from '@/lib/options/contractMarkServer';

export type ExitReason = 'tp' | 'sl' | 'time' | 'drawdown';

/** Emergency drawdown threshold — auto-close if trade loses more than 30% */
export const MAX_DRAWDOWN_PCT = 30;
/** Time stop: trades open this many days (UTC calendar days since trade_date) are closed. */
export const MAX_DAYS_OPEN = 5;

export type AutoCloseEntry = {
  side: 'LONG' | 'SHORT' | string;
  trade_date: string;
  entry_price: string | number;
  stop_loss: string | number | null;
  target: string | number | null;
  symbol: string;
  asset_class?: string | null;
  trade_type?: string | null;
  option_type?: string | null;
  strike_price?: string | number | null;
  expiration_date?: string | Date | null;
};

function parseNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A stop/target level only counts when one is actually recorded (a positive number). */
function recordedLevel(value: unknown): number | null {
  const n = parseNumber(value);
  return n != null && n > 0 ? n : null;
}

// Kept exactly as the original route computed it. NOTE: node-postgres returns a DATE column as a JS
// Date, so `${tradeDate}T00:00:00.000Z` does not parse and this returns 0 for rows read from the DB;
// the 5-day time stop therefore does not fire in production today. Reported, deliberately not changed
// here (fixing it would close every trade older than 5 days on the next sweep).
function computeTimeOpenDays(tradeDate: string, nowMs: number): number {
  const openedMs = Date.parse(`${tradeDate}T00:00:00.000Z`);
  if (!Number.isFinite(openedMs)) return 0;
  const elapsed = nowMs - openedMs;
  return Math.max(0, Math.floor(elapsed / (24 * 60 * 60 * 1000)));
}

/**
 * Rules unchanged from the original route: stop, then target, then 5-day time stop, then -30% drawdown.
 * Only fix: a NULL stop/target is treated as no stop/target instead of 0.
 */
export function evaluateCloseReason(entry: AutoCloseEntry, currentPrice: number, nowMs: number = Date.now()): ExitReason | null {
  // A missing stop/target means "none". The original route turned NULL into 0 (Number(null) === 0),
  // which made a SHORT with no stop hit "stop 0" and a LONG with no target hit "target 0" on every sweep.
  const stop = recordedLevel(entry.stop_loss);
  const target = recordedLevel(entry.target);
  const side = String(entry.side || 'LONG').toUpperCase() as 'LONG' | 'SHORT';

  const stopHit = stop != null && (side === 'LONG' ? currentPrice <= stop : currentPrice >= stop);
  const targetHit = target != null && (side === 'LONG' ? currentPrice >= target : currentPrice <= target);

  if (stopHit) return 'sl';
  if (targetHit) return 'tp';

  const timeOpenDays = computeTimeOpenDays(entry.trade_date, nowMs);
  if (timeOpenDays >= MAX_DAYS_OPEN) {
    return 'time';
  }

  // Emergency drawdown protection — close trades bleeding > MAX_DRAWDOWN_PCT
  const entryPrice = parseNumber(entry.entry_price);
  if (entryPrice && entryPrice > 0) {
    const pnlPct = side === 'LONG'
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;
    if (pnlPct <= -MAX_DRAWDOWN_PCT) {
      return 'drawdown';
    }
  }

  return null;
}

export function isOptionEntry(entry: Pick<AutoCloseEntry, 'trade_type' | 'asset_class'>): boolean {
  return String(entry.trade_type || '').toLowerCase() === 'options'
    || String(entry.asset_class || '').toLowerCase() === 'options';
}

export function autoCloseOptionContract(entry: AutoCloseEntry): OptionContractSpec | null {
  // node-postgres returns a DATE as a Date at LOCAL midnight; read the local calendar date back.
  const d = entry.expiration_date;
  const expiration = d instanceof Date
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : d;
  return optionContractSpec({
    symbol: entry.symbol,
    optionType: entry.option_type,
    strikePrice: entry.strike_price,
    expirationDate: expiration,
  });
}

export type AutoCloseMark =
  | { ok: true; price: number; kind: 'option_premium'; note: string }
  | { ok: true; price: number; kind: 'quote'; note: null }
  | { ok: false; reason: string };

export interface AutoCloseMarkDeps {
  fetchQuote: () => Promise<number | null>;
  fetchOptionMark: (spec: OptionContractSpec) => Promise<OptionContractMarkResult>;
}

/**
 * The price an open trade is checked (and, if closed, exited) at.
 * Options: the contract's own premium mark, or a skip reason. Never the underlying's quote.
 */
export async function resolveAutoCloseMark(entry: AutoCloseEntry, deps: AutoCloseMarkDeps): Promise<AutoCloseMark> {
  if (isOptionEntry(entry)) {
    const spec = autoCloseOptionContract(entry);
    if (!spec) return { ok: false, reason: 'option_contract_incomplete' };
    const mark = await deps.fetchOptionMark(spec).catch(() => ({ ok: false as const, reason: 'provider_error' as const }));
    if (!mark.ok) return { ok: false, reason: `option_mark_unavailable:${mark.reason}` };
    const basis = mark.basis === 'REALTIME' ? 'realtime' : 'EOD';
    return {
      ok: true,
      price: mark.price,
      kind: 'option_premium',
      note: `option premium per share, ${basis}${mark.asOfDate ? ` ${mark.asOfDate}` : ''}`,
    };
  }
  const price = await deps.fetchQuote().catch(() => null);
  if (price == null || !Number.isFinite(price) || price <= 0) return { ok: false, reason: 'price_unavailable' };
  return { ok: true, price, kind: 'quote', note: null };
}
