export const OI_METHOD = 'coingecko-major-perpetual-usd-v2';
export const HOUR_MS = 3_600_000;

export interface OiRow {
  market: string;
  symbol: string;
  openInterest: number;
  lastTradedAt: number;
}

export interface OiObservation {
  symbol: string;
  value: number;
  observedAt: number;
  coverage: string;
  method: typeof OI_METHOD;
  exchanges: number;
}

/** Scope includes every venue and contract, so a coverage change is never a price move. */
export function buildOiObservation(symbol: string, rows: OiRow[], now = Date.now()): OiObservation | null {
  const valid = rows.filter(r => r.market && r.symbol && Number.isFinite(r.openInterest) && r.openInterest >= 0 &&
    Number.isFinite(r.lastTradedAt) && now - r.lastTradedAt * 1000 >= 0 && now - r.lastTradedAt * 1000 <= 900_000);
  if (!valid.length) return null;
  const unique = new Map(valid.map(r => [JSON.stringify([r.market, r.symbol]), r]));
  const observations = [...unique.values()];
  return {
    symbol, method: OI_METHOD,
    value: observations.reduce((sum, r) => sum + r.openInterest, 0),
    observedAt: Math.min(...observations.map(r => r.lastTradedAt * 1000)),
    coverage: JSON.stringify([...unique.keys()].sort()),
    exchanges: new Set(observations.map(r => r.market)).size,
  };
}

export function compareOi24h(current: OiObservation, history: OiObservation[], now = Date.now()) {
  const empty = { change24h: null, comparisonAt: null, previousValue: null } as const;
  if (current.method !== OI_METHOD || !Number.isFinite(current.value) || current.value < 0 ||
      !Number.isFinite(current.observedAt) || now - current.observedAt < 0 || now - current.observedAt > 900_000) return empty;
  const candidates = history.filter(previous => previous?.method === OI_METHOD && previous.symbol === current.symbol &&
    previous.coverage === current.coverage && Number.isFinite(previous.value) && previous.value > 0 &&
    current.observedAt - previous.observedAt >= 23 * HOUR_MS && current.observedAt - previous.observedAt <= 25 * HOUR_MS);
  candidates.sort((a, b) => Math.abs(current.observedAt - a.observedAt - 24 * HOUR_MS) - Math.abs(current.observedAt - b.observedAt - 24 * HOUR_MS));
  const previous = candidates[0];
  return previous ? {
    change24h: (current.value / previous.value - 1) * 100,
    comparisonAt: previous.observedAt,
    previousValue: previous.value,
  } : empty;
}

/** Require the whole current basket to have a comparable baseline; weight by OI, not coin count. */
export function totalOiChange(coins: Array<{ value: number; previousValue: number | null }>): number | null {
  if (!coins.length || coins.some(c => !Number.isFinite(c.value) || c.value < 0 || c.previousValue == null || !Number.isFinite(c.previousValue) || c.previousValue <= 0)) return null;
  const previous = coins.reduce((sum, c) => sum + c.previousValue!, 0);
  return (coins.reduce((sum, c) => sum + c.value, 0) / previous - 1) * 100;
}
