/** Pro filters run on every evaluated candidate, before the response limit. */
export interface ProScanFilters {
  direction: 'all' | 'long' | 'short';
  quality: 'all' | 'high' | 'medium';
  minConfidence: number;
  minAlignment: number;
  volatility: 'all' | 'low' | 'moderate' | 'high';
  squeeze: boolean;
  requireRelativeStrength: boolean;
  minAdx?: number;
  maxAdx?: number;
  rsiBand?: [number, number];
  preset?: 'momentum' | 'mean_reversion';
}
export type ProScanSort = 'rank' | 'confidence' | 'volatility' | 'trend';
const positive = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function parseProFilters(input: unknown = {}): ProScanFilters {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('filters must be an object');
  const v = input as Record<string, unknown>;
  const choice = <T extends string>(key: string, values: readonly T[], fallback: T): T => {
    if (v[key] === undefined) return fallback;
    if (!values.includes(v[key] as T)) throw new Error(`Invalid filter: ${key}`);
    return v[key] as T;
  };
  const number = (key: string, fallback?: number, max = 100) => {
    if (v[key] === undefined) return fallback;
    const n = finite(v[key]);
    if (n === null || n < 0 || n > max) throw new Error(`Invalid filter: ${key}`);
    return n;
  };
  const flag = (key: string) => {
    if (v[key] !== undefined && typeof v[key] !== 'boolean') throw new Error(`Invalid filter: ${key}`);
    return v[key] === true;
  };
  const filters: ProScanFilters = {
    direction: choice('direction', ['all', 'long', 'short'], 'all'),
    quality: choice('quality', ['all', 'high', 'medium'], 'all'),
    minConfidence: number('minConfidence', 0)!,
    minAlignment: number('minAlignment', 0, 4)!,
    volatility: choice('volatility', ['all', 'low', 'moderate', 'high'], 'all'),
    squeeze: flag('squeeze'), requireRelativeStrength: flag('requireRelativeStrength'),
    minAdx: number('minAdx'), maxAdx: number('maxAdx'),
  };
  if (filters.minAdx !== undefined && filters.maxAdx !== undefined && filters.minAdx >= filters.maxAdx) throw new Error('ADX minimum must be below maximum');
  if (v.preset !== undefined) filters.preset = choice('preset', ['momentum', 'mean_reversion'] as const, 'momentum');
  if (v.rsiBand !== undefined) {
    const band = v.rsiBand;
    if (!Array.isArray(band) || band.length !== 2 || band.some(n => finite(n) === null || n < 0 || n > 100) || band[0] > band[1]) throw new Error('Invalid RSI band');
    filters.rsiBand = [band[0], band[1]];
  }
  return filters;
}

/** The table and API use the same observed inputs; unavailable is never zero. */
export function proCandidateMetrics(pick: any) {
  const ind = pick.indicators ?? {};
  const confidence = finite(pick.confidence) ?? finite(pick.scoreV2?.final?.confidence) ?? finite(pick.score);
  const rsi = finite(pick.rsi) ?? finite(ind.rsi);
  const adx = finite(pick.adx) ?? finite(ind.adx);
  const atr = positive(pick.atr) ?? positive(ind.atr);
  const price = positive(pick.price) ?? positive(ind.price);
  const atrPct = price !== null && price > 0 && atr !== null && atr > 0 ? atr / price * 100 : positive(ind.atr_percent);
  const side = (d: unknown) => d === 'bullish' ? 'LONG' : d === 'bearish' ? 'SHORT' : 'NEUTRAL';
  const direction = side(pick.direction);
  // Factor agreement reads the indicator factor bias (trend/momentum/structure), not the canonical setup side: a
  // counter-trend setup (e.g. exhaustion fade) or a "No setup" row is scored on what its indicators agree on. Falls back
  // to the row side when the factor read is neutral/absent (e.g. a squeeze setup in a range). Hard blocks are neutral.
  const factorSide = side(pick.factorBias);
  const bias = pick.canonicalStatus === 'HARD_BLOCK' ? 'NEUTRAL' : factorSide !== 'NEUTRAL' ? factorSide : direction;
  const bull = finite(pick.signals?.bullish), bear = finite(pick.signals?.bearish), neutral = finite(pick.signals?.neutral);
  const trend = bull !== null && bear !== null && (bias === 'LONG' ? bull > bear : bias === 'SHORT' ? bear > bull : false);
  const momentum = rsi !== null && (bias === 'LONG' ? rsi > 45 : bias === 'SHORT' ? rsi < 55 : false);
  const flow = neutral !== null && (bias === 'LONG' ? bull !== null && bull >= neutral : bias === 'SHORT' ? bear !== null && bear >= neutral : false);
  return {
    confidence, rsi, adx, atrPct, price, direction,
    quality: pick.scoreV2?.final?.qualityTier ?? (confidence === null ? null : confidence >= 70 ? 'high' : confidence >= 50 ? 'medium' : 'low'),
    alignment: [trend, momentum, flow, bias !== 'NEUTRAL'].filter(Boolean).length,
    alignmentAvailable: rsi !== null && bull !== null && bear !== null && neutral !== null,
    squeeze: typeof ind.squeeze === 'boolean' ? ind.squeeze : null,
    relativeStrength: finite(ind.sectorRelStr),
  };
}

