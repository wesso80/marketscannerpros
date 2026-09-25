/** Versioned research score boundary shared by routes and browser consumers. */
import { assessEvidenceQuality } from '@/lib/analysis/evidenceQuality';
import { computeCompositeV2, type CompositeV2Input, type ScoreFactor, type ScoreFreshness } from '@/lib/analysis/scannerScoreV2';

/**
 * v2.2 (Sep 2026): a blocked setup keeps its honest composite (no ×0.4 "gate multiplier"); the block is carried by
 * `permission` + machine-readable `blockReasons` instead. v2.1 multiplied gated rows by 0.4, which made the score and
 * the gate depend on each other and pushed ~85% of equities below any approval threshold.
 */
/*
 * v2.3 (Sep 2026): missing data is counted ONCE. A missing applicable factor is a neutral vote (the composite is diluted
 * by coverage) and is listed in `missingFactors`; it no longer also triggers a worst-case magnitude, an evidence
 * multiplier, a lower trust cap and a BLOCK. Rows whose factor coverage is below COVERAGE_MIN are WATCH with
 * INSUFFICIENT_DATA instead of BLOCK. Unusable data (no price, wrong interval, split-contaminated series) still blocks.
 */
/*
 * v2.4 (Sep 2026): explicit HARD BLOCKS (lib/scanner/hardBlocks.ts) — STALE_DATA by bar timestamp, PRICE_SANITY,
 * EARNINGS_IN_WINDOW, LIQUIDITY_MIN — plus informational `flags` (MACRO_EVENT, EARNINGS_UNKNOWN, …). Staleness is a
 * block, not a score discount: the STALE cap (60) and stale/delayed freshness multipliers are removed.
 */
export const SCANNER_SCORE_VERSION = 'msp.scanner.v2.4' as const;
/**
 * Minimum applicable-factor coverage (share of the asset's applicable factor weight actually observed) for a row to be
 * eligible for PASS. Below it the row is WATCH / INSUFFICIENT_DATA. 0.6 means the observed factors must carry at least
 * 60% of the weight: e.g. an equity row missing Relative Strength + Volume + Catalyst (~0.36 of weight in the neutral
 * regime) is still assessable, while one missing Trend + Momentum + Volume is not. Heuristic; recalibrate in Phase 2.
 */
export const COVERAGE_MIN = 0.6;
/** Fewer observed factor groups than this is INSUFFICIENT_DATA regardless of weight coverage. */
export const MIN_OBSERVED_FACTORS = 2;
/** Any composite produced by the v2.x contract (v2.1 cached rows included). */
export function isVersionedScannerScore(version: unknown): boolean {
  return typeof version === 'string' && version.startsWith('msp.scanner.v2.');
}
export type ScorePermission = 'PASS' | 'WATCH' | 'BLOCK';

/** Stable, machine-readable reason codes. UI copy lives in `message`; logic must only branch on `code`. */
export type ScoreReasonCode =
  | 'DATA_ELIGIBILITY'        // unusable data: no price, wrong bar interval, split-contaminated series
  | 'STALE_DATA'              // last completed bar is behind the market (bar timestamp, session-aware)
  | 'PRICE_SANITY'            // live price vs second feed disagree beyond max(15%, 6×ATR%)
  | 'EARNINGS_IN_WINDOW'      // earnings report inside the timeframe's holding window
  | 'LIQUIDITY_MIN'           // avg daily $ volume (equity) / 24h USD volume (crypto) below minimum
  | 'DATA_TRUST_UNEVALUATED'
  | 'REGIME_GATE'             // a (non-circular) regime component gate failed
  | 'REGIME_CHAOS'            // shock / chaos regime (ATR > 4% daily-equivalent or news shock)
  | 'REGIME_STRATEGY_CONFLICT'
  | 'LIQUIDITY'               // session closed / spread too wide
  | 'DATA_UNRELIABLE'         // institutional data-reliability check (stale / no feed)
  | 'INSUFFICIENT_DATA'       // WATCH: coverage < COVERAGE_MIN, < MIN_OBSERVED_FACTORS, or < 30 bars of history
  | 'DATA_TIMESTAMP_UNKNOWN'  // WATCH: bar time unknown, so staleness cannot be verified
  | 'DATA_TRUST_DEGRADED'     // WATCH: interval/provider/delay quality issue (not missing data)
  | 'DATA_DELAYED'            // WATCH
  // Flags (informational, never change permission):
  | 'MACRO_EVENT' | 'EARNINGS_UNKNOWN' | 'LIQUIDITY_UNKNOWN' | 'PRICE_CHECK_UNAVAILABLE' | 'PRICE_CHECK_SAME_PROVIDER';
