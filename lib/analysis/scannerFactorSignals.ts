/* ---------------------------------------------------------------------------
   SCANNER FACTOR SIGNALS — turns raw indicators + universe context into the
   normalized, independent factor votes that MSP Composite v2 consumes.

   Pure and dependency-light. This is the bridge between the scanner's raw
   per-symbol indicators and `computeCompositeV2`:

     raw indicators ──► deriveFactorSignals ──► FactorInput[] (+ multipliers)
                                                        │
                                                        ▼
                                                computeCompositeV2

   Semantics (all votes are PRO-DIRECTIONAL, bullish positive, in [-1, 1]):
     • Correlated trend indicators (EMA / DI / Aroon / MACD) collapse to ONE
       TREND vote so trend is not multiply-counted.
     • RELATIVE_STRENGTH and VOLUME prefer CROSS-SECTIONAL percentile ranking
       (vs the scanned universe) when a distribution is supplied, else fall back
       to a bounded transform.
     • VOLATILITY is an aligned modifier: it reinforces the prevailing direction
       when a clean setup exists (compression / squeeze) and opposes it on
       exhaustion / trap flags — it does not vote a fresh direction.
     • QUALITY / LIQUIDITY is NOT a directional vote; it becomes a hard
       liquidity multiplier so illiquid / low-quality names cannot top the board.
     • CATALYST uses directional news sentiment when available; imminent earnings
       reduce conviction via the multiplier and surface as a caution.

   Nothing here predicts outcomes — this is notability-for-research normalization.
   --------------------------------------------------------------------------- */

import {
  percentileRank,
  percentileToSigned,
  type FactorInput,
} from './scannerScoreV2';

export interface UniverseContext {
  /** Relative-strength ratios (vs index) for every scanned symbol. */
  rsIndexRatios?: number[];
  /** Relative-strength ratios (vs sector) for every scanned symbol. */
  rsSectorRatios?: number[];
  /** Dollar-volume (price × volume) for every scanned symbol. */
  dollarVolumes?: number[];
}

export interface FactorSignalInput {
  // Trend
  price?: number;
  ema200?: number;
  macdHist?: number;
  adx?: number;
  aroonUp?: number;
  aroonDown?: number;
  plusDI?: number;
  minusDI?: number;
  // Momentum
  rsi?: number;
  stochK?: number;
  cci?: number;
  // Volume / participation
  mfi?: number;
  obvChangePct?: number;
  vwapPct?: number;
  /** Volume relative to the symbol's own baseline (>1 = above average). */
  relativeVolume?: number;
  // Relative strength
  rsIndexRatio?: number;
  rsSectorRatio?: number;
  // Volatility state
  bbwp?: number;
  dveBreakoutScore?: number;
  dveFlags?: string[];
  // Positioning (crypto derivatives)
  fundingRate?: number;
  oiChangePercent?: number;
  derivativesExpected?: boolean;
  // Quality / liquidity
  marketCap?: number;
  dollarVolume?: number;
  /** True for warrants / rights / units — structurally low-quality for research. */
  isDerivativeSecurity?: boolean;
  // Catalyst
  earningsInDays?: number | null;
  /** Directional news sentiment in [-1, 1] (e.g. Alpha Vantage). */
  newsSentiment?: number;
}

export interface FactorSignalResult {
  factors: FactorInput[];
  /** Hard multiplier (0.3–1) from quality / liquidity / imminent catalyst. */
  liquidityMultiplier: number;
  provisionalDirection: 'bullish' | 'bearish' | 'neutral';
  catalyst: { earningsInDays: number | null; imminent: boolean };
}

// Normalization scales (value that maps to a full ±1 vote).
const EMA_PCT_FULL = 8;
const DI_FULL = 25;
const CCI_FULL = 150;
const OBV_FULL = 5;
const VWAP_FULL = 3;
const RS_RATIO_FULL = 0.15;
const FUNDING_FULL = 0.05;
const PROVISIONAL_BAND = 0.1;

interface SubSignal {
  available: boolean;
  signed: number;
}

