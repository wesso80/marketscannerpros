// Cross-Asset Lead/Lag Discovery Engine — native TypeScript port of
// MSP_Cross_Asset_LeadLag_Discovery_Engine_v1.1.2_MASTER_LINK.pine.
//
// This is a PURE function: given aligned 5-minute return series for the target
// (NQ) and each leader, it reproduces the Pine engine's true-lead/sync/rel/adv
// tables, per-asset predictive contributions, predictive edge (-100..+100),
// synchronous confirmation, best-lag selection over [1, 2, 3, 6, 12] 5m bars
// (= +5, +10, +15, +30, +60 minutes), leader ranking, directional agreement,
// regime bands, and the MASTER LINK output that Master consumes.
//
// No HTTP, DB, env, or UI. The Pine file is the authoritative spec; every
// formula, threshold, weight and branch order is copied from it and NOT
// reinterpreted.
//
// Pine → engine input map (all returns are percent log-returns aligned to
// the target's 5m bar grid):
//   f_ret5(sym)          → assets[i].x (leader) / assets[i].y (target-for-this-asset)
//   nqRet                → assets[i].y for full-session leaders
//   nqRTH                → assets[i].y for RTH-only leaders (null outside RTH)
//   xXXX RTH mask        → callers pass x with null values outside RTH for cash
//   rXXX (raw, unmasked) → assets[i].returnsForZ (defaults to x when omitted)
//   aXXX session weight  → assets[i].active (0..1 on current bar)
//
// FROZEN: never change thresholds, weights, bands, lag horizons or branch
// order. Parity status is capped at FORMULA_VALIDATED until a live TradingView
// snapshot proves data parity; FULL_PARITY is never auto-emitted.

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type LeadLagAssetKey =
  | 'ES' | 'SOX' | 'QQQ' | 'NVDA' | 'VIX' | 'DXY' | 'US10Y' | 'HYG' | 'BTC' | 'GOLD' | 'COPPER';

export type LeadLagSourceClass = 'EXACT' | 'ALTERNATIVE' | 'PROXY' | 'DERIVED';

export type LeadLagStatus = 'STABLE' | 'STRENGTHENING' | 'WEAKENING' | 'BREAKING' | 'WEAK';
export type LeadLagEdge = 'STRONG' | 'VALID' | 'WEAK EDGE' | 'NO EDGE';
export type LeadLagRegime = 'STRONG BULL' | 'BULL' | 'NEUTRAL' | 'BEAR' | 'STRONG BEAR';

/** Per-asset series input. All arrays share the same index → same 5m bar. */
export interface LeadLagAssetInput {
  key: LeadLagAssetKey;
  /** Correlation input: leader return series (percent). null = na (RTH mask / missing). */
  x: (number | null)[];
  /**
   * Correlation input: target NQ return series aligned to this asset. null = na.
   * Cash-market leaders (SOX/QQQ/NVDA/VIX/HYG) pass nqRTH (null outside RTH).
   * Full-session leaders pass nqRet.
   */
  y: (number | null)[];
  /**
   * Z-score input: unmasked return series (Pine uses rXXX not xXXX for zXXX).
   * Defaults to `x` when omitted.
   */
  returnsForZ?: (number | null)[];
  /** Session active weight on the current bar (Pine aXXX). 1 = active, 0 = off. */
  active: number;
  classification?: LeadLagSourceClass;
  provider?: string;
  stale?: boolean;
}

export interface LeadLagInput {
  assets: LeadLagAssetInput[];
  /** Chart symbol (informational). */
  targetSymbol: string;
  /** True only when chart symbol contains "NQ" AND timeframe is 5m. */
  engineOK: boolean;
  /** True when the current bar is within NY RTH (09:30–16:00 America/New_York). */
  inRTH: boolean;
  /**
   * Index into the aligned series to evaluate at. Defaults to `x.length - 1`.
   * (Pine implicitly evaluates at bar_index; tests may pin an earlier bar.)
   */
  bar?: number;
  /**
   * Optional prior `predictive` values (bar-by-bar); used to compute
   * `predictiveSignal = ta.ema(predictive, 9)`. When omitted, signal is null.
   */
  predictiveHistory?: (number | null)[];
  providersUsed?: string[];
}

