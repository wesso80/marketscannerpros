/**
 * Per-setup scoring. Each setup type has its own factor set, weights and eligibility rule, evaluated separately for
 * long and short with mirrored inputs (d = +1 long, −1 short). Factor values are 0..1; null = unavailable.
 *
 * Principles (from the scoring audit / bot review):
 *  - Overbought/oversold never boosts the trade direction: RSI past 70 (long) / 30 (short) scores LOWER.
 *  - Stretch > 2 ATR from EMA20, or a close beyond the outer Bollinger band, kills continuation entry location.
 *  - A setup whose defining level has already broken (long below the last swing low) is ineligible.
 *  - Invalidation comes from swing structure (recent swing low − 0.1 ATR for longs), not a fixed ATR stop.
 */
import type { CanonicalDirection, CanonicalFeatures, CanonicalLevels, FactorResult, SetupCandidate, SetupType } from './types';

export const SETUP_POLICY = {
  swingBufferAtr: 0.1,
  fallbackStopAtr: 2,
  minRiskAtr: 0.5,
  /** Fades are entered into a volatile reversal zone: never risk less than 1 ATR beyond the extreme. */
  fadeMinRiskAtr: 1,
  projectedTargetR: 2,
  stretchMaxAtr: 2,
  squeezePercentileMax: 20,
  fadeMinStretchAtr: 2,
} as const;

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Linear 0→1 as x goes a→b (a > b allowed for descending ramps). */
const ramp = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
const round = (v: number, dp = 2) => (fin(v) ? Number(v.toFixed(dp)) : null);

function factor(name: string, weight: number, value: number | null, raw: FactorResult['raw'], note?: string): FactorResult {
  const v = value === null || !fin(value) ? null : Number(clamp01(value).toFixed(3));
  return { name, weight, value: v, pass: v === null ? null : v >= 0.5, raw, ...(note ? { note } : {}) };
}

function mean(parts: Array<number | null>): number | null {
  const ok = parts.filter(fin);
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
}

/** Oriented view of the features for direction d. */
function orient(f: CanonicalFeatures, d: 1 | -1) {
  return {
    rsiD: fin(f.rsi) ? (d > 0 ? f.rsi : 100 - f.rsi) : Number.NaN,
    diSpread: fin(f.plusDI) && fin(f.minusDI) ? d * (f.plusDI - f.minusDI) : Number.NaN,
    aboveEma50: fin(f.ema50) ? d * (f.close - f.ema50) > 0 : null,
    ema50Over200: fin(f.ema50) && fin(f.ema200) ? d * (f.ema50 - f.ema200) > 0 : null,
    ema20Over50: fin(f.ema20) && fin(f.ema50) ? d * (f.ema20 - f.ema50) > 0 : null,
    structure: f.structure === 'unknown' ? null : f.structure === 'mixed' ? 0.5 : (f.structure === 'up') === (d > 0) ? 1 : 0,
    stretch: d * f.distEma20Atr,
    band: d * f.beyondBand,
    /** The defining swing on our side has been broken (long: close below the last pivot low). */
    levelBroken: d > 0
      ? (f.lastPivotLow ? f.close < f.lastPivotLow.price : null)
      : (f.lastPivotHigh ? f.close > f.lastPivotHigh.price : null),
  };
}

const b01 = (v: boolean | null) => (v === null ? null : v ? 1 : 0);

