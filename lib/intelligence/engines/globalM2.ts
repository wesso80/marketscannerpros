// Global M2 core engine — pure port of the M2 mathematics from
// Global_M2_Cross_Asset_Liquidity_Engine_v2.4.2_INTRADAY_SAFE.pine.
//
// PURE: no HTTP, no DB, no env, no UI. Deterministic. FX conversion is NOT done
// here — the engine consumes already-USD-converted monthly series so that growth
// rates are computed on USD-converted M2 (Pine uses currency=currency.USD before
// ta.roc), which bakes FX movement into the impulse.
//
// Scope: ONLY the 11-bloc Global M2 core (total, 1M/3M/YoY, 3M-annualised,
// acceleration, acceleration-state, liquidity-cycle, turn-state, per-bloc
// breakdown, data quality). CB balance sheets, cross-asset, correlations,
// forward bias, risk/liquidity gap, rotation, Master Link are intentionally
// NOT ported here.

export type M2Classification = 'EXACT' | 'ALTERNATIVE' | 'PROXY';
export type M2ParityStatus = 'FORMULA_VALIDATED' | 'DATA_PARITY_PENDING' | 'FULL_PARITY';

/** One already-normalized monthly observation for a bloc. */
export interface GlobalM2Observation {
  month: string;            // YYYY-MM
  nativeM2: number;         // local-currency M2 (provenance)
  fxRate: number | null;    // local→USD rate used (provenance; null for USD blocs)
  usdM2: number;            // USD-converted M2 (what the engine computes on)
  sourceObservedAt?: string;
}

/** A bloc's full input: ascending valid monthly series + provenance. */
export interface GlobalM2BlocInput {
  id: string;
  name: string;
  nativeCurrency: string;
  classification: M2Classification;
  observations: GlobalM2Observation[]; // ascending by month; VALID months only
  provider: string;
  sourceSeries: string;
  sourceUrl?: string;
  definitionBreakpoints?: string[];
  stale?: boolean;
}

export interface GlobalM2Input {
  blocs: GlobalM2BlocInput[];
}

export interface GlobalM2Config {
  /** Pine m2LagMonths (default 1 = previous confirmed monthly observation). */
  lagMonths: number;
  /**
   * Approximate USD-M2 shares per bloc id, used ONLY for weighted-coverage
   * accounting (so a missing China visibly collapses weighted coverage).
   * Normalised internally to sum to 100 across the full 11-bloc universe.
   * Never used in the actual M2 calculation.
   */
  nominalWeights: Record<string, number>;
}

/** The locked 11-bloc universe (US, CN, EU, JP, GB, CA, AU, IN, CH, KR, BR). */
export const GLOBAL_M2_BLOCS: { id: string; name: string; nativeCurrency: string }[] = [
  { id: 'US', name: 'United States', nativeCurrency: 'USD' },
  { id: 'CN', name: 'China', nativeCurrency: 'CNY' },
  { id: 'EU', name: 'Euro Area', nativeCurrency: 'EUR' },
  { id: 'JP', name: 'Japan', nativeCurrency: 'JPY' },
  { id: 'GB', name: 'United Kingdom', nativeCurrency: 'GBP' },
  { id: 'CA', name: 'Canada', nativeCurrency: 'CAD' },
  { id: 'AU', name: 'Australia', nativeCurrency: 'AUD' },
  { id: 'IN', name: 'India', nativeCurrency: 'INR' },
  { id: 'CH', name: 'Switzerland', nativeCurrency: 'CHF' },
  { id: 'KR', name: 'South Korea', nativeCurrency: 'KRW' },
  { id: 'BR', name: 'Brazil', nativeCurrency: 'BRL' },
];

// Approximate USD M2 shares (coverage accounting only; see Phase 3A.1).
export const GLOBAL_M2_CONFIG: GlobalM2Config = {
  lagMonths: 1,
  nominalWeights: {
    US: 19, CN: 37, EU: 15, JP: 7.5, GB: 3.3, CA: 1.5, AU: 1.6, IN: 2.6, CH: 1.1, KR: 2.6, BR: 0.9,
  },
};

export interface GlobalM2BlocResult {
  id: string;
  name: string;
  usdM2: number;
  shareOfGlobal: number;
  r1: number | null;
  r3: number | null;
  r12: number | null;
  observationMonth: string;
  classification: M2Classification;
  provider: string;
  stale: boolean;
}