export interface LeadLagConfig {
  corrLen: number;             // primary lookback (5m bars)         [default 144]
  shortLen: number;            // short reliability lookback         [default 60]
  longLen: number;             // long reliability lookback          [default 288]
  zLen: number;                // current-move Z-score lookback      [default 60]
  minLeadAdv: number;          // minimum lead advantage vs SYNC     [default 0.05]
  minLeadCorr: number;         // minimum |lead correlation|         [default 0.20]
  lagBars: readonly number[];  // lag horizons in 5m bars            [1, 2, 3, 6, 12]
  bullThreshold: number;       // +35 → BULL
  strongBullThreshold: number; // +65 → STRONG BULL
  bearThreshold: number;       // −35 → BEAR
  strongBearThreshold: number; // −65 → STRONG BEAR
  agreeEpsilon: number;        // > 0.02 → bull, < -0.02 → bear
  /** advFactor denominator (Pine (adv − minLeadAdv) / 0.25 clamped to [0,1]). */
  advFactorSpan: number;       // 0.25
  /** Relative-strength magnitude denominator (|corr|/0.75 clamped). */
  relMagDivisor: number;       // 0.75
  /** ta.ema length for predictiveSignal. */
  emaSignalLen: number;        // 9
  parityMode: 'FORMULA_VALIDATED' | 'DATA_PARITY_PENDING';
}

export const LEADLAG_CONFIG: LeadLagConfig = {
  corrLen: 144,
  shortLen: 60,
  longLen: 288,
  zLen: 60,
  minLeadAdv: 0.05,
  minLeadCorr: 0.20,
  lagBars: [1, 2, 3, 6, 12] as const,
  bullThreshold: 35,
  strongBullThreshold: 65,
  bearThreshold: -35,
  strongBearThreshold: -65,
  agreeEpsilon: 0.02,
  advFactorSpan: 0.25,
  relMagDivisor: 0.75,
  emaSignalLen: 9,
  parityMode: 'FORMULA_VALIDATED',
};

/** Per-asset result — includes every field the Pine dashboard shows for a row. */
export interface LeadLagAssetResult {
  key: LeadLagAssetKey;
  classification: LeadLagSourceClass;
  provider?: string;
  stale: boolean;
  active: number;

  /** Synchronous correlation (c0). null = na (insufficient data). */
  sync: number | null;
  /** Best-lag correlation over the [1,2,3,6,12] grid. */
  leadCorr: number | null;
  /** Selected lag in 5m bars. Always defined; Pine seeds lag=1 when everything is na. */
  lag: number;
  /** Selected-lag correlation over shortLen. */
  shortCorr: number | null;
  /** Selected-lag correlation over longLen. */
  longCorr: number | null;
  /** Sync correlation over shortLen. */
  shortSync: number | null;
  /** Sync correlation over longLen. */
  longSync: number | null;

  /** relScore for predictive lead (0..100). */
  rel: number;
  /** relScore for synchronous confirmation (0..100). */
  relSync: number;
  /** |leadCorr| − |sync|. NaN if both na (Pine treats math.abs(na) − math.abs(na) as na). */
  advantage: number;
  status: LeadLagStatus;
  edge: LeadLagEdge;
  edgeScore: number;

  /** Z-score of the leader's raw return over zLen bars. */
  zScore: number | null;
  /** Predictive lead contribution (Pine k). */
  leadContrib: number;
  /** Predictive lead quality (Pine q). */
  leadQuality: number;
  /** Predictive contribution qualifies (|leadCorr|≥minLeadCorr AND adv≥minLeadAdv AND z not na). */
  valid: boolean;

  /** Synchronous confirmation contribution (Pine ck). */
  confirmContrib: number;
  /** Synchronous confirmation quality (Pine cq). */
  confirmQuality: number;
}