export function deriveTrendSignal(i: FactorSignalInput): SubSignal {
  const subs: number[] = [];
  if (fin(i.price) && fin(i.ema200) && (i.ema200 as number) > 0) {
    subs.push(bounded(((i.price! - i.ema200!) / i.ema200!) * 100, EMA_PCT_FULL));
  }
  if (fin(i.plusDI) && fin(i.minusDI)) subs.push(bounded(i.plusDI! - i.minusDI!, DI_FULL));
  if (fin(i.aroonUp) && fin(i.aroonDown)) subs.push(clamp((i.aroonUp! - i.aroonDown!) / 100, -1, 1));
  if (fin(i.macdHist)) subs.push(Math.sign(i.macdHist!) * 0.5);
  if (subs.length === 0) return { available: false, signed: 0 };
  const base = mean(subs);
  const adxConf = fin(i.adx) ? clamp(0.4 + i.adx! / 50, 0.4, 1.3) : 1;
  return { available: true, signed: clamp(base * adxConf, -1, 1) };
}

export function deriveMomentumSignal(i: FactorSignalInput): SubSignal {
  const subs: number[] = [];
  if (fin(i.rsi)) subs.push(clamp((i.rsi! - 50) / 50, -1, 1));
  if (fin(i.stochK)) subs.push(clamp((i.stochK! - 50) / 50, -1, 1));
  if (fin(i.cci)) subs.push(bounded(i.cci!, CCI_FULL));
  if (subs.length === 0) return { available: false, signed: 0 };
  return { available: true, signed: clamp(mean(subs), -1, 1) };
}

export function deriveVolumeSignal(i: FactorSignalInput): SubSignal {
  const subs: number[] = [];
  if (fin(i.obvChangePct)) subs.push(bounded(i.obvChangePct!, OBV_FULL));
  if (fin(i.mfi)) subs.push(clamp((i.mfi! - 50) / 50, -1, 1));
  if (fin(i.vwapPct)) subs.push(bounded(i.vwapPct!, VWAP_FULL));
  if (subs.length === 0) return { available: false, signed: 0 };
  const base = mean(subs);
  const relScale = fin(i.relativeVolume) ? clamp(i.relativeVolume! / 1.2, 0.5, 1.4) : 1;
  return { available: true, signed: clamp(base * relScale, -1, 1) };
}

export function deriveRelativeStrengthSignal(i: FactorSignalInput, u?: UniverseContext): SubSignal {
  const subs: number[] = [];
  if (fin(i.rsIndexRatio)) subs.push(signRatio(i.rsIndexRatio!, u?.rsIndexRatios));
  if (fin(i.rsSectorRatio)) subs.push(signRatio(i.rsSectorRatio!, u?.rsSectorRatios));
  if (subs.length === 0) return { available: false, signed: 0 };
  return { available: true, signed: clamp(mean(subs), -1, 1) };
}

export function derivePositioningSignal(i: FactorSignalInput): SubSignal {
  if (!i.derivativesExpected || !fin(i.fundingRate)) return { available: false, signed: 0 };
  // Crowded longs (positive funding) = squeeze/mean-reversion risk → bearish tilt.
  const signed = -bounded(i.fundingRate!, FUNDING_FULL);
  return { available: true, signed: clamp(signed, -1, 1) };
}

export function deriveVolatilityModifier(i: FactorSignalInput, provisionalSign: number): SubSignal {
  const hasVol = fin(i.bbwp) || fin(i.dveBreakoutScore) || (i.dveFlags?.length ?? 0) > 0;
  if (!hasVol) return { available: false, signed: 0 };
  const flags = i.dveFlags ?? [];
  let support = 0;
  if (fin(i.bbwp) && i.bbwp! < 20) support += 0.4; // compression pre-expansion
  if (flags.includes('SQUEEZE_FIRE')) support += 0.4;
  if (flags.includes('HIGH_BREAKOUT')) support += 0.3;
  if (flags.includes('EXHAUSTION_RISK')) support -= 0.4;
  if (flags.includes('VOL_TRAP')) support -= 0.4;
  if (fin(i.bbwp) && i.bbwp! > 90) support -= 0.2; // climax
  support = clamp(support, -0.6, 0.6);
  const sign = provisionalSign === 0 ? 0 : Math.sign(provisionalSign);
  return { available: true, signed: clamp(sign * support, -1, 1) };
}

