/**
 * Shared guards for both signal_outcomes writers.
 *
 * A horizon is labelled only from a price observed inside [target, target + tolerance].
 * A live quote is that kind of price only while the window is still open. After the window
 * the row is unknown: the outcome check constraint allows correct, wrong, neutral, unknown.
 * expired and suspect are not stored values; they are reasons on the unknown row.
 *
 * A ticker that is both a crypto symbol and an equity or ETF is not labelled.
 * A move past 50% in either direction is unknown, not correct or wrong.
 */
import { classifyMove, type MoveLabel } from '@/lib/signals/outcomeRule';

/** Absolute percent move above this is not labelled correct or wrong. */
export const SUSPECT_MOVE_PCT = 50;

/** Minutes after the target still accepted as "at the horizon". Matches the worker windows. */
export const HORIZON_TOLERANCE_MINUTES: Readonly<Record<number, number>> = {
  60: 120,
  240: 240,
  1440: 1440,
  10080: 2880,
};

export function toleranceMinutes(horizonMinutes: number): number {
  return HORIZON_TOLERANCE_MINUTES[horizonMinutes] ?? 240;
}

export function horizonWindow(signalAtMs: number, horizonMinutes: number): { targetMs: number; windowEndMs: number } {
  const targetMs = signalAtMs + horizonMinutes * 60_000;
  return { targetMs, windowEndMs: targetMs + toleranceMinutes(horizonMinutes) * 60_000 };
}

/** Strip a quote-currency suffix so BTCUSDT and BTC share one universe lookup. */
export function symbolBase(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  const pair = /^([A-Z0-9]{2,15})(USDT|USDC|USD)$/.exec(upper);
  return pair ? pair[1] : upper;
}

export function inCryptoSymbolMap(symbol: string, map: Readonly<Record<string, string>>): boolean {
  const upper = symbol.trim().toUpperCase();
  const base = symbolBase(upper);
  return Boolean(map[upper] || map[base]);
}

/**
 * Tickers whose CoinGecko id is a retired asset.
 * FTM still maps to fantom; the live asset is Sonic (S).
 * MATIC still maps to matic-network; the live asset is POL.
 * Outcome labelling stores unknown for these so the retired id cannot score the row.
 * RNDR is not here: it shares the current render-token id with RENDER.
 */
export const RENAMED_OUTCOME_TICKERS: Readonly<Record<string, { successor: string; retiredCoinId: string }>> = {
  FTM: { successor: 'S', retiredCoinId: 'fantom' },
  MATIC: { successor: 'POL', retiredCoinId: 'matic-network' },
};

/**
 * An ohlcv bar with no symbol_universe row may label an equity signal when nothing
 * identifies the symbol as crypto. A coin-map hit or a crypto universe row blocks that.
 */
export function allowUnclassifiedEquityBars(input: {
  inCryptoMap: boolean;
  universeTypes: readonly string[];
}): boolean {
  if (input.inCryptoMap) return false;
  const types = input.universeTypes.map((type) => type.trim().toLowerCase());
  return !types.some((type) => type === 'crypto' || type === 'cryptocurrency');
}

export function renamedOutcomeTicker(symbol: string): { ticker: string; successor: string; retiredCoinId: string } | null {
  const base = symbolBase(symbol);
  const row = RENAMED_OUTCOME_TICKERS[base];
  return row ? { ticker: base, successor: row.successor, retiredCoinId: row.retiredCoinId } : null;
}

export function declaredAssetClass(features: unknown): 'equity' | 'crypto' | null {
  if (!features || typeof features !== 'object') return null;
  const bag = features as Record<string, unknown>;
  const raw = bag.asset_class ?? bag.assetClass ?? bag.asset_type ?? bag.assetType ?? bag.market;
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'crypto' || value === 'cryptocurrency') return 'crypto';
  if (value === 'equity' || value === 'equities' || value === 'stock' || value === 'etf') return 'equity';
  return null;
}

export type AssetResolution =
  | { status: 'ok'; assetClass: 'equity' | 'crypto' }
  | { status: 'ambiguous'; reason: string };