export interface LeadLagLeaderSlot {
  rank: 1 | 2 | 3;
  key: LeadLagAssetKey | null;
  summary: string;             // "SOX +30m +0.35 A+0.12 HIGH" | "NO VALID LEAD"
  edgeScore: number;
}

export interface LeadLagQuality {
  parityStatus: 'FORMULA_VALIDATED' | 'DATA_PARITY_PENDING' | 'FULL_PARITY';
  calculationStatus: 'COMPLETE' | 'PARTIAL' | 'INVALID_SETUP';
  /** % of assets that produced a non-null sync correlation. */
  coveragePercent: number;
  exactInputCount: number;
  alternativeInputCount: number;
  proxyInputCount: number;
  derivedInputCount: number;
  missingInputCount: number;
  staleInputCount: number;
  validCorrelationCount: number;
  qualifiedLeaderCount: number;
  providersUsed: string[];
  missingInputs: LeadLagAssetKey[];
  staleInputs: LeadLagAssetKey[];
}

export interface LeadLagResult {
  calculatedAt: string;
  targetSymbol: string;
  engineOK: boolean;
  inRTH: boolean;

  /** Predictive edge (-100..+100) or null when engine locked / no qualified leader. */
  predictive: number | null;
  predictiveRegime: LeadLagRegime | 'LOCKED';
  /** ta.ema(predictive, 9). null when predictiveHistory is not supplied. */
  predictiveSignal: number | null;

  confirmation: number | null;
  confirmationRegime: LeadLagRegime | 'LOCKED';

  /**
   * MASTER LINK contract (Pine §MASTER LINK):
   *   engineOK + qualified leader → clamped predictive (-100..+100).
   *   engineOK + no qualified leader → 0 (NEUTRAL fallback).
   *   engine not OK (wrong symbol/timeframe) → null.
   */
  masterLeadLag: number | null;
  /** True when engineOK but predictive resolved to na (no qualified leader). */
  neutralFallbackActive: boolean;

  bullAgree: number;
  bearAgree: number;

  assets: LeadLagAssetResult[];
  leaders: [LeadLagLeaderSlot, LeadLagLeaderSlot, LeadLagLeaderSlot];
  noValidLead: boolean;

  quality: LeadLagQuality;
}

/* ── Math helpers (faithful to Pine) ───────────────────────────────────────── */

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Pine ta.sma over length ending at `end` (inclusive). na if any value in window is na. */
export function sma(series: (number | null)[], length: number, end: number): number | null {
  const start = end - length + 1;
  if (start < 0) return null;
  let sum = 0;
  for (let i = start; i <= end; i++) {
    const v = series[i];
    if (v == null || !Number.isFinite(v)) return null;
    sum += v;
  }
  return sum / length;
}

/** Pine ta.stdev over length ending at `end`. Uses population n (Pine biased). */
export function stdev(series: (number | null)[], length: number, end: number): number | null {
  const m = sma(series, length, end);
  if (m == null) return null;
  const start = end - length + 1;
  let acc = 0;
  for (let i = start; i <= end; i++) {
    const v = series[i]!;
    const d = v - m;
    acc += d * d;
  }
  return Math.sqrt(acc / length);
}

/** Pine ta.correlation(source, target, length) — Pearson, na→na propagation. */
export function correlation(
  source: (number | null)[],
  target: (number | null)[],
  length: number,
  end: number,
): number | null {
  const start = end - length + 1;
  if (start < 0) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = start; i <= end; i++) {
    const x = source[i];
    const y = target[i];
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    sx += x; sy += y;
    sxx += x * x; syy += y * y; sxy += x * y;
  }
  const n = length;
  const num = n * sxy - sx * sy;
  const denomSq = (n * sxx - sx * sx) * (n * syy - sy * sy);
  if (denomSq <= 0) return null;
  return num / Math.sqrt(denomSq);
}