export function deriveCatalystSignal(i: FactorSignalInput): SubSignal {
  if (!fin(i.newsSentiment)) return { available: false, signed: 0 };
  return { available: true, signed: clamp(i.newsSentiment!, -1, 1) };
}

export function deriveLiquidityMultiplier(i: FactorSignalInput, u?: UniverseContext): number {
  let m = 1;
  if (fin(i.marketCap)) {
    if (i.marketCap! < 50_000_000) m *= 0.6;
    else if (i.marketCap! < 100_000_000) m *= 0.8;
  }
  if (fin(i.dollarVolume)) {
    if (u?.dollarVolumes && u.dollarVolumes.length > 0) {
      const pct = percentileRank(i.dollarVolume!, u.dollarVolumes);
      if (pct < 10) m *= 0.7;
      else if (pct < 25) m *= 0.85;
    } else if (i.dollarVolume! < 1_000_000) {
      m *= 0.7;
    }
  }
  if (i.isDerivativeSecurity) m *= 0.5;
  if (i.earningsInDays != null && i.earningsInDays >= 0 && i.earningsInDays <= 2) m *= 0.9;
  return clamp(m, 0.3, 1);
}

export function deriveFactorSignals(i: FactorSignalInput, u?: UniverseContext): FactorSignalResult {
  const trend = deriveTrendSignal(i);
  const momentum = deriveMomentumSignal(i);
  const volume = deriveVolumeSignal(i);
  const rs = deriveRelativeStrengthSignal(i, u);
  const positioning = derivePositioningSignal(i);
  const catalyst = deriveCatalystSignal(i);

  // Provisional direction from the clean directional votes (excludes the
  // volatility modifier, which needs a direction to align to).
  const coreVotes = [trend, momentum, volume, rs, positioning].filter((s) => s.available).map((s) => s.signed);
  const provisionalMean = coreVotes.length > 0 ? mean(coreVotes) : 0;
  const provisionalDirection: FactorSignalResult['provisionalDirection'] =
    provisionalMean > PROVISIONAL_BAND ? 'bullish' : provisionalMean < -PROVISIONAL_BAND ? 'bearish' : 'neutral';

  const volatility = deriveVolatilityModifier(i, provisionalMean);

  const factors: FactorInput[] = [
    { factor: 'TREND', signed: trend.signed, available: trend.available },
    { factor: 'MOMENTUM', signed: momentum.signed, available: momentum.available },
    { factor: 'VOLUME', signed: volume.signed, available: volume.available },
    { factor: 'RELATIVE_STRENGTH', signed: rs.signed, available: rs.available },
    { factor: 'POSITIONING', signed: positioning.signed, available: positioning.available },
    { factor: 'VOLATILITY', signed: volatility.signed, available: volatility.available },
    // QUALITY is expressed as the liquidity multiplier, not a directional vote.
    { factor: 'QUALITY', signed: 0, available: false },
    { factor: 'CATALYST', signed: catalyst.signed, available: catalyst.available },
  ];

  return {
    factors,
    liquidityMultiplier: deriveLiquidityMultiplier(i, u),
    provisionalDirection,
    catalyst: {
      earningsInDays: i.earningsInDays ?? null,
      imminent: i.earningsInDays != null && i.earningsInDays >= 0 && i.earningsInDays <= 2,
    },
  };
}

function signRatio(ratio: number, dist?: number[]): number {
  if (dist && dist.length > 0) return percentileToSigned(percentileRank(ratio, dist));
  return bounded(ratio - 1, RS_RATIO_FULL);
}

function fin(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function bounded(value: number, full: number): number {
  if (!Number.isFinite(value) || full === 0) return 0;
  return clamp(value / full, -1, 1);
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}