/** Retired codes still found in cached v2.1/v2.2 payloads. Never emitted by v2.3. */
export type LegacyScoreReasonCode = 'INSUFFICIENT_FACTORS' | 'DATA_TRUST_INSUFFICIENT' | 'COVERAGE_INCOMPLETE' | 'DATA_TRUST_STALE' | 'DATA_FRESHNESS';
export interface ScoreReason { code: ScoreReasonCode; message: string }
export type ScoreTrust = 'GOOD' | 'DEGRADED' | 'STALE' | 'INSUFFICIENT_DATA';
/** Score ceilings by trust level. DEGRADED / INSUFFICIENT_DATA are NOT capped any more: the only trust problem they can
 *  carry into the score is missing inputs, which coverage already counted once; their permission impact is WATCH. */
export const SCORE_TRUST_CAP: Record<ScoreTrust, number> = { GOOD: 100, DEGRADED: 100, STALE: 100, INSUFFICIENT_DATA: 100 };

export function scoreFreshness(value?: string | null): ScoreFreshness {
  if (value === 'fresh' || value === 'live') return 'live';
  if (value === 'delayed' || value === 'stale' || value === 'missing') return value;
  return 'unknown';
}

export function dollarVolume(price: number | null | undefined, volume: number | null | undefined, asset: string): number | undefined {
  if (!Number.isFinite(volume) || volume! <= 0) return undefined;
  if (asset === 'crypto') return volume!; // Provider volume is already USD notional.
  if (asset === 'forex' || !Number.isFinite(price) || price! <= 0) return undefined;
  return price! * volume!;
}

export function buildScannerScore(input: Omit<CompositeV2Input, 'evidenceQuality'> & {
  trustLevel?: ScoreTrust;
  trustReasons?: string[];
  /** From `DataTrustResult.qualityIssues`. When supplied, DEGRADED trust caused only by missing inputs is a flag, not a
   *  WATCH (the missing factors already count as neutral). Omitted → legacy behaviour (DEGRADED → WATCH). */
  trustQualityIssues?: string[];
  /** From `DataTrustResult.missingInputs` (e.g. EMA200, volume). Informational. */
  missingInputs?: string[];
  /** @deprecated boolean form of `gateBlocks`; kept for callers that only know "gated". */
  regimeGated?: boolean;
  /** Non-circular gate failures (regime component gates, institutional hard blocks). Never derived from this score. */
  gateBlocks?: ScoreReason[];
  criticalBlockers?: string[];
  catalyst?: { earningsInDays: number | null; imminent: boolean };
  /** From `evaluateHardBlocks().blocks`. */
  hardBlocks?: ScoreReason[];
  /** From `evaluateHardBlocks().flags`. Informational only. */
  flags?: ScoreReason[];
}) {
  const applicable = input.factors.filter(f => f.applicable !== false);
  const available = applicable.filter(f => f.available && Number.isFinite(f.signed));
  const freshness = input.freshness ?? 'unknown';
  const evidence = assessEvidenceQuality({availableFactors: available.length, totalFactors: applicable.length, freshness});
  const result = computeCompositeV2({...input, freshness, evidenceQuality: evidence.level});
  const blockReasons: ScoreReason[] = (input.criticalBlockers ?? []).map(message => ({code: 'DATA_ELIGIBILITY' as const, message}));
  if (input.hardBlocks?.length) blockReasons.push(...input.hardBlocks);
  // One STALE_DATA reason whether staleness came from the bar time (hard blocks), trust, or freshness.
  if ((input.trustLevel === 'STALE' || freshness === 'stale') && !blockReasons.some(r => r.code === 'STALE_DATA')) {
    blockReasons.push({code: 'STALE_DATA', message: input.trustLevel === 'STALE' && input.trustReasons?.length ? input.trustReasons[0] : 'Underlying data is stale.'});
  }
  if (input.gateBlocks?.length) blockReasons.push(...input.gateBlocks);
  else if (input.regimeGated) blockReasons.push({code: 'REGIME_GATE', message: 'Setup is blocked by its regime gate.'});
  if (!input.trustLevel) blockReasons.push({code: 'DATA_TRUST_UNEVALUATED', message: 'Data trust has not been evaluated.'});

  // Missing data → neutral (already in the composite via coverage) + flag. Only a row that is mostly unobserved is
  // held back, and it is held at WATCH (INSUFFICIENT_DATA), never BLOCK.
  const missingFactors = result.contributions.filter(c => c.applicable && !c.available).map(c => c.factor as ScoreFactor);
  const watchReasons: ScoreReason[] = [];
  const insufficient: string[] = [];
  if (result.coverage < COVERAGE_MIN) insufficient.push(`factor coverage ${Math.round(result.coverage * 100)}% is below the ${Math.round(COVERAGE_MIN * 100)}% minimum`);
  if (available.length < MIN_OBSERVED_FACTORS) insufficient.push(`only ${available.length} factor group(s) observed`);
  // ATR scores nothing, but without it there is no stop/target geometry, so the row cannot be a PASS.
  if (input.missingInputs?.includes('ATR')) insufficient.push('ATR unavailable, so no risk geometry');
  if (input.trustLevel === 'INSUFFICIENT_DATA' && !(input.criticalBlockers?.length)) insufficient.push(...(input.trustReasons?.length ? input.trustReasons : ['data trust INSUFFICIENT_DATA']));
  if (insufficient.length) watchReasons.push({code: 'INSUFFICIENT_DATA', message: `Insufficient data: ${insufficient.join('; ')}.`});
  if (freshness === 'unknown' || freshness === 'missing') watchReasons.push({code: 'DATA_TIMESTAMP_UNKNOWN', message: 'Bar time unknown; staleness cannot be verified.'});
  const degradedByQuality = input.trustQualityIssues ? input.trustQualityIssues.some(q => q !== 'bar_time_unknown') : true;
  if (input.trustLevel === 'DEGRADED' && degradedByQuality) watchReasons.push({code: 'DATA_TRUST_DEGRADED', message: 'Data trust DEGRADED.'});
  if (freshness === 'delayed') watchReasons.push({code: 'DATA_DELAYED', message: 'Underlying data is delayed.'});
  const permission: ScorePermission = blockReasons.length ? 'BLOCK' : watchReasons.length ? 'WATCH' : 'PASS';
  const blockers = blockReasons.map(r => r.message);
  const trustCap = input.trustLevel ? SCORE_TRUST_CAP[input.trustLevel] : 40;
  // The composite is NOT multiplied down when gated (was ×0.4). Permission carries the block; the score stays a
  // like-for-like measure of evidence strength so blocked and unblocked rows remain comparable.
  const gateMultiplier = 1;
  const beforeCap = result.composite;
  return {
    version: SCANNER_SCORE_VERSION,
    composite: Math.round(Math.min(beforeCap, trustCap)),
    direction: result.direction,
    percentileRank: 50,
    regime: result.regime,
    liquidityMultiplier: input.liquidityMultiplier ?? 1,
    catalyst: input.catalyst,
    permission,
    blockers,
    blockReasons,
    watchReasons,
    flags: input.flags ?? [],
    freshness,
    evidenceQuality: evidence.level,
    coverage: result.coverage,
    coverageMin: COVERAGE_MIN,
    missingFactors,
    missingInputs: input.missingInputs ?? [],
    observedMagnitude: result.rawMagnitude,
    coverageAdjustedMagnitude: result.coverageAdjustedMagnitude,
    /** @deprecated alias of coverageAdjustedMagnitude */
    conservativeMagnitude: result.conservativeMagnitude,
    appliedMultiplier: result.appliedMultiplier,
    gateMultiplier,
    trustCap,
    factorContributions: result.contributions.map(c => ({...c})),
  };
}
export type ScannerScoreContract = ReturnType<typeof buildScannerScore>;
/** Older cached responses remain readable but never acquire a new-version claim. */
export type ScannerScorePayload = Partial<Omit<ScannerScoreContract, 'factorContributions'>> & {
  composite: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  percentileRank: number;
  regime: string;
  liquidityMultiplier: number;
  factorContributions: Array<{factor: string; weight: number; signed: number; contribution?: number; applicableWeight?: number; available?: boolean; applicable?: boolean}>;
};