// ── Levels ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export function structuralLevels(f: CanonicalFeatures, d: 1 | -1): CanonicalLevels {
  const atr = f.atr, entry = f.close;
  const flags: string[] = [];
  const swing = d > 0 ? f.lastPivotLow : f.lastPivotHigh;
  const recent = swing && f.bars - 1 - swing.index <= 60 && d * (entry - swing.price) > 0 ? swing.price : null;
  const extreme = d > 0 ? f.low10 : f.high10;
  let basis: CanonicalLevels['invalidationBasis'];
  let invalidation: number;
  if (recent !== null) {
    basis = 'swing';
    invalidation = recent - d * SETUP_POLICY.swingBufferAtr * atr;
  } else if (fin(extreme) && d * (entry - extreme) >= SETUP_POLICY.minRiskAtr * atr) {
    basis = 'recent_extreme';
    invalidation = extreme - d * SETUP_POLICY.swingBufferAtr * atr;
  } else {
    basis = 'atr_fallback';
    invalidation = entry - d * SETUP_POLICY.fallbackStopAtr * atr;
    flags.push('atr_fallback');
  }
  if (d * (entry - invalidation) < SETUP_POLICY.minRiskAtr * atr) {
    invalidation = entry - d * SETUP_POLICY.minRiskAtr * atr;
    flags.push('min_risk_widened');
  }
  const risk = Math.abs(entry - invalidation);
  const opposing = d > 0 ? f.resistanceAbove : f.supportBelow;
  let target: number, targetBasis: CanonicalLevels['targetBasis'];
  if (opposing !== null && fin(opposing)) { target = opposing; targetBasis = 'opposing_level'; }
  else { target = entry + d * SETUP_POLICY.projectedTargetR * risk; targetBasis = 'projected'; flags.push('projected_target'); }
  const rr = risk > 0 ? Math.abs(target - entry) / risk : 0;
  return { entry, invalidation, target, riskReward: Number(rr.toFixed(2)), invalidationBasis: basis, targetBasis, flags };
}

/** Fade levels: invalidation beyond the move's recent extreme, target back at EMA20. */
export function fadeLevels(f: CanonicalFeatures, d: 1 | -1): CanonicalLevels {
  const atr = f.atr, entry = f.close;
  const flags: string[] = [];
  const extreme = d > 0 ? f.low5 : f.high5;
  let invalidation: number, basis: CanonicalLevels['invalidationBasis'];
  if (fin(extreme)) { invalidation = extreme - d * SETUP_POLICY.swingBufferAtr * atr; basis = 'recent_extreme'; }
  else { invalidation = entry - d * SETUP_POLICY.fallbackStopAtr * atr; basis = 'atr_fallback'; flags.push('atr_fallback'); }
  if (d * (entry - invalidation) < SETUP_POLICY.fadeMinRiskAtr * atr) {
    invalidation = entry - d * SETUP_POLICY.fadeMinRiskAtr * atr;
    flags.push('min_risk_widened');
  }
  const risk = Math.abs(entry - invalidation);
  let target: number, targetBasis: CanonicalLevels['targetBasis'];
  if (fin(f.ema20) && d * (f.ema20 - entry) > 0) { target = f.ema20; targetBasis = 'ema20'; }
  else { target = entry + d * risk; targetBasis = 'projected'; flags.push('projected_target'); }
  const rr = risk > 0 ? Math.abs(target - entry) / risk : 0;
  return { entry, invalidation, target, riskReward: Number(rr.toFixed(2)), invalidationBasis: basis, targetBasis, flags };
}

// ── Shared factors ─────────────────────────────────────────────────────────────────────────────────────────────────
function trendQuality(f: CanonicalFeatures, d: 1 | -1, w: number): FactorResult {
  const o = orient(f, d);
  const adxPart = fin(f.adx) && fin(o.diSpread) ? ramp(f.adx, 15, 30) * (o.diSpread > 0 ? 1 : 0) : null;
  return factor('trendQuality', w, mean([b01(o.aboveEma50), b01(o.ema50Over200), b01(o.ema20Over50), adxPart, o.structure]), {
    adx: round(f.adx, 1), diSpread: round(o.diSpread, 1), structure: f.structure,
    ema20: round(f.ema20, 4), ema50: round(f.ema50, 4), ema200: round(f.ema200, 4),
  });
}

function entryLocation(f: CanonicalFeatures, d: 1 | -1, w: number): FactorResult {
  const o = orient(f, d);
  if (!fin(o.stretch)) return factor('entryLocation', w, null, { stretchAtr: null });
  let v: number;
  let note: string | undefined;
  if (o.band > 0) { v = 0; note = 'closed beyond the outer Bollinger band'; }
  else if (o.stretch > 3) v = 0;
  else if (o.stretch > SETUP_POLICY.stretchMaxAtr) { v = ramp(o.stretch, 3, 2) * 0.3; note = `stretched ${o.stretch.toFixed(1)} ATR from EMA20`; }
  else if (o.stretch > 1) v = 1 - 0.6 * ramp(o.stretch, 1, 2);
  else if (o.stretch >= -0.5) v = 1;
  else if (o.stretch >= -1.5) v = 0.6;
  else v = 0.3;
  return factor('entryLocation', w, v, { stretchAtr: round(o.stretch), beyondBand: f.beyondBand }, note);
}

