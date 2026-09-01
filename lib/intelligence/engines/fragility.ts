// Market Fragility + Regime Transition — native TypeScript port of
// MSP_Market_Fragility_Regime_Transition_Engine_v1.1.1.
//
// Pure function: given normalized daily OHLC history for the 27-symbol universe
// it reproduces the Pine engine's Health / Fragility / Transition / Divergence,
// the six component scores, warnings, rotation, verdict, path, playbook,
// confidence and the MASTER LINK (Market Structure Impulse = Health − Fragility).
//
// No UI, no data-provider calls. The data adapter feeds standardized series in.
// The Pine file is the authoritative spec; formulas are NOT inferred from the UI.

import type { SemanticState } from '../types';

/* ── Universe ──────────────────────────────────────────────────────────────── */

export type FragilitySymbol =
  | 'SPY' | 'RSP' | 'QQQ' | 'IWM' | 'SOX'
  | 'HYG' | 'LQD' | 'TLT' | 'VIX' | 'VIX3M'
  | 'DXY' | 'US10Y' | 'US02Y'
  | 'GOLD' | 'SILVER' | 'COPPER' | 'OIL' | 'EEM'
  | 'BTC' | 'ETH' | 'TOTAL3'
  | 'XLK' | 'XLF' | 'XLI' | 'XLY' | 'XLP' | 'XLU';

export const FRAGILITY_SYMBOLS: FragilitySymbol[] = [
  'SPY', 'RSP', 'QQQ', 'IWM', 'SOX',
  'HYG', 'LQD', 'TLT', 'VIX', 'VIX3M',
  'DXY', 'US10Y', 'US02Y',
  'GOLD', 'SILVER', 'COPPER', 'OIL', 'EEM',
  'BTC', 'ETH', 'TOTAL3',
  'XLK', 'XLF', 'XLI', 'XLY', 'XLP', 'XLU',
];

/* ── Contracts ─────────────────────────────────────────────────────────────── */

export interface FragilityDailyBar {
  date: string; // ISO date (ascending order in the series)
  close: number;
  high: number;
}

export type FragilitySourceStatus = 'OK' | 'PARTIAL' | 'DATA_UNAVAILABLE';

export interface FragilityInput {
  series: Partial<Record<FragilitySymbol, FragilityDailyBar[]>>;
  /** Timestamp of the latest underlying market data (not the calc time). */
  dataAsOf: string;
  providersUsed: string[];
  sourceStatus: FragilitySourceStatus;
}

export interface FragilityConfig {
  breadthWarnRel: number;
  creditWarnMom: number;
  vixWarn5: number;
  dxyWarn20: number;
  yieldWarnBp: number;
  /** Bars required (200 EMA + 20 lookback) before a symbol is usable. */
  minBars: number;
  /** Underlying daily data older than this many hours is considered stale. */
  staleAfterHours: number;
}

export const FRAGILITY_CONFIG: FragilityConfig = {
  breadthWarnRel: -1.5,
  creditWarnMom: 0,
  vixWarn5: 8,
  dxyWarn20: 1,
  yieldWarnBp: 20,
  minBars: 221,
  staleAfterHours: 30,
};

export interface FragilityInternalMetric {
  key: string;
  label: string;
  value: number;
  state: string;
  semantic: SemanticState;
}

export interface RotationRadarResult {
  sector: string;
  score: number;
  state: string;
  semantic: SemanticState;
}

export interface FragilityResult {
  // Freshness / provenance.
  calculatedAt: string;
  dataAsOf: string;
  isStale: boolean;
  sourceStatus: FragilitySourceStatus;
  providersUsed: string[];
  missingSymbols: FragilitySymbol[];

  // Headline scores (raw, full precision).
  health: number;
  fragility: number;
  transition: number;
  divergence: number;
  deterioration: number;

  // Component scores.
  breadth: number;
  credit: number;
  volatility: number;
  ratesDollar: number;
  leadership: number;
  trend: number;