/** ta.ema(source, length). Skips leading nulls; seeds with first non-null value. */
export function ema(series: (number | null)[], length: number, end: number): number | null {
  const k = 2 / (length + 1);
  let seeded = false;
  let out = 0;
  for (let i = 0; i <= end; i++) {
    const v = series[i];
    if (v == null || !Number.isFinite(v)) continue;
    if (!seeded) { out = v; seeded = true; continue; }
    out = v * k + out * (1 - k);
  }
  return seeded ? out : null;
}

/** Correlation of `source[bar-k]` against `target[bar]` — Pine `ta.correlation(x[k], y, len)`. */
export function correlationAtLag(
  source: (number | null)[],
  target: (number | null)[],
  length: number,
  lag: number,
  end: number,
): number | null {
  const start = end - length + 1;
  if (start - lag < 0) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = start; i <= end; i++) {
    const x = source[i - lag];
    const y = target[i];
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    sx += x; sy += y;
    sxx += x * x; syy += y * y; sxy += x * y;
  }
  const n = length;
  const num = n * sxy - sx * sy;
  const denomSq = (n * sxx - sx * sx) * (n * syy - sy * sy);
  if (denomSq <= 0) return null;
  return num / Math.sqrt(denomSq);
}

/* ── Ported Pine helpers ───────────────────────────────────────────────────── */

/** f_z — z-score of `x[end]` over the last `len` bars. na when any input na or stdev==0. */
export function computeZ(series: (number | null)[], length: number, end: number): number | null {
  const v = series[end];
  if (v == null || !Number.isFinite(v)) return null;
  const m = sma(series, length, end);
  if (m == null) return null;
  const s = stdev(series, length, end);
  if (s == null || s === 0) return null;
  return (v - m) / s;
}

/**
 * Pine f_pack — sync + best-lag correlation over [1,2,3,6,12] with matching
 * short/long correlations. Returns null-safe values; lag defaults to 1 when
 * every candidate is na (matches Pine seeding).
 */
export interface PackResult {
  sync: number | null;
  lead: number | null;
  lag: number;
  shortCorr: number | null;
  longCorr: number | null;
  shortSync: number | null;
  longSync: number | null;
}
export function computePack(
  x: (number | null)[],
  y: (number | null)[],
  mainLen: number,
  sLen: number,
  lLen: number,
  end: number,
  lagBars: readonly number[] = LEADLAG_CONFIG.lagBars,
): PackResult {
  const c0 = correlation(x, y, mainLen, end);
  const s0 = correlation(x, y, sLen, end);
  const l0 = correlation(x, y, lLen, end);

  // Pine seeds lead := c1, lag := 1 unconditionally, then walks the remainder.
  const firstLag = lagBars[0] ?? 1;
  let lead: number | null = correlationAtLag(x, y, mainLen, firstLag, end);
  let lag = firstLag;
  for (let i = 1; i < lagBars.length; i++) {
    const k = lagBars[i];
    const c = correlationAtLag(x, y, mainLen, k, end);
    // Pine branch: `not na(ck) and (na(lead) or math.abs(ck) > math.abs(lead))`.
    // Strict >, so first occurrence wins ties for magnitude.
    if (c != null && Number.isFinite(c)) {
      if (lead == null || Math.abs(c) > Math.abs(lead)) {
        lead = c;
        lag = k;
      }
    }
  }

  const sc = correlationAtLag(x, y, sLen, lag, end);
  const lc = correlationAtLag(x, y, lLen, lag, end);
  return { sync: c0, lead, lag, shortCorr: sc, longCorr: lc, shortSync: s0, longSync: l0 };
}

/**
 * f_relScore — 0..100 reliability score with three additive components:
 *   • magnitude (up to 50) — clamp(|corr|/0.75, 0, 1) * 50.
 *   • sign agreement (up to 25) — +12.5 per short/long window whose sign matches corr.
 *   • stability (up to 25) — based on |Δ|abs short vs long: ≤0.10 → 25, ≤0.20 → 15, else 5.
 * na(corr) → magnitude 0 (Pine `na(corr) ? 0.0 : …`).
 */
