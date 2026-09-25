/**
 * Pricing a single recorded option contract (journal / portfolio positions) from an Alpha Vantage options chain.
 *
 * Positions record the contract as underlying + expiration + strike + right, with entry/stop in PREMIUM per share
 * (the standard option quote). Value and P&L therefore need the contract multiplier; R stays in premium terms.
 * The site's option source is Alpha Vantage REALTIME_OPTIONS (live bid/ask, premium entitlement) → HISTORICAL_OPTIONS (EOD,
 * previous session), so a mark is usually an end-of-day value and must be labelled as such.
 */
import { isEodDataCurrent } from '@/lib/equityDataHealth';

/** US equity/ETF options: 100 shares per contract. No per-record multiplier is stored in the schema today. */
export const DEFAULT_OPTION_MULTIPLIER = 100;

export type OptionRight = 'call' | 'put';

export interface OptionContractSpec {
  underlying: string;
  expiration: string; // YYYY-MM-DD
  strike: number;
  right: OptionRight;
}

export function normalizeOptionRight(raw: unknown): OptionRight | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'call' || value === 'c') return 'call';
  if (value === 'put' || value === 'p') return 'put';
  return null;
}

/** YYYY-MM-DD from a DATE column value ('2026-10-16' or its ISO-midnight serialisation). */
export function normalizeExpiration(raw: unknown): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw ?? '').trim());
  if (!match || !Number.isFinite(Date.parse(`${match[1]}T00:00:00Z`))) return null;
  return match[1];
}

/** The recorded contract, or null when strike / expiration / right is missing (then no quote can be looked up). */
export function optionContractSpec(input: {
  symbol?: string | null;
  optionType?: unknown;
  strikePrice?: unknown;
  expirationDate?: unknown;
}): OptionContractSpec | null {
  const underlying = String(input.symbol ?? '').toUpperCase().trim();
  const right = normalizeOptionRight(input.optionType);
  const strike = Number(input.strikePrice);
  const expiration = normalizeExpiration(input.expirationDate);
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(underlying) || !right || !Number.isFinite(strike) || strike <= 0 || !expiration) return null;
  return { underlying, expiration, strike, right };
}

export function optionContractKey(spec: OptionContractSpec): string {
  return `option:${spec.underlying}:${spec.expiration}:${spec.strike}:${spec.right === 'call' ? 'C' : 'P'}`;
}

export function optionQuoteUrl(spec: OptionContractSpec): string {
  const params = new URLSearchParams({
    symbol: spec.underlying,
    expiration: spec.expiration,
    strike: String(spec.strike),
    right: spec.right,
  });
  return `/api/journal/option-quote?${params.toString()}`;
}

/** Alpha Vantage per-contract row (strings). */
export interface AVChainContract {
  contractID?: string;
  symbol?: string;
  expiration?: string;
  strike?: string | number;
  type?: string;
  mark?: string | number;
  bid?: string | number;
  ask?: string | number;
  last?: string | number;
  date?: string;
}

const positive = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export interface OptionContractMark {
  price: number;
  priceField: 'mark' | 'mid' | 'last';
  asOfDate: string | null;
  contractId: string | null;
}

/** Find the exact recorded contract in a chain and price it (mark → bid/ask mid → last). Null if not found / unpriced. */
export function findOptionContractMark(contracts: AVChainContract[], spec: OptionContractSpec): OptionContractMark | null {
  const contract = contracts.find((c) =>
    normalizeExpiration(c.expiration) === spec.expiration
    && normalizeOptionRight(c.type) === spec.right
    && Math.abs(Number(c.strike) - spec.strike) < 0.0005
    && (!c.symbol || String(c.symbol).toUpperCase() === spec.underlying));
  if (!contract) return null;
  const mark = positive(contract.mark);
  const bid = positive(contract.bid);
  const ask = positive(contract.ask);
  const last = positive(contract.last);
  const priced = mark != null
    ? { price: mark, priceField: 'mark' as const }
    : bid != null && ask != null && ask >= bid
      ? { price: (bid + ask) / 2, priceField: 'mid' as const }
      : last != null
        ? { price: last, priceField: 'last' as const }
        : null;
  if (!priced) return null;
  return { ...priced, asOfDate: normalizeExpiration(contract.date), contractId: contract.contractID ?? null };
}

export type OptionQuoteBasis = 'EOD' | 'REALTIME';

/**
 * A mark is usable when it is dated and from the current session or the previous one (AV EOD = previous session).
 * Undated or older marks are not usable: the position stays honestly "no usable quote".
 */
export function isOptionMarkCurrent(asOfDate: string | null | undefined, nowMs: number = Date.now()): boolean {
  return isEodDataCurrent(asOfDate ?? null, nowMs);
}