  // Interpretation.
  warningCount: number;
  warnings: { breadth: boolean; credit: boolean; vol: boolean; rates: boolean; lead: boolean };
  regime: string;
  transitionPath: string;
  verdict: string;
  verdictSemantic: SemanticState;
  playbook: string;
  rotationRegime: string;
  confidence: number;
  confidenceText: string;

  // Rotation rankings.
  rotation: Record<'growth' | 'small' | 'cyclical' | 'em' | 'crypto' | 'metals' | 'commodities' | 'bonds' | 'defensive', number>;
  rotationTop: { name: string; score: number }[];
  radar: RotationRadarResult[];

  // MASTER LINK — Market Structure Impulse (Health − Fragility), −100..100.
  masterLink: number;
  /** Normalised 0..100 orientation for the Master (50 + impulse/2). */
  masterOrientation: number;

  internals: FragilityInternalMetric[];
}

/* ── Math helpers (faithful to Pine) ───────────────────────────────────────── */

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function mean(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

// Pine ta.ema — alpha = 2/(n+1), seeded with the SMA of the first n values.
export function emaSeries(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = mean(values.slice(0, period));
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rocAt(closes: number[], i: number, n: number): number {
  if (i - n < 0) return NaN;
  const base = closes[i - n];
  if (!base) return NaN;
  return ((closes[i] - base) / base) * 100;
}

function highestAt(highs: number[], i: number, n: number): number {
  if (i - n + 1 < 0) return NaN;
  let m = -Infinity;
  for (let j = i - n + 1; j <= i; j++) m = Math.max(m, highs[j]);
  return m;
}

// f_trendScore
export function trendScore(c: number, e20: number, e50: number, e200: number): number {
  if ([c, e20, e50, e200].some(Number.isNaN)) return 50;
  if (c > e20 && e20 > e50 && e50 > e200) return 100;
  if (c > e50 && e50 > e200) return 82;
  if (c > e200) return 65;
  if (c < e20 && e20 < e50 && e50 < e200) return 0;
  if (c < e200) return 35;
  return 50;
}

function trendText(c: number, e50: number, e200: number): string {
  if ([c, e50, e200].some(Number.isNaN)) return 'MIXED';
  if (c > e50 && e50 > e200) return 'BULL';
  if (c < e50 && e50 < e200) return 'BEAR';
  return 'MIXED';
}

export function momScore(m20: number): number {
  return Number.isNaN(m20) ? 50 : clamp(50 + m20 * 5, 0, 100);
}

export function relScore(rel20: number): number {
  return Number.isNaN(rel20) ? 50 : clamp(50 + rel20 * 8, 0, 100);
}

export function rotScore(m20: number, m60: number, rel20: number, tr: number): number {
  const a = Number.isNaN(m20) ? 50 : clamp(50 + m20 * 4, 0, 100);
  const b = Number.isNaN(m60) ? 50 : clamp(50 + m60 * 2, 0, 100);
  const c = relScore(rel20);
  return 0.3 * a + 0.2 * b + 0.25 * c + 0.25 * tr;
}

export function absRotScore(m20: number, m60: number, tr: number): number {
  const a = Number.isNaN(m20) ? 50 : clamp(50 + m20 * 4, 0, 100);
  const b = Number.isNaN(m60) ? 50 : clamp(50 + m60 * 2, 0, 100);
  return 0.4 * a + 0.25 * b + 0.35 * tr;
}

/* ── Per-symbol precomputation ─────────────────────────────────────────────── */

interface SymbolCache {
  closes: number[];
  highs: number[];
  e20: number[];
  e50: number[];
  e200: number[];
}

interface Pack {
  c: number; m5: number; m20: number; m60: number;
  e20: number; e50: number; e200: number; h20: number; d20: number;
}

function buildCache(bars: FragilityDailyBar[]): SymbolCache {
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  return { closes, highs, e20: emaSeries(closes, 20), e50: emaSeries(closes, 50), e200: emaSeries(closes, 200) };
}

function packAt(cache: SymbolCache, i: number): Pack {
  return {
    c: cache.closes[i],
    m5: rocAt(cache.closes, i, 5),
    m20: rocAt(cache.closes, i, 20),
    m60: rocAt(cache.closes, i, 60),
    e20: cache.e20[i],
    e50: cache.e50[i],
    e200: cache.e200[i],
    h20: highestAt(cache.highs, i, 20),
    d20: i - 20 >= 0 ? cache.closes[i] - cache.closes[i - 20] : NaN,
  };
}

const NEUTRAL_PACK: Pack = { c: NaN, m5: NaN, m20: NaN, m60: NaN, e20: NaN, e50: NaN, e200: NaN, h20: NaN, d20: NaN };

/* ── Health at a given index (drives deterioration deltas) ─────────────────── */

type PackMap = Record<FragilitySymbol, Pack>;

function healthAt(packs: PackMap): number {
  const tr = (s: FragilitySymbol) => trendScore(packs[s].c, packs[s].e20, packs[s].e50, packs[s].e200);
  const rel = (a: number, b: number) => relScore(a - b);
  const m20 = (s: FragilitySymbol) => packs[s].m20;

  const relRSP = m20('RSP') - m20('SPY');
  const relIWM = m20('IWM') - m20('SPY');
  const relSOXQ = m20('SOX') - m20('QQQ');
  const relXLF = m20('XLF') - m20('SPY');
  const relXLI = m20('XLI') - m20('SPY');
  const relXLYXLP = m20('XLY') - m20('XLP');
  const relEEM = m20('EEM') - m20('SPY');
  const relBTC = m20('BTC') - m20('SPY');
  const relETH = m20('ETH') - m20('SPY');
  const relT3 = m20('TOTAL3') - m20('SPY');
  const relHYGLQD = m20('HYG') - m20('LQD');
  const relHYGTLT = m20('HYG') - m20('TLT');

  const breadthTrend = (tr('SPY') + tr('RSP') + tr('QQQ') + tr('IWM') + tr('SOX') + tr('XLF') + tr('XLI') + tr('XLY')) / 8;
  const breadthRel = (rel(m20('RSP'), m20('SPY')) + rel(m20('IWM'), m20('SPY')) + rel(m20('SOX'), m20('QQQ')) + rel(m20('XLF'), m20('SPY')) + rel(m20('XLI'), m20('SPY')) + relScore(relXLYXLP) + rel(m20('EEM'), m20('SPY'))) / 7;
  const breadth = 0.55 * breadthTrend + 0.45 * breadthRel;

  const credit = 0.35 * tr('HYG') + 0.25 * momScore(m20('HYG')) + 0.2 * relScore(relHYGLQD) + 0.2 * relScore(relHYGTLT);

  const vixTrendInv = 100 - tr('VIX');
  const vixMomInv = Number.isNaN(packs.VIX.m20) ? 50 : clamp(50 - packs.VIX.m20 * 3, 0, 100);
  const vix3mC = packs.VIX3M.c;
  const vixC = packs.VIX.c;
  const vixTermPct = !Number.isNaN(vixC) && !Number.isNaN(vix3mC) && vix3mC !== 0 ? (100 * (vix3mC - vixC)) / vix3mC : NaN;
  const termScore = Number.isNaN(vixTermPct) ? 50 : clamp(50 + vixTermPct * 6, 0, 100);
  const vol = 0.4 * vixMomInv + 0.35 * termScore + 0.25 * vixTrendInv;

  const us10 = packs.US10Y.c;
  const us02 = packs.US02Y.c;
  const curve = !Number.isNaN(us10) && !Number.isNaN(us02) ? us10 - us02 : NaN;
  const us10RiseBp = Number.isNaN(packs.US10Y.d20) ? NaN : packs.US10Y.d20 * 100;
  const dollarScore = Number.isNaN(packs.DXY.m20) ? 50 : clamp(50 - packs.DXY.m20 * 7, 0, 100);
  const rateShock = Number.isNaN(us10RiseBp) ? 50 : clamp(62 - us10RiseBp * 1.3, 0, 100);
  const curveScore = Number.isNaN(curve) ? 50 : clamp(50 + curve * 35, 0, 100);
  const ratesDollar = 0.45 * dollarScore + 0.35 * rateShock + 0.2 * curveScore;

  const cryptoLead = (relScore(relBTC) + relScore(relETH) + relScore(relT3)) / 3;
  const leadership = (relScore(relSOXQ) + relScore(relIWM) + relScore(relEEM) + relScore(relXLYXLP) + cryptoLead) / 5;

  const trendComp = (tr('SPY') + tr('QQQ') + tr('RSP') + tr('IWM') + tr('SOX') + tr('HYG')) / 6;

  return 0.25 * breadth + 0.2 * credit + 0.15 * vol + 0.15 * ratesDollar + 0.15 * leadership + 0.1 * trendComp;
}

/* ── Main ──────────────────────────────────────────────────────────────────── */

export function computeFragility(
  input: FragilityInput,
  cfg: FragilityConfig = FRAGILITY_CONFIG,
  timestamp: string = new Date().toISOString(),
): FragilityResult {
  const caches = {} as Record<FragilitySymbol, SymbolCache | null>;
  const missingSymbols: FragilitySymbol[] = [];
  let maxLen = 0;
  for (const s of FRAGILITY_SYMBOLS) {
    const bars = input.series[s];
    if (bars && bars.length >= cfg.minBars) {
      caches[s] = buildCache(bars);
      maxLen = Math.max(maxLen, bars.length);
    } else {
      caches[s] = null;
      missingSymbols.push(s);
    }
  }

  const packsAtIndex = (offset: number): PackMap => {
    const m = {} as PackMap;
    for (const s of FRAGILITY_SYMBOLS) {
      const cache = caches[s];
      if (!cache) { m[s] = NEUTRAL_PACK; continue; }
      const i = cache.closes.length - 1 - offset;
      m[s] = i >= 0 ? packAt(cache, i) : NEUTRAL_PACK;
    }
    return m;
  };

  const packs = packsAtIndex(0);

  // Deterioration deltas from the health series (offsets 5 and 20).
  const health = healthAt(packs);
  const health5 = maxLen > 5 ? healthAt(packsAtIndex(5)) : health;
  const health20 = maxLen > 20 ? healthAt(packsAtIndex(20)) : health;
  const healthDelta5 = health - health5;
  const healthDelta20 = health - health20;
  const deterioration = clamp(-healthDelta5 * 8 + -healthDelta20 * 2.5, 0, 100);

  // Re-derive the full component set + everything else at the current index.
  const tr = (s: FragilitySymbol) => trendScore(packs[s].c, packs[s].e20, packs[s].e50, packs[s].e200);
  const m20 = (s: FragilitySymbol) => packs[s].m20;
  const m60 = (s: FragilitySymbol) => packs[s].m60;

  const relRSP = m20('RSP') - m20('SPY');
  const relIWM = m20('IWM') - m20('SPY');
  const relSOXQ = m20('SOX') - m20('QQQ');
  const relXLF = m20('XLF') - m20('SPY');
  const relXLI = m20('XLI') - m20('SPY');
  const relXLYXLP = m20('XLY') - m20('XLP');
  const relXLU = m20('XLU') - m20('SPY');
  const relXLK = m20('XLK') - m20('SPY');
  const relEEM = m20('EEM') - m20('SPY');
  const relBTC = m20('BTC') - m20('SPY');
  const relETH = m20('ETH') - m20('SPY');
  const relT3 = m20('TOTAL3') - m20('SPY');
  const relHYGLQD = m20('HYG') - m20('LQD');
  const relHYGTLT = m20('HYG') - m20('TLT');

  const breadthTrend = (tr('SPY') + tr('RSP') + tr('QQQ') + tr('IWM') + tr('SOX') + tr('XLF') + tr('XLI') + tr('XLY')) / 8;
  const breadthRel = (relScore(relRSP) + relScore(relIWM) + relScore(relSOXQ) + relScore(relXLF) + relScore(relXLI) + relScore(relXLYXLP) + relScore(relEEM)) / 7;
  const breadth = 0.55 * breadthTrend + 0.45 * breadthRel;

  const credit = 0.35 * tr('HYG') + 0.25 * momScore(m20('HYG')) + 0.2 * relScore(relHYGLQD) + 0.2 * relScore(relHYGTLT);

  const vixTrendInv = 100 - tr('VIX');
  const vixMomInv = Number.isNaN(packs.VIX.m20) ? 50 : clamp(50 - packs.VIX.m20 * 3, 0, 100);
  const vixC = packs.VIX.c;
  const vix3mC = packs.VIX3M.c;
  const vixTermPct = !Number.isNaN(vixC) && !Number.isNaN(vix3mC) && vix3mC !== 0 ? (100 * (vix3mC - vixC)) / vix3mC : NaN;
  const vixBackwardation = !Number.isNaN(vixC) && !Number.isNaN(vix3mC) && vixC > vix3mC;
  const termScore = Number.isNaN(vixTermPct) ? 50 : clamp(50 + vixTermPct * 6, 0, 100);
  const volatility = 0.4 * vixMomInv + 0.35 * termScore + 0.25 * vixTrendInv;

  const us10 = packs.US10Y.c;
  const us02 = packs.US02Y.c;
  const curve = !Number.isNaN(us10) && !Number.isNaN(us02) ? us10 - us02 : NaN;
  const us10RiseBp = Number.isNaN(packs.US10Y.d20) ? NaN : packs.US10Y.d20 * 100;
  const dollarScore = Number.isNaN(packs.DXY.m20) ? 50 : clamp(50 - packs.DXY.m20 * 7, 0, 100);
  const rateShock = Number.isNaN(us10RiseBp) ? 50 : clamp(62 - us10RiseBp * 1.3, 0, 100);
  const curveScore = Number.isNaN(curve) ? 50 : clamp(50 + curve * 35, 0, 100);
  const ratesDollar = 0.45 * dollarScore + 0.35 * rateShock + 0.2 * curveScore;

  const cryptoLead = (relScore(relBTC) + relScore(relETH) + relScore(relT3)) / 3;
  const leadership = (relScore(relSOXQ) + relScore(relIWM) + relScore(relEEM) + relScore(relXLYXLP) + cryptoLead) / 5;
  const trend = (tr('SPY') + tr('QQQ') + tr('RSP') + tr('IWM') + tr('SOX') + tr('HYG')) / 6;

  // Divergence.
  const spyC = packs.SPY.c;
  const spyH20 = packs.SPY.h20;
  const spyM20 = packs.SPY.m20;
  const vixM5 = packs.VIX.m5;
  const dxyM20 = packs.DXY.m20;
  const hygM20 = packs.HYG.m20;
  const spyNearHigh = !Number.isNaN(spyC) && !Number.isNaN(spyH20) && spyH20 !== 0 && spyC >= spyH20 * 0.98;
  const priceStrong = spyNearHigh || (!Number.isNaN(spyM20) && spyM20 > 2);
  const W = cfg;
  let divPoints = 0;
  if (relRSP < W.breadthWarnRel) divPoints += 10;
  if (relIWM < W.breadthWarnRel - 0.5) divPoints += 10;
  if (relSOXQ < W.breadthWarnRel - 0.5) divPoints += 10;
  if (hygM20 < W.creditWarnMom) divPoints += 12;
  if (relHYGLQD < 0) divPoints += 8;
  if (vixM5 > W.vixWarn5) divPoints += 10;
  if (vixBackwardation) divPoints += 10;
  if (dxyM20 > W.dxyWarn20) divPoints += 8;
  if (us10RiseBp > W.yieldWarnBp) divPoints += 8;
  if (relXLYXLP < W.breadthWarnRel - 0.5) divPoints += 6;
  if (relEEM < W.breadthWarnRel - 0.5) divPoints += 4;
  const divergence = clamp(divPoints * (priceStrong ? 100 / 96 : 62 / 96), 0, 100);

  const fragility = clamp(0.55 * (100 - health) + 0.45 * divergence, 0, 100);
  const transition = clamp(0.45 * fragility + 0.35 * divergence + 0.2 * deterioration, 0, 100);

  // Rotation.
  const rotGrowth = (rotScore(m20('QQQ'), m60('QQQ'), m20('QQQ') - m20('SPY'), tr('QQQ')) + rotScore(m20('SOX'), m60('SOX'), relSOXQ, tr('SOX')) + rotScore(m20('XLK'), m60('XLK'), relXLK, tr('XLK'))) / 3;
  const rotSmall = rotScore(m20('IWM'), m60('IWM'), relIWM, tr('IWM'));
  const rotCyclical = (rotScore(m20('XLI'), m60('XLI'), relXLI, tr('XLI')) + rotScore(m20('XLY'), m60('XLY'), m20('XLY') - m20('SPY'), tr('XLY')) + rotScore(m20('XLF'), m60('XLF'), relXLF, tr('XLF')) + absRotScore(m20('COPPER'), m60('COPPER'), tr('COPPER'))) / 4;
  const rotEM = rotScore(m20('EEM'), m60('EEM'), relEEM, tr('EEM'));
  const rotCrypto = (rotScore(m20('BTC'), m60('BTC'), relBTC, tr('BTC')) + rotScore(m20('ETH'), m60('ETH'), relETH, tr('ETH')) + rotScore(m20('TOTAL3'), m60('TOTAL3'), relT3, tr('TOTAL3'))) / 3;
  const rotMetals = (absRotScore(m20('GOLD'), m60('GOLD'), tr('GOLD')) + absRotScore(m20('SILVER'), m60('SILVER'), tr('SILVER'))) / 2;
  const rotCommodities = (absRotScore(m20('COPPER'), m60('COPPER'), tr('COPPER')) + absRotScore(m20('OIL'), m60('OIL'), tr('OIL'))) / 2;
  const rotBonds = absRotScore(m20('TLT'), m60('TLT'), tr('TLT'));
  const rotDefensive = (rotScore(m20('XLP'), m60('XLP'), m20('XLP') - m20('SPY'), tr('XLP')) + rotScore(m20('XLU'), m60('XLU'), relXLU, tr('XLU'))) / 2;

  const rotEntries: { name: string; score: number }[] = [
    { name: 'GROWTH', score: rotGrowth }, { name: 'SMALL CAPS', score: rotSmall }, { name: 'CYCLICALS', score: rotCyclical },
    { name: 'EM', score: rotEM }, { name: 'CRYPTO', score: rotCrypto }, { name: 'METALS', score: rotMetals },
    { name: 'COMMODITIES', score: rotCommodities }, { name: 'BONDS', score: rotBonds }, { name: 'DEFENSIVE', score: rotDefensive },
  ];
  const rotationTop = [...rotEntries].sort((a, b) => b.score - a.score).slice(0, 3);

  const breadthScore = breadth;
  let rotationRegime = 'MIXED ROTATION';
  if (rotCrypto >= 75 && rotSmall >= 65 && rotGrowth >= 65) rotationRegime = 'SPECULATIVE EXPANSION';
  else if (rotGrowth >= 65 && rotSmall >= 60 && rotCyclical >= 60) rotationRegime = 'BROAD RISK-ON';
  else if (rotGrowth >= 72 && breadthScore < 58) rotationRegime = 'NARROW GROWTH';
  else if (rotCommodities >= 65 && rotCyclical >= 60 && rotGrowth < 65) rotationRegime = 'REFLATION / LATE CYCLE';
  else if (rotBonds >= 65 && rotDefensive >= 65 && health < 55) rotationRegime = 'DEFENSIVE ROTATION';
  else if (health < 38 && (vixM5 > W.vixWarn5 || vixBackwardation)) rotationRegime = 'LIQUIDATION';
  else if (credit >= 62 && rotGrowth >= 60 && rotSmall < 60) rotationRegime = 'EARLY RISK-ON';

  // Warnings.
  const breadthWarn = relRSP < W.breadthWarnRel || relIWM < W.breadthWarnRel - 0.5;
  const creditWarn = hygM20 < W.creditWarnMom || relHYGLQD < 0;
  const volWarn = vixM5 > W.vixWarn5 || vixBackwardation;
  const ratesWarn = dxyM20 > W.dxyWarn20 || us10RiseBp > W.yieldWarnBp;
  const leadWarn = relSOXQ < W.breadthWarnRel - 0.5 || relXLYXLP < W.breadthWarnRel - 0.5;
  const warningCount = [breadthWarn, creditWarn, volWarn, ratesWarn, leadWarn].filter(Boolean).length;

  // Regime + path.
  let regime = 'NEUTRAL';
  if (health >= 72 && fragility < 35 && transition < 40) regime = 'HEALTHY RISK-ON';
  else if (health >= 60 && transition < 55) regime = 'RISK-ON';
  else if (health >= 55 && (fragility >= 55 || transition >= 55)) regime = 'RISK-ON WEAKENING';
  else if (health >= 45) regime = 'TRANSITION / NEUTRAL';
  else if (health >= 35) regime = 'RISK-OFF BUILDING';
  else regime = 'RISK-OFF';

  let transitionPath = 'STABLE';
  if (regime === 'HEALTHY RISK-ON' || regime === 'RISK-ON') transitionPath = transition >= 50 ? 'RISK-ON → NEUTRAL' : 'RISK-ON STABLE';
  else if (regime === 'RISK-ON WEAKENING') transitionPath = 'RISK-ON → NEUTRAL';
  else if (regime === 'TRANSITION / NEUTRAL') transitionPath = healthDelta5 < 0 ? 'NEUTRAL → RISK-OFF' : 'NEUTRAL → RISK-ON';
  else transitionPath = healthDelta5 > 0 ? 'RISK-OFF → NEUTRAL' : 'RISK-OFF STABLE';

  // Verdict + playbook.
  let verdict = 'NEUTRAL';
  let playbook = 'WAIT FOR CONFIRMATION';
  let verdictSemantic: SemanticState = 'neutral';
  if (health >= 72 && fragility < 35) { verdict = 'STRONG RISK-ON'; playbook = 'FAVOR LEADERS'; verdictSemantic = 'strong-positive'; }
  else if (health >= 60 && fragility < 55) { verdict = 'RISK-ON'; playbook = 'FAVOR PULLBACKS'; verdictSemantic = 'strong-positive'; }
  else if (health >= 55 && fragility >= 55) { verdict = 'CAUTIOUS RISK-ON'; playbook = 'TIGHTEN RISK'; verdictSemantic = 'warning'; }
  else if (health >= 45) { verdict = 'NEUTRAL / TRANSITION'; playbook = 'WAIT FOR CONFIRMATION'; verdictSemantic = 'neutral'; }
  else if (health >= 35) { verdict = 'DEFENSIVE'; playbook = 'REDUCE BETA'; verdictSemantic = 'warning'; }
  else { verdict = 'RISK-OFF'; playbook = 'CAPITAL PRESERVATION'; verdictSemantic = 'negative'; }

  // Confidence.
  const componentAvg = (breadth + credit + volatility + ratesDollar + leadership + trend) / 6;
  const avgDev = (Math.abs(breadth - componentAvg) + Math.abs(credit - componentAvg) + Math.abs(volatility - componentAvg) + Math.abs(ratesDollar - componentAvg) + Math.abs(leadership - componentAvg) + Math.abs(trend - componentAvg)) / 6;
  const bullSide = health >= 50;
  const agreeCount = [breadth, credit, volatility, ratesDollar, leadership, trend].filter((s) => (s >= 50) === bullSide).length;
  const agreementPct = (100 * agreeCount) / 6;
  const dispersionScore = clamp(100 - avgDev * 1.8, 0, 100);
  const confidence = clamp(0.6 * agreementPct + 0.4 * dispersionScore, 0, 100);
  const confidenceText = confidence >= 80 ? 'HIGH' : confidence >= 65 ? 'GOOD' : confidence >= 50 ? 'MOD' : 'LOW';

  const masterLink = health - fragility;

  const rel = (v: number) => (v >= 1.5 ? 'LEADING' : v <= -1.5 ? 'LAGGING' : 'NEUTRAL');
  const relSem = (v: number): SemanticState => (v >= 1.5 ? 'strong-positive' : v <= -1.5 ? 'negative' : 'neutral');
  const rotSem = (s: number): SemanticState => (s >= 70 ? 'strong-positive' : s >= 58 ? 'positive' : s >= 45 ? 'neutral' : s >= 32 ? 'warning' : 'negative');
  const rotState = (s: number) => (s >= 70 ? 'STRONG' : s >= 58 ? 'BUILDING' : s >= 45 ? 'MIXED' : s >= 32 ? 'WEAK' : 'EXITING');

  const internals: FragilityInternalMetric[] = [
    { key: 'rsp', label: 'Equal Weight / SPY', value: round2(relRSP), state: rel(relRSP), semantic: relSem(relRSP) },
    { key: 'iwm', label: 'Small Caps / SPY', value: round2(relIWM), state: rel(relIWM), semantic: relSem(relIWM) },
    { key: 'sox', label: 'Semis / Nasdaq', value: round2(relSOXQ), state: rel(relSOXQ), semantic: relSem(relSOXQ) },
    { key: 'hyg', label: 'High Yield / IG', value: round2(relHYGLQD), state: relHYGLQD >= 0 ? 'CONFIRM' : 'DIVERGE', semantic: relHYGLQD >= 0 ? 'positive' : 'negative' },
    { key: 'vix', label: 'VIX Term', value: round2(Number.isNaN(vixTermPct) ? 0 : vixTermPct), state: vixBackwardation ? 'BACKWARD' : 'CONTANGO', semantic: vixBackwardation ? 'negative' : 'positive' },
    { key: 'dxy', label: 'Dollar', value: round2(Number.isNaN(dxyM20) ? 0 : dxyM20), state: dxyM20 <= 0 ? 'TAILWIND' : 'HEADWIND', semantic: dxyM20 <= 0 ? 'positive' : 'negative' },
    { key: 'us10', label: 'US 10Y Shock', value: round2(Number.isNaN(us10RiseBp) ? 0 : us10RiseBp), state: us10RiseBp > W.yieldWarnBp ? 'TIGHTEN' : 'OK', semantic: us10RiseBp > W.yieldWarnBp ? 'negative' : 'strong-positive' },
    { key: 'cyc', label: 'Cyclical / Defensive', value: round2(relXLYXLP), state: rel(relXLYXLP), semantic: relSem(relXLYXLP) },
  ];

  const radar: RotationRadarResult[] = rotEntries.map((e) => ({ sector: e.name, score: round2(e.score), state: rotState(e.score), semantic: rotSem(e.score) }));

  const calculatedAt = timestamp;
  const dataAge = Date.parse(calculatedAt) - Date.parse(input.dataAsOf);
  const isStale = Number.isFinite(dataAge) ? dataAge > cfg.staleAfterHours * 3600_000 : true;
  const sourceStatus: FragilitySourceStatus = missingSymbols.length === 0 ? input.sourceStatus : missingSymbols.length >= FRAGILITY_SYMBOLS.length ? 'DATA_UNAVAILABLE' : 'PARTIAL';

  return {
    calculatedAt,
    dataAsOf: input.dataAsOf,
    isStale,
    sourceStatus,
    providersUsed: input.providersUsed,
    missingSymbols,
    health, fragility, transition, divergence, deterioration,
    breadth, credit, volatility, ratesDollar, leadership, trend,
    warningCount,
    warnings: { breadth: breadthWarn, credit: creditWarn, vol: volWarn, rates: ratesWarn, lead: leadWarn },
    regime, transitionPath, verdict, verdictSemantic, playbook, rotationRegime,
    confidence, confidenceText,
    rotation: { growth: rotGrowth, small: rotSmall, cyclical: rotCyclical, em: rotEM, crypto: rotCrypto, metals: rotMetals, commodities: rotCommodities, bonds: rotBonds, defensive: rotDefensive },
    rotationTop,
    radar,
    masterLink,
    masterOrientation: clamp(50 + masterLink * 0.5, 0, 100),
    internals,
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