export function relScore(
  corr: number | null,
  sc: number | null,
  lc: number | null,
  divisor: number = LEADLAG_CONFIG.relMagDivisor,
): number {
  const mag = corr == null ? 0 : clamp(Math.abs(corr) / divisor, 0, 1) * 50;
  let signPts = 0;
  if (corr != null && sc != null && Math.sign(corr) === Math.sign(sc)) signPts += 12.5;
  if (corr != null && lc != null && Math.sign(corr) === Math.sign(lc)) signPts += 12.5;
  const diff = sc != null && lc != null ? Math.abs(Math.abs(sc) - Math.abs(lc)) : 1.0;
  const stablePts = diff <= 0.10 ? 25 : diff <= 0.20 ? 15 : 5;
  return clamp(mag + signPts + stablePts, 0, 100);
}

/** f_status — categorises correlation stability at the current bar. */
export function statusLabel(
  corr: number | null,
  sc: number | null,
  lc: number | null,
): LeadLagStatus {
  if (corr == null || Math.abs(corr) < 0.20) return 'WEAK';
  if (sc != null && lc != null && Math.sign(sc) !== Math.sign(lc)) return 'BREAKING';
  if (sc != null && lc != null && Math.abs(sc) > Math.abs(lc) + 0.10) return 'STRENGTHENING';
  if (sc != null && lc != null && Math.abs(sc) < Math.abs(lc) - 0.10) return 'WEAKENING';
  return 'STABLE';
}

/**
 * f_edgeLabel — cascaded escalation (each qualifying threshold overwrites `out`,
 * so the final label is the highest matching band).
 */
export function edgeLabel(
  adv: number,
  leadCorr: number | null,
  rel: number,
  minLeadAdv: number = LEADLAG_CONFIG.minLeadAdv,
  minLeadCorr: number = LEADLAG_CONFIG.minLeadCorr,
): LeadLagEdge {
  let out: LeadLagEdge = 'NO EDGE';
  if (leadCorr != null && Math.abs(leadCorr) >= minLeadCorr && adv >= minLeadAdv) {
    out = 'WEAK EDGE';
    if (adv >= 0.10 && rel >= 55) out = 'VALID';
    if (adv >= 0.20 && Math.abs(leadCorr) >= 0.40 && rel >= 70) out = 'STRONG';
  }
  return out;
}

/** f_edgeScore — quality-weighted magnitude, zero when the asset does not qualify. */
export function edgeScore(
  adv: number,
  leadCorr: number | null,
  rel: number,
  active: number,
  cfg: LeadLagConfig = LEADLAG_CONFIG,
): number {
  const advFactor = clamp((adv - cfg.minLeadAdv) / cfg.advFactorSpan, 0, 1);
  const valid = leadCorr != null && Math.abs(leadCorr) >= cfg.minLeadCorr && adv >= cfg.minLeadAdv;
  return valid ? 100 * Math.abs(leadCorr!) * (rel / 100) * advFactor * active : 0;
}

/** f_leadContrib — signed per-asset contribution to the predictive edge. */
export function leadContrib(
  z: number | null,
  leadCorr: number | null,
  rel: number,
  adv: number,
  active: number,
  cfg: LeadLagConfig = LEADLAG_CONFIG,
): number {
  const advFactor = clamp((adv - cfg.minLeadAdv) / cfg.advFactorSpan, 0, 1);
  const valid = z != null && leadCorr != null && Math.abs(leadCorr) >= cfg.minLeadCorr && adv >= cfg.minLeadAdv;
  return valid ? clamp(z! / 2, -1, 1) * leadCorr! * (rel / 100) * advFactor * active : 0;
}

