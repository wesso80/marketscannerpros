// v3 stores per-contract OI so a 24h change is computed on the contracts present in BOTH snapshots (OV-18).
// v2 required the whole venue/contract set to be identical 24h apart, which almost never held (one thin contract
// not trading in a 15-minute window changed the set), so the comparable OI change was permanently unavailable.
export const OI_METHOD = 'coingecko-major-perpetual-usd-v3';
/** Matched contracts must carry at least this share of both the current and the 24h-ago OI. */
export const OI_MIN_MATCHED_SHARE = 0.9;
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
  /** USD OI per venue contract, keyed JSON [market, symbol]. */
  contracts: Record<string, number>;
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
    contracts: Object.fromEntries([...unique.entries()].map(([k, r]) => [k, r.openInterest])),
  };
}

/** Sum of OI over the contracts both snapshots observed; null when the overlap is too small to be the same position. */
function matchedOi(current: OiObservation, previous: OiObservation): { current: number; previous: number } | null {
  if (!current.contracts || !previous.contracts || typeof previous.contracts !== 'object') return null;
  let cur = 0;
  let prev = 0;
  for (const [k, v] of Object.entries(current.contracts)) {
    const p = previous.contracts[k];
    if (!Number.isFinite(v) || !Number.isFinite(p)) continue;
    cur += v;
    prev += p;
  }
  if (!(prev > 0) || cur < OI_MIN_MATCHED_SHARE * current.value || prev < OI_MIN_MATCHED_SHARE * previous.value) return null;
  return { current: cur, previous: prev };
}

/** Only the same venue contracts are compared, so a coverage change is never read as a position change. */
export function compareOi24h(current: OiObservation, history: OiObservation[], now = Date.now()) {
  const empty = { change24h: null, comparisonAt: null, previousValue: null, comparedValue: null } as const;
  if (current.method !== OI_METHOD || !Number.isFinite(current.value) || current.value < 0 ||
      !Number.isFinite(current.observedAt) || now - current.observedAt < 0 || now - current.observedAt > 900_000) return empty;
  const candidates = history.flatMap(previous => {
    if (previous?.method !== OI_METHOD || previous.symbol !== current.symbol || !Number.isFinite(previous.value) || !(previous.value > 0) ||
        current.observedAt - previous.observedAt < 23 * HOUR_MS || current.observedAt - previous.observedAt > 25 * HOUR_MS) return [];
    const matched = matchedOi(current, previous);
    return matched ? [{ previous, matched }] : [];
  });
  candidates.sort((a, b) => Math.abs(current.observedAt - a.previous.observedAt - 24 * HOUR_MS) - Math.abs(current.observedAt - b.previous.observedAt - 24 * HOUR_MS));
  const best = candidates[0];
  return best ? {
    change24h: (best.matched.current / best.matched.previous - 1) * 100,
    comparisonAt: best.previous.observedAt,
    previousValue: best.matched.previous,
    comparedValue: best.matched.current,
  } : empty;
}

/**
 * Basket change weighted by OI, not coin count. Coins without a comparable baseline are left out, but the compared
 * coins must hold at least OI_MIN_MATCHED_SHARE of the basket's current OI, otherwise the total is withheld.
 */
export function totalOiChange(coins: Array<{ value: number; previousValue: number | null; comparedValue?: number | null }>): number | null {
  if (!coins.length || coins.some(c => !Number.isFinite(c.value) || c.value < 0)) return null;
  const total = coins.reduce((sum, c) => sum + c.value, 0);
  const compared = coins.filter(c => c.previousValue != null && Number.isFinite(c.previousValue) && c.previousValue > 0);
  if (!(total > 0) || !compared.length) return null;
  const comparedNow = compared.reduce((sum, c) => sum + (c.comparedValue ?? c.value), 0);
  const coveredShare = compared.reduce((sum, c) => sum + c.value, 0) / total;
  if (coveredShare < OI_MIN_MATCHED_SHARE) return null;
  const previous = compared.reduce((sum, c) => sum + c.previousValue!, 0);
  return (comparedNow / previous - 1) * 100;
}
