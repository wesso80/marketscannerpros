/**
 * Public Find symbols contract. Pass ALL evaluated rows before institutional
 * filtering, ranking and truncation. This module never changes engine rows.
 * Route admission, quota and internal/admin responses remain the caller's job.
 */
type ObjectValue = Record<string, unknown>;
const object = (v: unknown): ObjectValue => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as ObjectValue : {};
const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const text = (v: unknown): string | null => typeof v === 'string' && v.length > 0 ? v : null;
const timestamp = (v: unknown): string | null => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;

export type ObservationMetric = { value: number | null; missingReason: 'not_available' | 'invalid_value' | 'reported_missing' | null };
export type FindSymbolFilters = { rsiMin?: number; rsiMax?: number; adxMin?: number; aboveEma200?: boolean };

function metric(value: unknown, missing: boolean, valid: (n: number) => boolean): ObservationMetric {
  if (missing) return { value: null, missingReason: 'reported_missing' };
  const n = number(value);
  if (n === null) return { value: null, missingReason: value == null ? 'not_available' : 'invalid_value' };
  return valid(n) ? { value: n, missingReason: null } : { value: null, missingReason: 'invalid_value' };
}

export function publicScannerObservation(input: unknown) {
  const row = object(input);
  const symbol = text(row.symbol);
  if (!symbol || !/^[A-Za-z0-9.^/-]{1,40}$/.test(symbol) || (row.type !== 'equity' && row.type !== 'crypto')) return null;
  const basis = object(row.dataBasis);
  const trust = object(row.dataTrust);
  const missing = new Set(Array.isArray(trust.missingInputs) ? trust.missingInputs.filter((x): x is string => typeof x === 'string').map(x => x.toUpperCase()) : []);
  const range100 = (n: number) => n >= 0 && n <= 100;
  const history = number(basis.historyBars);
  return {
    symbol: symbol.toUpperCase(),
    assetClass: row.type as 'equity' | 'crypto',
    requestedTimeframe: text(row.timeframe),
    barInterval: text(basis.barInterval) ?? text(row.barInterval),
    // A bar timestamp is not a timestamp for a separate current-price quote.
    price: metric(row.price, false, n => n > 0),
    priceObservedAt: null,
    priceTimeNote: 'The scan does not provide a separate observation time for its displayed price.',
    indicators: {
      rsi: metric(row.rsi, missing.has('RSI'), range100),
      adx: metric(row.adx, missing.has('ADX'), range100),
      ema200: metric(row.ema200, missing.has('EMA200'), n => n > 0),
      atr: metric(row.atr, missing.has('ATR'), n => n >= 0),
      macdHistogram: metric(row.macd_hist, missing.has('MACD'), () => true),
    },
    basis: {
      source: text(basis.source),
      lastCompletedBarAt: timestamp(basis.lastCompletedBarAt) ?? timestamp(row.lastCandleTime),
      computedAt: timestamp(basis.computedAt),
      historyBars: history !== null && Number.isInteger(history) && history >= 0 ? history : null,
      currentBarPartial: typeof basis.currentBarPartial === 'boolean' ? basis.currentBarPartial : null,
      // Copy individual known leaves; never serialize trust/scoring objects or free-form reasons.
      intervalMismatch: typeof trust.intervalMismatch === 'boolean' ? trust.intervalMismatch : null,
      priceDiscontinuity: number(object(basis.priceDiscontinuity).ratio) !== null,
    },
  };
}

export type PublicScannerObservation = NonNullable<ReturnType<typeof publicScannerObservation>>;

function validateFilters(filters: FindSymbolFilters) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) throw new Error('Invalid filters');
  for (const key of Object.keys(filters)) {
    if (!['rsiMin', 'rsiMax', 'adxMin', 'aboveEma200'].includes(key)) throw new Error('Unsupported factual filter');
  }
  for (const key of ['rsiMin', 'rsiMax', 'adxMin'] as const) {
    const value = filters[key];
    if (value !== undefined && (number(value) === null || value < 0 || value > 100)) throw new Error('Indicator filter must be between 0 and 100');
  }
  if (filters.rsiMin !== undefined && filters.rsiMax !== undefined && filters.rsiMin > filters.rsiMax) throw new Error('RSI range is reversed');
  if (filters.aboveEma200 !== undefined && typeof filters.aboveEma200 !== 'boolean') throw new Error('Invalid EMA filter');
}

/** Missing inputs never satisfy a requested condition, including a negative condition. */
export function matchesFindSymbolFilters(row: PublicScannerObservation, filters: FindSymbolFilters): boolean {
  validateFilters(filters);
  const { rsi, adx, ema200 } = row.indicators;
  if (filters.rsiMin !== undefined && (rsi.value === null || rsi.value < filters.rsiMin)) return false;
  if (filters.rsiMax !== undefined && (rsi.value === null || rsi.value > filters.rsiMax)) return false;
  if (filters.adxMin !== undefined && (adx.value === null || adx.value < filters.adxMin)) return false;
  if (filters.aboveEma200 !== undefined) {
    if (row.price.value === null || ema200.value === null) return false;
    if ((row.price.value > ema200.value) !== filters.aboveEma200) return false;
  }
  return true;
}

export function buildPublicScannerObservations(evaluatedRows: readonly unknown[], filters: FindSymbolFilters = {}, offset = 0, limit = 20) {
  validateFilters(filters);
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid page');
  const observations = evaluatedRows.map(publicScannerObservation).filter((row): row is PublicScannerObservation => row !== null);
  const matched = observations.filter(row => matchesFindSymbolFilters(row, filters));
  matched.sort((a, b) => a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : a.assetClass.localeCompare(b.assetClass));
  return {
    contract: 'public-scanner-observations-v1' as const,
    observations: matched.slice(offset, offset + limit),
    selection: {
      order: 'symbol_ascending' as const,
      note: 'Measured conditions only. Symbol A–Z; no composite ranking. Coverage is limited to the evaluated sample.',
      evaluated: evaluatedRows.length,
      usableIdentity: observations.length,
      matched: matched.length,
      offset,
      limit,
      nextOffset: offset + limit < matched.length ? offset + limit : null,
    },
  };
}