/** f_leadQuality — normaliser for the predictive edge (always non-negative). */
export function leadQuality(
  leadCorr: number | null,
  rel: number,
  adv: number,
  active: number,
  cfg: LeadLagConfig = LEADLAG_CONFIG,
): number {
  const advFactor = clamp((adv - cfg.minLeadAdv) / cfg.advFactorSpan, 0, 1);
  const valid = leadCorr != null && Math.abs(leadCorr) >= cfg.minLeadCorr && adv >= cfg.minLeadAdv;
  return valid ? Math.abs(leadCorr!) * (rel / 100) * advFactor * active : 0;
}

/** f_confirmContrib — signed per-asset synchronous contribution. */
export function confirmContrib(
  z: number | null,
  syncCorr: number | null,
  relSync: number,
  active: number,
): number {
  if (z == null || syncCorr == null) return 0;
  return clamp(z / 2, -1, 1) * syncCorr * (relSync / 100) * active;
}

/** f_confirmQuality — normaliser for synchronous confirmation. */
export function confirmQuality(
  syncCorr: number | null,
  relSync: number,
  active: number,
): number {
  if (syncCorr == null) return 0;
  return Math.abs(syncCorr) * (relSync / 100) * active;
}

/** f_regime — regime bands for predictive / confirmation edges. */
export function regime(
  x: number | null,
  cfg: LeadLagConfig = LEADLAG_CONFIG,
): LeadLagRegime {
  if (x == null || !Number.isFinite(x)) return 'NEUTRAL';
  if (x >= cfg.strongBullThreshold) return 'STRONG BULL';
  if (x >= cfg.bullThreshold) return 'BULL';
  if (x <= cfg.strongBearThreshold) return 'STRONG BEAR';
  if (x <= cfg.bearThreshold) return 'BEAR';
  return 'NEUTRAL';
}

/* ── Display helpers (used by the leader summary — Pine parity) ───────────── */