function volatilityRegime(f: CanonicalFeatures, w: number): FactorResult {
  const p = f.atrPctPercentile;
  if (!fin(p)) return factor('volatilityRegime', w, null, { atrPct: round(f.atrPct), atrPctPercentile: null });
  const v = p < 80 ? 1 : p < 90 ? 1 - 0.4 * ramp(p, 80, 90) : p < 97 ? 0.3 : 0;
  return factor('volatilityRegime', w, v, { atrPct: round(f.atrPct), atrPctPercentile: round(p, 0) });
}

function volumeConfirm(f: CanonicalFeatures, d: 1 | -1, w: number): FactorResult {
  if (f.volumeRatio === null) return factor('volume', w, null, { volumeRatio: null });
  const barDir = fin(f.open) ? Math.sign(f.close - f.open) * d : 0;
  const vr = f.volumeRatio;
  const v = vr >= 1.2 ? (barDir > 0 ? 1 : barDir < 0 ? 0.2 : 0.6) : vr >= 0.8 ? 0.6 : 0.4;
  return factor('volume', w, v, { volumeRatio: round(vr) });
}

function momentum(f: CanonicalFeatures, d: 1 | -1, w: number): FactorResult {
  const r = orient(f, d).rsiD;
  if (!fin(r)) return factor('momentum', w, null, { rsi: null });
  const v = r < 40 ? 0.1 : r < 50 ? 0.2 + 0.3 * ramp(r, 40, 50) : r <= 65 ? 1 : r <= 70 ? 0.6 : r <= 80 ? 0.3 : 0.1;
  return factor('momentum', w, v, { rsi: round(f.rsi, 1) }, r > 70 ? 'overbought for this side — not a boost' : undefined);
}

function structureRoom(f: CanonicalFeatures, lv: CanonicalLevels, w: number): FactorResult {
  const raw = { riskReward: lv.riskReward, targetAtr: fin(f.atr) && f.atr > 0 ? round(Math.abs(lv.target - lv.entry) / f.atr) : null, targetBasis: lv.targetBasis, invalidationBasis: lv.invalidationBasis };
  if (lv.invalidationBasis === 'atr_fallback' && lv.targetBasis === 'projected') return factor('structureRoom', w, null, raw, 'no swing structure available');
  if (lv.targetBasis === 'projected') return factor('structureRoom', w, 0.7, raw, 'no opposing level in lookback — open room, target projected');
  const rr = lv.riskReward;
  let v = rr < 1 ? 0 : rr < 1.5 ? 0.2 + 0.6 * (rr - 1) : rr < 2 ? 0.5 + 0.6 * (rr - 1.5) : rr < 2.5 ? 0.8 + 0.4 * (rr - 2) : 1;
  if (raw.targetAtr !== null && raw.targetAtr < 1) v = Math.min(v, 0.2);
  return factor('structureRoom', w, v, raw);
}

// ── Setup evaluators ───────────────────────────────────────────────────────────────────────────────────────────────
type Eval = { eligible: boolean; reason?: string; factors: FactorResult[]; levels: CanonicalLevels };

function trendContinuation(f: CanonicalFeatures, d: 1 | -1): Eval {
  const o = orient(f, d);
  const levels = structuralLevels(f, d);
  const trendOk = o.aboveEma50 === true && (o.ema50Over200 === true || (o.ema50Over200 === null && o.structure === 1));
  const reason = o.levelBroken === true ? 'LEVEL_BROKEN: close through the last swing on this side'
    : !trendOk ? 'no trend on this side (price/EMA50/EMA200)' : undefined;
  return {
    eligible: !reason, reason, levels,
    factors: [trendQuality(f, d, 0.30), entryLocation(f, d, 0.20), momentum(f, d, 0.15), volumeConfirm(f, d, 0.10), structureRoom(f, levels, 0.15), volatilityRegime(f, 0.10)],
  };
}