export interface GlobalM2Quality {
  coveragePercent: number;
  /**
   * ACTUAL USD share (of the observed total) of the present blocs, by
   * classification. Exact/measured — null when nothing is present.
   */
  observedWeightedShare: { exact: number; alternative: number; proxy: number } | null;
  /**
   * ESTIMATED weighted coverage using reference/nominal country weights (a
   * missing bloc has no live USD balance, so its true current weight cannot be
   * measured). Approximate — never treat as measured current coverage.
   */
  estimatedWeightedCoveragePercent: number;
  weightedCoverageBasis: 'REFERENCE_WEIGHTS' | 'LIVE_COMPLETE_SNAPSHOT' | 'UNAVAILABLE';
  weightedCoverageEstimated: boolean;
  /** @deprecated alias of estimatedWeightedCoveragePercent (kept for consumers). */
  weightedCoveragePercent: number;
  exactBlocCount: number;
  alternativeBlocCount: number;
  proxyBlocCount: number;
  missingBlocCount: number;
  // Reference-weight (estimated) classification shares — quality metadata only.
  exactWeightedShare: number;
  alternativeWeightedShare: number;
  proxyWeightedShare: number;
  missingWeightedShare: number;
  staleBlocCount: number;
  blocMonths: Record<string, string>;
  newestObservationMonth: string | null;
  oldestObservationMonth: string | null;
  parityStatus: M2ParityStatus;
}

export interface GlobalM2Result {
  totalUsd: number;
  oneMonthPct: number | null;
  threeMonthPct: number | null;
  threeMonthAnnualizedPct: number | null;
  yoyPct: number | null;
  accel1M: number | null;
  accel3M: number | null;
  accel3MPrevious: number | null;
  accelerationState: string;
  liquidityCycle: string;
  turnState: string;
  validBlocCount: number;
  blocs: GlobalM2BlocResult[];
  quality: GlobalM2Quality;
  calculatedAt: string;
}

/** Pine 100*(a/b - 1) with NA (null) guards; b must be non-zero. */
function pct(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0) return null;
  return 100 * (a / b - 1);
}

interface BlocAccum {
  input: GlobalM2BlocInput;
  mNow: number;                 // L0 = lagged current USD M2
  observationMonth: string;
  r1: number | null;
  r1Prev: number | null;
  r3: number | null;
  r3Prev: number | null;
  r3PrevPrev: number | null;
  r12: number | null;
  L1: number | null;
  L2: number | null;
}

/**
 * Compute the Global M2 core. Deterministic; consumes USD-converted monthly
 * series. Reproduces the Pine accumulation exactly, including valid-bloc
 * reweighting (missing blocs are excluded from both numerator and denominator).
 */