/**
 * One class, or ambiguous.
 * No evidence at all stays equity: a stock that is simply missing from symbol_universe is not a collision.
 * A coin-map hit plus an equity or ETF row, two universe classes, or a declared class that contradicts the other, is a collision.
 */
export function resolveOutcomeAsset(input: {
  symbol: string;
  declared: 'equity' | 'crypto' | null;
  universeTypes: readonly string[];
  inCryptoMap: boolean;
}): AssetResolution {
  const types = new Set(input.universeTypes.map((type) => type.trim().toLowerCase()).filter(Boolean));
  const universeCrypto = types.has('crypto') || types.has('cryptocurrency');
  const universeEquity = types.has('equity') || types.has('equities') || types.has('stock') || types.has('etf');
  const cryptoEvidence = universeCrypto || input.inCryptoMap;
  const equityEvidence = universeEquity;

  if (input.declared === 'crypto' && equityEvidence) {
    return { status: 'ambiguous', reason: `${input.symbol} is declared crypto and also has an equity or ETF row` };
  }
  if (input.declared === 'equity' && cryptoEvidence) {
    return { status: 'ambiguous', reason: `${input.symbol} is declared equity and is also a crypto ticker` };
  }
  if (input.declared == null && cryptoEvidence && equityEvidence) {
    return { status: 'ambiguous', reason: `${input.symbol} matches both a crypto ticker and an equity or ETF` };
  }
  if (input.declared === 'crypto' || (cryptoEvidence && !equityEvidence)) {
    return { status: 'ok', assetClass: 'crypto' };
  }
  if (input.declared === 'equity' || (equityEvidence && !cryptoEvidence)) {
    return { status: 'ok', assetClass: 'equity' };
  }
  return { status: 'ok', assetClass: 'equity' };
}

/**
 * Same resolver as the scan, plus known renames.
 * A renamed ticker is ambiguous for labelling: the stored coin id is the retired asset.
 */
export function resolveOutcomeLabelAsset(input: {
  symbol: string;
  declared: 'equity' | 'crypto' | null;
  universeTypes: readonly string[];
  inCryptoMap: boolean;
}): AssetResolution {
  const renamed = renamedOutcomeTicker(input.symbol);
  if (renamed) {
    return {
      status: 'ambiguous',
      reason: `${renamed.ticker} was renamed to ${renamed.successor}; the stored coin id ${renamed.retiredCoinId} is the retired asset`,
    };
  }
  return resolveOutcomeAsset(input);
}

export interface HorizonObservation {
  price: number;
  /** When this price was observed. A date-only value is the end of that UTC day. */
  observedAtMs: number;
  /** True for quotes_latest / "the price right now". Never used once the window has closed. */
  live: boolean;
  /** Class of the table or universe row this bar came from. A mismatch is not a horizon price. */
  barClass?: 'equity' | 'crypto';
}

export type HorizonWriteReason = 'labelled' | 'expired' | 'ambiguous' | 'suspect' | 'wrong_asset';

export type HorizonDecision =
  | { action: 'skip' }
  | {
      action: 'write';
      outcome: MoveLabel | 'unknown';
      priceLater: number | null;
      pctMove: number | null;
      reason: HorizonWriteReason;
    };

export function percentMove(priceAtSignal: number, priceLater: number): number | null {
  if (!Number.isFinite(priceAtSignal) || !Number.isFinite(priceLater) || priceAtSignal === 0) return null;
  return ((priceLater - priceAtSignal) / priceAtSignal) * 100;
}

/** A date-only close is the end of that UTC day, so it can still fall inside a horizon that ends later the same day. */
export function observationInstantMs(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return Date.parse(`${text}T23:59:59.999Z`);
  return Date.parse(text);
}

function observationUsable(obs: HorizonObservation, targetMs: number, windowEndMs: number, nowMs: number): boolean {
  if (!Number.isFinite(obs.price) || !(obs.price > 0) || !Number.isFinite(obs.observedAtMs)) return false;
  if (obs.live) return nowMs >= targetMs && nowMs <= windowEndMs;
  return obs.observedAtMs >= targetMs && obs.observedAtMs <= windowEndMs;
}

/**
 * Decide the row to write for one signal and one horizon.
 * skip = the window is still open and there is no in-window price yet; try again later.
 */