/** Permission first, then final score, then stable identity. Always before slicing. */
export function compareScannerScores(a: {symbol: string; score?: number; compositeV2?: Pick<Partial<ScannerScoreContract>, 'permission' | 'composite'>}, b: {symbol: string; score?: number; compositeV2?: Pick<Partial<ScannerScoreContract>, 'permission' | 'composite'>}): number {
  const order = {PASS: 2, WATCH: 1, BLOCK: 0};
  const pa = order[a.compositeV2?.permission ?? 'BLOCK'];
  const pb = order[b.compositeV2?.permission ?? 'BLOCK'];
  return pb-pa || (b.compositeV2?.composite ?? b.score ?? 0)-(a.compositeV2?.composite ?? a.score ?? 0) || a.symbol.localeCompare(b.symbol);
}

/** A direction change must not retain the opposite side's preliminary model levels. */
export function synchronizeScannerScenario<T extends {direction?: string; price?: number; atr?: number; entry?: number; stop?: number; target?: number; rMultiple?: number; setup?: string}>(row: T, direction: 'bullish' | 'bearish' | 'neutral'): void {
  const changed = row.direction !== direction;
  row.direction = direction;
  if (direction === 'neutral' || !Number.isFinite(row.price) || row.price! <= 0 || !Number.isFinite(row.atr) || row.atr! <= 0) {
    row.entry = row.stop = row.target = row.rMultiple = undefined;
    row.setup = 'Neutral / insufficient directional evidence';
  } else if (changed) {
    const side = direction === 'bullish' ? 1 : -1;
    row.entry = row.price;
    row.stop = row.price! - side * row.atr! * 1.5;
    row.target = row.price! + side * row.atr! * 3;
    if (row.stop <= 0 || row.target <= 0) row.entry = row.stop = row.target = row.rMultiple = undefined;
    else row.rMultiple = 2;
    row.setup = `${direction === 'bullish' ? 'Bullish' : 'Bearish'} research setup`;
  }
}