export function computeGlobalM2(
  input: GlobalM2Input,
  config: GlobalM2Config = GLOBAL_M2_CONFIG,
  calculatedAt: string = new Date().toISOString(),
): GlobalM2Result {
  const lag = config.lagMonths;

  // ── Per-bloc packs (Pine f_m2PackUSD, reconstructed directly from levels) ──
  // LAG SEMANTICS: lag=1 = the previous VALID monthly source observation/bar
  // (Pine close[1]) — indexing operates on the normalized valid-observation
  // sequence, NOT calendar months. Gaps (a genuinely unpublished month) are
  // never filled with a synthetic observation here; the offsets simply walk the
  // real observations the provider supplied.
  const valid: BlocAccum[] = [];
  for (const bloc of input.blocs) {
    const obs = bloc.observations;
    const cur = obs.length - 1 - lag; // Pine close[lag]
    if (cur < 0) continue;            // no confirmed observation → excluded (NA)
    const at = (k: number): number | null => (cur - k >= 0 ? obs[cur - k].usdM2 : null);
    const L0 = obs[cur].usdM2;
    const L1 = at(1), L2 = at(2), L3 = at(3), L4 = at(4), L5 = at(5), L12 = at(12);
    if (L0 == null || !Number.isFinite(L0)) continue;
    valid.push({
      input: bloc,
      mNow: L0,
      observationMonth: obs[cur].month,
      r1: pct(L0, L1),
      r1Prev: pct(L1, L2),
      r3: pct(L0, L3),
      r3Prev: pct(L1, L4),
      r3PrevPrev: pct(L2, L5),
      r12: pct(L0, L12),
      L1, L2,
    });
  }

  // ── Pine accumulation ──────────────────────────────────────────────────────
  let globalM2USD = 0, validNowUSD = 0, validPrevUSD = 0, validPrevPrevUSD = 0;
  let num1M = 0, num1MPrev = 0, num3M = 0, num3MPrev = 0, num3MPrevPrev = 0, num12M = 0;

  for (const b of valid) {
    globalM2USD += b.mNow;
    validNowUSD += b.mNow;
    if (b.r1 != null) num1M += b.mNow * b.r1;
    if (b.r3 != null) num3M += b.mNow * b.r3;
    if (b.r12 != null) num12M += b.mNow * b.r12;
    if (b.L1 != null) {
      validPrevUSD += b.L1;
      if (b.r1Prev != null) num1MPrev += b.L1 * b.r1Prev;
      if (b.r3Prev != null) num3MPrev += b.L1 * b.r3Prev;
    }
    if (b.L2 != null) {
      validPrevPrevUSD += b.L2;
      if (b.r3PrevPrev != null) num3MPrevPrev += b.L2 * b.r3PrevPrev;
    }
  }

  const globalM2_1M = validNowUSD > 0 ? num1M / validNowUSD : null;
  const globalM2_1M_prev = validPrevUSD > 0 ? num1MPrev / validPrevUSD : null;
  const globalM2_3M = validNowUSD > 0 ? num3M / validNowUSD : null;
  const globalM2_3M_prev = validPrevUSD > 0 ? num3MPrev / validPrevUSD : null;
  const globalM2_3M_prevprev = validPrevPrevUSD > 0 ? num3MPrevPrev / validPrevPrevUSD : null;
  const globalM2_YoY = validNowUSD > 0 ? num12M / validNowUSD : null;

  const globalM2_3M_ann = globalM2_3M == null ? null : globalM2_3M * 4;
  const globalM2_3M_prev_ann = globalM2_3M_prev == null ? null : globalM2_3M_prev * 4;
  const globalM2_3M_prevprev_ann = globalM2_3M_prevprev == null ? null : globalM2_3M_prevprev * 4;

  const m2Accel1M = globalM2_1M != null && globalM2_1M_prev != null ? globalM2_1M - globalM2_1M_prev : null;
  const m2Accel3M = globalM2_3M_ann != null && globalM2_3M_prev_ann != null ? globalM2_3M_ann - globalM2_3M_prev_ann : null;
  const m2Accel3M_prev = globalM2_3M_prev_ann != null && globalM2_3M_prevprev_ann != null ? globalM2_3M_prev_ann - globalM2_3M_prevprev_ann : null;

  // ── Acceleration state (exact Pine thresholds) ─────────────────────────────
  let accelerationState = 'n/a';
  if (globalM2_3M_ann != null && m2Accel3M != null) {
    if (globalM2_3M_ann >= 0 && m2Accel3M >= 0) accelerationState = 'ACCELERATING';
    else if (globalM2_3M_ann >= 0 && m2Accel3M < 0) accelerationState = 'SLOWING';
    else if (globalM2_3M_ann < 0 && m2Accel3M >= 0) accelerationState = 'BOTTOMING';
    else accelerationState = 'WORSENING';
  }

  // ── Liquidity cycle (exact Pine branch order) ──────────────────────────────
  let liquidityCycle = 'n/a';
  if (globalM2_3M_ann != null && m2Accel3M != null) {
    if (globalM2_3M_ann >= 0) {
      if (globalM2_3M_prev_ann != null && globalM2_3M_prev_ann < 0) liquidityCycle = 'EARLY EXPANSION';
      else if (m2Accel3M > 0) liquidityCycle = 'ACCELERATION';
      else if (globalM2_1M != null && globalM2_1M >= 0) liquidityCycle = 'LATE EXPANSION';
      else liquidityCycle = 'DECELERATION';
    } else {
      liquidityCycle = m2Accel3M > 0 ? 'BOTTOMING' : 'CONTRACTION';
    }
  }

  // ── Turn state (exact Pine) ────────────────────────────────────────────────
  let turnState = 'n/a';
  if (m2Accel3M != null && m2Accel3M_prev != null) {
    if (m2Accel3M > 0 && m2Accel3M_prev <= 0) turnState = 'UPSIDE TURN';
    else if (m2Accel3M < 0 && m2Accel3M_prev >= 0) turnState = 'DOWNSIDE TURN';
    else if (m2Accel3M > 0) turnState = 'IMPROVING';
    else turnState = 'WEAKENING';
  }

  // ── Per-bloc breakdown ─────────────────────────────────────────────────────
  const blocs: GlobalM2BlocResult[] = valid.map((b) => ({
    id: b.input.id,
    name: b.input.name,
    usdM2: b.mNow,
    shareOfGlobal: globalM2USD > 0 ? (100 * b.mNow) / globalM2USD : 0,
    r1: b.r1,
    r3: b.r3,
    r12: b.r12,
    observationMonth: b.observationMonth,
    classification: b.input.classification,
    provider: b.input.provider,
    stale: b.input.stale ?? false,
  }));

  // ── Data quality (counts + nominal-weighted coverage) ──────────────────────
  const totalNominal = Object.values(config.nominalWeights).reduce((s, w) => s + w, 0) || 1;
  const nomShare = (id: string) => (100 * (config.nominalWeights[id] ?? 0)) / totalNominal;
  const validIds = new Set(valid.map((b) => b.input.id));

  const exactBlocCount = valid.filter((b) => b.input.classification === 'EXACT').length;
  const alternativeBlocCount = valid.filter((b) => b.input.classification === 'ALTERNATIVE').length;
  const proxyBlocCount = valid.filter((b) => b.input.classification === 'PROXY').length;
  const missingBlocCount = GLOBAL_M2_BLOCS.length - valid.length;

  const exactWeightedShare = valid.filter((b) => b.input.classification === 'EXACT').reduce((s, b) => s + nomShare(b.input.id), 0);
  const alternativeWeightedShare = valid.filter((b) => b.input.classification === 'ALTERNATIVE').reduce((s, b) => s + nomShare(b.input.id), 0);
  const proxyWeightedShare = valid.filter((b) => b.input.classification === 'PROXY').reduce((s, b) => s + nomShare(b.input.id), 0);
  const missingWeightedShare = GLOBAL_M2_BLOCS.filter((m) => !validIds.has(m.id)).reduce((s, m) => s + nomShare(m.id), 0);

  const months = valid.map((b) => b.observationMonth).sort();
  const blocMonths: Record<string, string> = {};
  for (const b of valid) blocMonths[b.input.id] = b.observationMonth;

  // Observed (measured) USD shares of the present blocs, by classification.
  const observedTotal = globalM2USD;
  const usdByClass = (c: M2Classification) => valid.filter((b) => b.input.classification === c).reduce((s, b) => s + b.mNow, 0);
  const observedWeightedShare = observedTotal > 0
    ? {
        exact: (100 * usdByClass('EXACT')) / observedTotal,
        alternative: (100 * usdByClass('ALTERNATIVE')) / observedTotal,
        proxy: (100 * usdByClass('PROXY')) / observedTotal,
      }
    : null;

  const hasReferenceWeights = Object.values(config.nominalWeights ?? {}).some((w) => w > 0);
  const coveragePct = (100 * valid.length) / GLOBAL_M2_BLOCS.length;
  const estimatedWeightedCoveragePercent = hasReferenceWeights
    ? exactWeightedShare + alternativeWeightedShare + proxyWeightedShare
    : coveragePct;
  const weightedCoverageBasis: GlobalM2Quality['weightedCoverageBasis'] =
    valid.length === GLOBAL_M2_BLOCS.length ? 'LIVE_COMPLETE_SNAPSHOT' : hasReferenceWeights ? 'REFERENCE_WEIGHTS' : 'UNAVAILABLE';

  const quality: GlobalM2Quality = {
    coveragePercent: coveragePct,
    observedWeightedShare,
    estimatedWeightedCoveragePercent,
    weightedCoverageBasis,
    weightedCoverageEstimated: weightedCoverageBasis === 'REFERENCE_WEIGHTS',
    weightedCoveragePercent: estimatedWeightedCoveragePercent,
    exactBlocCount,
    alternativeBlocCount,
    proxyBlocCount,
    missingBlocCount,
    exactWeightedShare,
    alternativeWeightedShare,
    proxyWeightedShare,
    missingWeightedShare,
    staleBlocCount: valid.filter((b) => b.input.stale === true).length,
    blocMonths,
    newestObservationMonth: months.length ? months[months.length - 1] : null,
    oldestObservationMonth: months.length ? months[0] : null,
    parityStatus: 'FORMULA_VALIDATED',
  };

  return {
    totalUsd: globalM2USD,
    oneMonthPct: globalM2_1M,
    threeMonthPct: globalM2_3M,
    threeMonthAnnualizedPct: globalM2_3M_ann,
    yoyPct: globalM2_YoY,
    accel1M: m2Accel1M,
    accel3M: m2Accel3M,
    accel3MPrevious: m2Accel3M_prev,
    accelerationState,
    liquidityCycle,
    turnState,
    validBlocCount: valid.length,
    blocs,
    quality,
    calculatedAt,
  };
}