function fmt2(x: number): string {
  const s = x.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function signedText(x: number | null): string {
  if (x == null || !Number.isFinite(x)) return 'n/a';
  return (x >= 0 ? '+' : '') + fmt2(x);
}

function leadText(lag: number): string { return `+${lag * 5}m`; }

function relLabel(r: number): string {
  return r >= 75 ? 'HIGH' : r >= 50 ? 'MED' : 'LOW';
}

/* ── Main engine ──────────────────────────────────────────────────────────── */

/**
 * Compute a single-bar Lead/Lag result at `input.bar` (defaults to the last
 * bar of the target series). Pure and deterministic. Never modifies inputs.
 *
 * FROZEN — do NOT rewrite thresholds, weights, or branch order.
 */
export function computeLeadLag(
  input: LeadLagInput,
  cfg: LeadLagConfig = LEADLAG_CONFIG,
  calculatedAt?: string,
): LeadLagResult {
  const stamp = calculatedAt ?? new Date().toISOString();
  const assets = input.assets;
  const end = pickBar(input);

  const rows: LeadLagAssetResult[] = assets.map((a) => buildAssetResult(a, end, cfg));

  // Predictive edge (Pine: engineOK and leadDen > 0 ? clamp(100*num/den, -100, 100) : na).
  const leadNum = rows.reduce((s, r) => s + r.leadContrib, 0);
  const leadDen = rows.reduce((s, r) => s + r.leadQuality, 0);
  const predictive = input.engineOK && leadDen > 0
    ? clamp(100 * leadNum / leadDen, -100, 100)
    : null;

  const confNum = rows.reduce((s, r) => s + r.confirmContrib, 0);
  const confDen = rows.reduce((s, r) => s + r.confirmQuality, 0);
  const confirmation = input.engineOK && confDen > 0
    ? clamp(100 * confNum / confDen, -100, 100)
    : null;

  const predictiveSignal = input.predictiveHistory && input.predictiveHistory.length > 0
    ? ema(input.predictiveHistory, cfg.emaSignalLen, input.predictiveHistory.length - 1)
    : null;

  // Directional agreement — count valid contributions only (Pine reads array `ks`).
  let bullAgree = 0, bearAgree = 0;
  for (const r of rows) {
    if (r.leadContrib > cfg.agreeEpsilon) bullAgree++;
    else if (r.leadContrib < -cfg.agreeEpsilon) bearAgree++;
  }

  const leaders = rankLeaders(rows);
  const noValidLead = leaders.every((s) => s.key == null);

  // MASTER LINK contract — Pine `masterLeadLag = engineOK ? nz(predictive, 0.0) : na`.
  const masterLeadLag = input.engineOK ? (predictive ?? 0) : null;
  const neutralFallbackActive = input.engineOK && predictive == null;

  const quality = buildQuality(input, rows, leaders, cfg);

  return {
    calculatedAt: stamp,
    targetSymbol: input.targetSymbol,
    engineOK: input.engineOK,
    inRTH: input.inRTH,

    predictive,
    predictiveRegime: input.engineOK ? regime(predictive, cfg) : 'LOCKED',
    predictiveSignal,

    confirmation,
    confirmationRegime: input.engineOK ? regime(confirmation, cfg) : 'LOCKED',

    masterLeadLag,
    neutralFallbackActive,

    bullAgree,
    bearAgree,

    assets: rows,
    leaders,
    noValidLead,

    quality,
  };
}

function pickBar(input: LeadLagInput): number {
  if (input.bar != null) return input.bar;
  // Default: last bar of the FIRST asset's target series (all series must align).
  const first = input.assets[0];
  if (!first) return 0;
  return first.y.length - 1;
}

function buildAssetResult(
  a: LeadLagAssetInput,
  end: number,
  cfg: LeadLagConfig,
): LeadLagAssetResult {
  const pack = computePack(a.x, a.y, cfg.corrLen, cfg.shortLen, cfg.longLen, end, cfg.lagBars);
  const rel = relScore(pack.lead, pack.shortCorr, pack.longCorr, cfg.relMagDivisor);
  const relSync = relScore(pack.sync, pack.shortSync, pack.longSync, cfg.relMagDivisor);

  // Pine `math.abs(lead) - math.abs(sync)` — if either is na, math.abs(na) = na
  // and the subtraction is na. We use Number.NaN as the sentinel.
  const adv = pack.lead == null || pack.sync == null
    ? Number.NaN
    : Math.abs(pack.lead) - Math.abs(pack.sync);

  const st = statusLabel(pack.lead, pack.shortCorr, pack.longCorr);
  const ed = edgeLabel(adv, pack.lead, rel, cfg.minLeadAdv, cfg.minLeadCorr);
  const es = Number.isFinite(adv) ? edgeScore(adv, pack.lead, rel, a.active, cfg) : 0;

  const zSeries = a.returnsForZ ?? a.x;
  const z = computeZ(zSeries, cfg.zLen, end);

  const k = Number.isFinite(adv) ? leadContrib(z, pack.lead, rel, adv, a.active, cfg) : 0;
  const q = Number.isFinite(adv) ? leadQuality(pack.lead, rel, adv, a.active, cfg) : 0;
  const ck = confirmContrib(z, pack.sync, relSync, a.active);
  const cq = confirmQuality(pack.sync, relSync, a.active);

  const valid = z != null
    && pack.lead != null
    && Math.abs(pack.lead) >= cfg.minLeadCorr
    && Number.isFinite(adv)
    && adv >= cfg.minLeadAdv;

  return {
    key: a.key,
    classification: a.classification ?? classifyDefault(a.key),
    provider: a.provider,
    stale: a.stale === true,
    active: a.active,

    sync: pack.sync,
    leadCorr: pack.lead,
    lag: pack.lag,
    shortCorr: pack.shortCorr,
    longCorr: pack.longCorr,
    shortSync: pack.shortSync,
    longSync: pack.longSync,

    rel,
    relSync,
    advantage: Number.isFinite(adv) ? adv : Number.NaN,
    status: st,
    edge: ed,
    edgeScore: es,

    zScore: z,
    leadContrib: k,
    leadQuality: q,
    valid,

    confirmContrib: ck,
    confirmQuality: cq,
  };
}

/**
 * Pine leader ranking: pick the three highest edgeScores (>0). Uses strict >,
 * so first-added wins ties (matches Pine's array iteration).
 */
function rankLeaders(
  rows: LeadLagAssetResult[],
): [LeadLagLeaderSlot, LeadLagLeaderSlot, LeadLagLeaderSlot] {
  let top1 = -1, top2 = -1, top3 = -1;
  let v1 = 0, v2 = 0, v3 = 0;
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i].edgeScore;
    if (v > v1) {
      v3 = v2; top3 = top2;
      v2 = v1; top2 = top1;
      v1 = v; top1 = i;
    } else if (v > v2) {
      v3 = v2; top3 = top2;
      v2 = v; top2 = i;
    } else if (v > v3) {
      v3 = v; top3 = i;
    }
  }
  return [
    slotFor(1, top1, rows),
    slotFor(2, top2, rows),
    slotFor(3, top3, rows),
  ];
}