export function labelHorizonMove(input: {
  direction: string;
  bandPct: number;
  priceAtSignal: number;
  nowMs: number;
  signalAtMs: number;
  horizonMinutes: number;
  asset: AssetResolution;
  observation: HorizonObservation | null;
  /** True when the only bars in the entry or horizon window belong to the other class. */
  otherClassOnly?: boolean;
}): HorizonDecision {
  if (input.asset.status === 'ambiguous') {
    return { action: 'write', outcome: 'unknown', priceLater: null, pctMove: null, reason: 'ambiguous' };
  }
  const resolvedClass = input.asset.assetClass;
  const barClass = input.observation?.barClass;
  if (input.otherClassOnly || (barClass != null && barClass !== resolvedClass)) {
    return { action: 'write', outcome: 'unknown', priceLater: null, pctMove: null, reason: 'wrong_asset' };
  }
  const { targetMs, windowEndMs } = horizonWindow(input.signalAtMs, input.horizonMinutes);
  const usable = input.observation && observationUsable(input.observation, targetMs, windowEndMs, input.nowMs)
    ? input.observation
    : null;
  if (!usable) {
    if (input.nowMs > windowEndMs) {
      return { action: 'write', outcome: 'unknown', priceLater: null, pctMove: null, reason: 'expired' };
    }
    return { action: 'skip' };
  }
  const pct = percentMove(input.priceAtSignal, usable.price);
  if (pct == null) {
    return input.nowMs > windowEndMs
      ? { action: 'write', outcome: 'unknown', priceLater: null, pctMove: null, reason: 'expired' }
      : { action: 'skip' };
  }
  if (Math.abs(pct) > SUSPECT_MOVE_PCT) {
    return { action: 'write', outcome: 'unknown', priceLater: usable.price, pctMove: pct, reason: 'suspect' };
  }
  return {
    action: 'write',
    outcome: classifyMove(input.direction, pct, input.bandPct),
    priceLater: usable.price,
    pctMove: pct,
    reason: 'labelled',
  };
}

export type ScanMarket = 'crypto' | 'equity';

/**
 * Asset for one admin-scan row. The scan's market is the declared class.
 * A symbol that is also on the equity list, or in the coin map while declared equity, is ambiguous.
 */
export function resolveScanAsset(input: {
  symbol: string;
  market: string;
  inCryptoMap: boolean;
  equitySymbols: readonly string[];
}): AssetResolution {
  const symbol = symbolBase(input.symbol);
  const market = String(input.market ?? '').toUpperCase();
  const declared: 'equity' | 'crypto' | null = market === 'CRYPTO' ? 'crypto' : market === 'EQUITIES' || market === 'EQUITY' ? 'equity' : null;
  const alsoEquity = input.equitySymbols.some((row) => symbolBase(row) === symbol);
  const universeTypes: string[] = [];
  if (declared === 'crypto' || market === 'CRYPTO') universeTypes.push('crypto');
  if (declared === 'equity' || alsoEquity) universeTypes.push('equity');
  return resolveOutcomeAsset({ symbol, declared, universeTypes, inCryptoMap: input.inCryptoMap });
}

export interface PublishedScanChange {
  /** Null when this number must not be shown or stored as a real move. */
  changePercent: number | null;
  withheld: 'ambiguous' | 'suspect' | null;
}

/**
 * What the admin scan may publish.
 * An ambiguous ticker publishes nothing.
 * A crypto move past 50% in either direction is suspect (withheld), not a real day change.
 * Equity moves are not capped: a single-name stock can move more than 50% in a session.
 */
export function publishScanChange(
  changePercent: number | null | undefined,
  asset: AssetResolution,
  market: ScanMarket,
): PublishedScanChange {
  if (asset.status === 'ambiguous') return { changePercent: null, withheld: 'ambiguous' };
  if (changePercent == null || !Number.isFinite(changePercent)) return { changePercent: null, withheld: null };
  if (market === 'crypto' && Math.abs(changePercent) > SUSPECT_MOVE_PCT) return { changePercent: null, withheld: 'suspect' };
  return { changePercent, withheld: null };
}