/** Hard-block codes → plain labels, in the order used to pick ONE reason per row (data problems first: a stale or
 *  unreliable row's liquidity/earnings read can't be trusted). `unavailable` = the row lacked usable data. */
const HARD_BLOCK_LABELS: ReadonlyArray<readonly [code: string, label: string, unavailable: boolean]> = [
  ['DATA_ELIGIBILITY', 'data eligibility', true],
  ['STALE_DATA', 'stale data', true],
  ['DATA_UNRELIABLE', 'unreliable data', true],
  ['INSUFFICIENT_HISTORY', 'short history', true],
  ['PRICE_SANITY', 'price check', true],
  ['EARNINGS_IN_WINDOW', 'earnings', false],
  ['LIQUIDITY_MIN', 'liquidity', false],
];
export const BLOCKED_PREFIX = 'Blocked: ';

/** The one named reason a hard-blocked row is excluded for, e.g. { reason: 'Blocked: liquidity', unavailable: false }. */
export function hardBlockExclusion(pick: any): { reason: string; unavailable: boolean } {
  const codes: string[] = (pick?.canonical?.blockReasons ?? []).map((r: { code?: string }) => String(r?.code ?? '')).filter((c: string) => c && c !== 'NO_SETUP');
  for (const [code, label, unavailable] of HARD_BLOCK_LABELS) if (codes.includes(code)) return { reason: BLOCKED_PREFIX + label, unavailable };
  return codes.length ? { reason: BLOCKED_PREFIX + codes[0].toLowerCase().replace(/_/g, ' '), unavailable: false } : { reason: BLOCKED_PREFIX + 'unspecified', unavailable: true };
}