function slotFor(rank: 1 | 2 | 3, idx: number, rows: LeadLagAssetResult[]): LeadLagLeaderSlot {
  if (idx < 0 || rows[idx].edgeScore <= 0) {
    return { rank, key: null, summary: 'NO VALID LEAD', edgeScore: 0 };
  }
  const r = rows[idx];
  const summary = `${r.key} ${leadText(r.lag)} ${signedText(r.leadCorr)} A${signedText(r.advantage)} ${relLabel(r.rel)}`;
  return { rank, key: r.key, summary, edgeScore: r.edgeScore };
}

function buildQuality(
  input: LeadLagInput,
  rows: LeadLagAssetResult[],
  leaders: LeadLagLeaderSlot[],
  cfg: LeadLagConfig,
): LeadLagQuality {
  const total = rows.length;
  const missing: LeadLagAssetKey[] = [];
  const stale: LeadLagAssetKey[] = [];
  let exactCount = 0, altCount = 0, proxyCount = 0, derivedCount = 0;
  let valid = 0;
  for (const r of rows) {
    if (r.sync == null && r.leadCorr == null) missing.push(r.key);
    if (r.stale) stale.push(r.key);
    if (r.sync != null || r.leadCorr != null) valid++;
    if (r.classification === 'EXACT') exactCount++;
    else if (r.classification === 'ALTERNATIVE') altCount++;
    else if (r.classification === 'PROXY') proxyCount++;
    else if (r.classification === 'DERIVED') derivedCount++;
  }
  const coveragePercent = total > 0 ? (valid / total) * 100 : 0;
  const qualifiedLeaderCount = leaders.filter((s) => s.key != null).length;
  const calculationStatus: LeadLagQuality['calculationStatus'] =
    !input.engineOK ? 'INVALID_SETUP'
    : missing.length === 0 ? 'COMPLETE'
    : 'PARTIAL';
  return {
    parityStatus: cfg.parityMode,
    calculationStatus,
    coveragePercent,
    exactInputCount: exactCount,
    alternativeInputCount: altCount,
    proxyInputCount: proxyCount,
    derivedInputCount: derivedCount,
    missingInputCount: missing.length,
    staleInputCount: stale.length,
    validCorrelationCount: valid,
    qualifiedLeaderCount,
    providersUsed: input.providersUsed ?? [],
    missingInputs: missing,
    staleInputs: stale,
  };
}

/**
 * Default source classification per the Pine's input.symbol defaults. The
 * classification only affects UI diagnostics and quality counts; it never
 * changes engine math. Callers may override on each asset.
 */
export function classifyDefault(key: LeadLagAssetKey): LeadLagSourceClass {
  switch (key) {
    case 'ES': case 'SOX': case 'QQQ': case 'NVDA': case 'VIX':
    case 'HYG': case 'COPPER':
      return 'EXACT';
    case 'DXY': case 'US10Y':          // TVC composite index / yield
      return 'PROXY';
    case 'BTC': case 'GOLD':           // BITSTAMP venue / OANDA CFD spot
      return 'ALTERNATIVE';
    default:
      return 'EXACT';
  }
}