function pullback(f: CanonicalFeatures, d: 1 | -1): Eval {
  const o = orient(f, d);
  const levels = structuralLevels(f, d);
  const trendOk = o.ema50Over200 === true || (o.ema50Over200 === null && o.structure === 1);
  const retrace = fin(f.atr) && f.atr > 0 ? (d > 0 ? (f.high10 - f.close) : (f.close - f.low10)) / f.atr : Number.NaN;
  const nearValue = (fin(f.distEma20Atr) && o.stretch >= -1.5 && o.stretch <= 1) || (fin(f.distEma50Atr) && Math.abs(f.distEma50Atr) <= 1);
  const reason = o.levelBroken === true ? 'LEVEL_BROKEN: pullback broke the last swing on this side'
    : !trendOk ? 'higher-timeframe trend (EMA50 vs EMA200) not on this side'
    : !(retrace >= 1) ? 'no pullback (less than 1 ATR off the 10-bar extreme)'
    : !nearValue ? 'pullback not at EMA20/EMA50 value' : undefined;
  const m = Math.min(fin(f.distEma20Atr) ? Math.abs(f.distEma20Atr) : Infinity, fin(f.distEma50Atr) ? Math.abs(f.distEma50Atr) : Infinity);
  const deep = fin(f.distEma50Atr) && d * f.distEma50Atr < -1;
  const loc = !Number.isFinite(m) ? null : deep ? 0.2 : m <= 0.5 ? 1 : m <= 1.5 ? 1 - 0.7 * ramp(m, 0.5, 1.5) : 0.1;
  const r = o.rsiD;
  const reset = !fin(r) ? null : r >= 40 && r <= 55 ? 1 : r > 55 && r <= 62 ? 0.6 : r >= 35 && r < 40 ? 0.5 : 0.2;
  const vt = f.volumeTrend5;
  const dry = vt === null ? null : vt < 0.8 ? 1 : vt <= 1.1 ? 0.6 : 0.3;
  return {
    eligible: !reason, reason, levels,
    factors: [
      trendQuality(f, d, 0.25),
      factor('pullbackLocation', 0.25, loc, { distEma20Atr: round(f.distEma20Atr), distEma50Atr: round(f.distEma50Atr), retraceAtr: round(retrace) }),
      factor('momentumReset', 0.15, reset, { rsi: round(f.rsi, 1) }),
      factor('volumeDryUp', 0.10, dry, { volumeTrend5: vt === null ? null : round(vt) }),
      structureRoom(f, levels, 0.15), volatilityRegime(f, 0.10),
    ],
  };
}

function squeeze(f: CanonicalFeatures, d: 1 | -1, catalystPending?: boolean): Eval {
  const o = orient(f, d);
  const levels = structuralLevels(f, d);
  const p = f.squeezeRatioPercentile;
  const on = fin(f.squeezeRatio) && f.squeezeRatio < 1;
  const reason = !fin(p) ? 'squeeze needs bar history (percentile unavailable)'
    : !(p <= SETUP_POLICY.squeezePercentileMax || on) ? 'no compression' : undefined;
  const comp = !fin(p) ? null : p <= 5 ? 1 : p <= 20 ? 1 - 0.5 * ramp(p, 5, 20) : on ? 0.4 : 0;
  const bias = mean([b01(o.aboveEma50), b01(o.ema20Over50), fin(o.diSpread) ? (o.diSpread > 0 ? 1 : 0) : null, o.structure]);
  const vt = f.volumeTrend5;
  return {
    eligible: !reason, reason, levels,
    factors: [
      factor('compression', 0.35, comp, { squeezeRatio: round(f.squeezeRatio), squeezePercentile: round(p, 0), bbwPct: round(f.bbwPct), bbwPercentile: round(f.bbwPercentile, 0) }),
      factor('directionalBias', 0.20, bias, { diSpread: round(o.diSpread, 1), structure: f.structure }),
      factor('catalystPending', 0.10, catalystPending === undefined ? null : catalystPending ? 1 : 0.3, { catalystPending: catalystPending === undefined ? null : String(catalystPending) }),
      factor('quietVolume', 0.10, vt === null ? null : vt < 0.9 ? 1 : 0.5, { volumeTrend5: vt === null ? null : round(vt) }),
      structureRoom(f, levels, 0.15), volatilityRegime(f, 0.10),
    ],
  };
}