/** Exclusion counts as display segments; hard blocks grouped: ['Blocked: liquidity 3, earnings 5, stale data 2', 'Factor agreement (4)']. */
export function formatExclusionBreakdown(exclusions: Record<string, number> | null | undefined): string[] {
  const entries = Object.entries(exclusions ?? {}).filter(([, n]) => n > 0);
  const blocked = entries.filter(([k]) => k.startsWith(BLOCKED_PREFIX)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const rest = entries.filter(([k]) => !k.startsWith(BLOCKED_PREFIX));
  return [
    ...(blocked.length ? [BLOCKED_PREFIX + blocked.map(([k, n]) => `${k.slice(BLOCKED_PREFIX.length)} ${n}`).join(', ')] : []),
    ...rest.map(([k, n]) => `${k} (${n})`),
  ];
}

function exclusion(pick: any, f: ProScanFilters): { reason: string; unavailable: boolean } | null {
  const m = proCandidateMetrics(pick);
  const reject = (reason: string, unavailable = false) => ({ reason, unavailable });
  if (m.confidence === null) return reject('Score unavailable', true);
  // Hard canonical blocks (stale/short/unreliable data, earnings in window, liquidity, price sanity) have no usable
  // side; name the actual block (liquidity / earnings / stale data ...) instead of letting them fall through as "Factor
  // agreement" or calling them all "data unavailable". No-setup rows are NOT excluded here.
  if (pick.canonicalStatus === 'HARD_BLOCK') return hardBlockExclusion(pick);
  if (f.direction !== 'all' && m.direction !== (f.direction === 'long' ? 'LONG' : 'SHORT')) return reject('Bias');
  if (f.quality !== 'all' && m.quality !== f.quality) return reject('Quality');
  if (m.confidence < f.minConfidence) return reject('Minimum confidence');
  if (f.minAlignment > 0 && !m.alignmentAvailable) return reject('Factor inputs unavailable', true);
  if (m.alignment < f.minAlignment) return reject('Factor agreement');
  if (f.volatility !== 'all') {
    if (m.atrPct === null) return reject('ATR unavailable', true);
    if (f.volatility === 'low' && m.atrPct > 1.5 || f.volatility === 'moderate' && (m.atrPct < 1.5 || m.atrPct > 3) || f.volatility === 'high' && m.atrPct < 3) return reject('Volatility');
  }
  if (f.squeeze && m.squeeze === null) return reject('Squeeze unavailable', true);
  if (f.squeeze && !m.squeeze) return reject('Squeeze');
  if (f.requireRelativeStrength && m.relativeStrength === null) return reject('Relative strength unavailable', true);
  if (f.requireRelativeStrength && m.relativeStrength! <= 0) return reject('Relative strength');
  if ((f.minAdx !== undefined || f.maxAdx !== undefined) && m.adx === null) return reject('ADX unavailable', true);
  if (f.minAdx !== undefined && m.adx! < f.minAdx || f.maxAdx !== undefined && m.adx! >= f.maxAdx) return reject('ADX');
  if ((f.preset || f.rsiBand) && m.rsi === null) return reject('RSI unavailable', true);
  if (f.preset === 'momentum') {
    const ok = m.direction === 'LONG' ? m.rsi! >= 55 && m.rsi! <= 70 : m.direction === 'SHORT' && m.rsi! >= 30 && m.rsi! <= 45;
    if (!ok) return reject('RSI momentum zone');
  } else if (f.preset === 'mean_reversion') {
    if (!(m.rsi! <= 35 || m.rsi! >= 65)) return reject('RSI extreme');
  } else if (f.rsiBand && !(m.rsi! >= f.rsiBand[0] && m.rsi! <= f.rsiBand[1])) return reject('RSI band');
  return null;
}

export function selectProCandidates<T extends { symbol: string }>(candidates: T[], filters: ProScanFilters, sort: ProScanSort = 'rank', limit = 50) {
  const matches: Array<{ pick: T; index: number }> = [];
  const excluded: Array<{ symbol: string; reason: string; unavailable: boolean }> = [];
  const exclusions: Record<string, number> = {};
  candidates.forEach((pick, index) => {
    const drop = exclusion(pick, filters);
    if (!drop) matches.push({ pick, index });
    else { excluded.push({ symbol: pick.symbol, ...drop }); exclusions[drop.reason] = (exclusions[drop.reason] ?? 0) + 1; }
  });
  const metric = (pick: T) => { const m = proCandidateMetrics(pick); return sort === 'volatility' ? m.atrPct : sort === 'trend' ? m.adx : m.confidence; };
  matches.sort((a, b) => {
    if (sort === 'rank') return a.index - b.index;
    const av = metric(a.pick), bv = metric(b.pick);
    const delta = av === null ? (bv === null ? 0 : 1) : bv === null ? -1 : bv - av;
    return delta || a.pick.symbol.localeCompare(b.pick.symbol);
  });
  const cappedLimit = Math.max(1, Math.min(100, Number.isFinite(limit) ? Math.floor(limit) : 50));
  const topPicks = matches.slice(0, cappedLimit).map(({ pick }) => pick);
  return { topPicks, selection: {
    scope: 'all_evaluated_candidates' as const, filters, sort, limit: cappedLimit,
    evaluated: candidates.length, matched: matches.length, returned: topPicks.length,
    excluded: excluded.length, unavailable: excluded.filter(x => x.unavailable).length,
    beyondLimit: matches.length - topPicks.length, exclusions, excludedCandidates: excluded,
  } };
}