function exhaustionFade(f: CanonicalFeatures, d: 1 | -1): Eval {
  const mv = -d as 1 | -1; // the move being faded
  const levels = fadeLevels(f, d);
  const stretch = mv * f.distEma20Atr;
  const band = mv * f.beyondBand;
  const extremeRsi = mv > 0 ? f.rsiMax5 >= 70 : f.rsiMin5 <= 30;
  const reason = !fin(stretch) ? 'stretch unavailable'
    : !(stretch >= SETUP_POLICY.fadeMinStretchAtr || band > 0) ? 'not stretched (< 2 ATR from EMA20, inside the bands)'
    : !(fin(f.rsiMax5) && extremeRsi) ? 'RSI not at an extreme in the last 5 bars' : undefined;
  const drop = fin(f.rsi) && fin(f.rsiMax5) ? (mv > 0 ? f.rsiMax5 - f.rsi : f.rsi - f.rsiMin5) : Number.NaN;
  const climaxV = f.climax === null ? null : f.climax === mv ? 1 : f.climax === -mv ? 0.8 : 0.3;
  const level = mv > 0 ? f.resistanceAbove : f.supportBelow;
  const levelDist = level !== null && fin(f.atr) && f.atr > 0 ? Math.abs(level - f.close) / f.atr : null;
  const atLevel = f.mode === 'snapshot' ? null : levelDist === null ? 0.3 : levelDist <= 0.75 ? 1 : levelDist <= 1.5 ? 0.6 : 0.2;
  let counter: number | null = fin(f.adx) ? (f.adx < 20 ? 1 : f.adx <= 30 ? 1 - 0.6 * ramp(f.adx, 20, 30) : 0.2) : null;
  if (counter !== null && fin(f.adxSlope) && f.adxSlope > 0 && fin(f.plusDI) && fin(f.minusDI) && mv * (f.plusDI - f.minusDI) > 0) counter *= 0.5;
  if (counter !== null && fin(f.rsiSlope) && mv * f.rsiSlope > 0) counter *= 0.5;
  return {
    eligible: !reason, reason, levels,
    factors: [
      factor('stretch', 0.20, fin(stretch) ? ramp(stretch, 1.5, 3.5) : null, { stretchAtr: round(stretch), beyondBand: f.beyondBand }),
      factor('rsiRollover', 0.20, fin(drop) ? ramp(drop, 0, 8) : null, { rsi: round(f.rsi, 1), rsiExtreme5: round(mv > 0 ? f.rsiMax5 : f.rsiMin5, 1) }),
      factor('climax', 0.15, climaxV, { climax: f.climax }),
      factor('atOpposingLevel', 0.15, atLevel, { levelDistanceAtr: levelDist === null ? null : round(levelDist) }),
      factor('trendNotAccelerating', 0.20, counter, { adx: round(f.adx, 1), adxSlope: round(f.adxSlope, 1), rsiSlope: round(f.rsiSlope, 1) }, 'high/rising ADX or still-rising momentum counts against a fade'),
      structureRoom(f, levels, 0.10),
    ],
  };
}

export function scoreFactors(factors: FactorResult[]): { score: number; coverage: number } {
  const total = factors.reduce((s, x) => s + x.weight, 0);
  const avail = factors.filter((x) => x.value !== null);
  const aw = avail.reduce((s, x) => s + x.weight, 0);
  const score = aw > 0 ? (100 * avail.reduce((s, x) => s + x.weight * (x.value as number), 0)) / aw : 0;
  return { score: Math.round(score), coverage: total > 0 ? Number((aw / total).toFixed(3)) : 0 };
}

export function evaluateSetup(f: CanonicalFeatures, setupType: SetupType, direction: CanonicalDirection, ctx: { catalystPending?: boolean } = {}): SetupCandidate {
  const d: 1 | -1 = direction === 'long' ? 1 : -1;
  const e = setupType === 'TREND_CONTINUATION' ? trendContinuation(f, d)
    : setupType === 'PULLBACK' ? pullback(f, d)
    : setupType === 'SQUEEZE' ? squeeze(f, d, ctx.catalystPending)
    : exhaustionFade(f, d);
  const { score, coverage } = scoreFactors(e.factors);
  return { setupType, direction, eligible: e.eligible, ...(e.reason ? { ineligibleReason: e.reason } : {}), score, coverage, factors: e.factors, levels: e.levels };
}
