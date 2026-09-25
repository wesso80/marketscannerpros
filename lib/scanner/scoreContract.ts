/** Versioned research score boundary shared by routes and browser consumers. */
import { assessEvidenceQuality } from '@/lib/analysis/evidenceQuality';
import { computeCompositeV2, type CompositeV2Input, type ScoreFreshness } from '@/lib/analysis/scannerScoreV2';

/**
 * v2.2 (Sep 2026): a blocked setup keeps its honest composite (no ×0.4 "gate multiplier"); the block is carried by
 * `permission` + machine-readable `blockReasons` instead. v2.1 multiplied gated rows by 0.4, which made the score and
 * the gate depend on each other and pushed ~85% of equities below any approval threshold.
 */
export const SCANNER_SCORE_VERSION = 'msp.scanner.v2.2' as const;
/** Any composite produced by the v2.x contract (v2.1 cached rows included). */
export function isVersionedScannerScore(version: unknown): boolean {
  return typeof version === 'string' && version.startsWith('msp.scanner.v2.');
}
export type ScorePermission = 'PASS' | 'WATCH' | 'BLOCK';

/** Stable, machine-readable reason codes. UI copy lives in `message`; logic must only branch on `code`. */
export type ScoreReasonCode =
  | 'DATA_ELIGIBILITY'        // data-trust eligibility blocker (bad price, discontinuity, …)
  | 'INSUFFICIENT_FACTORS'    // fewer than 2 observed factor groups
  | 'DATA_TRUST_STALE'
  | 'DATA_TRUST_INSUFFICIENT'
  | 'DATA_TRUST_UNEVALUATED'
  | 'DATA_FRESHNESS'          // underlying freshness unknown / missing / stale
  | 'REGIME_GATE'             // a (non-circular) regime component gate failed
  | 'REGIME_CHAOS'            // shock / chaos regime (ATR > 4% daily-equivalent or news shock)
  | 'REGIME_STRATEGY_CONFLICT'
  | 'LIQUIDITY'               // session closed / spread too wide
  | 'DATA_UNRELIABLE'         // institutional data-reliability check (stale / no feed)
  | 'COVERAGE_INCOMPLETE'     // WATCH: at least one applicable factor missing
  | 'DATA_TRUST_DEGRADED'     // WATCH
  | 'DATA_DELAYED';           // WATCH
export interface ScoreReason { code: ScoreReasonCode; message: string }
export type ScoreTrust = 'GOOD' | 'DEGRADED' | 'STALE' | 'INSUFFICIENT_DATA';
export const SCORE_TRUST_CAP: Record<ScoreTrust, number> = { GOOD: 100, DEGRADED: 80, STALE: 60, INSUFFICIENT_DATA: 40 };

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
  /** @deprecated boolean form of `gateBlocks`; kept for callers that only know "gated". */
  regimeGated?: boolean;
  /** Non-circular gate failures (regime component gates, institutional hard blocks). Never derived from this score. */
  gateBlocks?: ScoreReason[];
  criticalBlockers?: string[];
  catalyst?: { earningsInDays: number | null; imminent: boolean };
}) {
  const applicable = input.factors.filter(f => f.applicable !== false);
  const available = applicable.filter(f => f.available && Number.isFinite(f.signed));
  const freshness = input.freshness ?? 'unknown';
  const evidence = assessEvidenceQuality({availableFactors: available.length, totalFactors: applicable.length, freshness});
  const result = computeCompositeV2({...input, freshness, evidenceQuality: evidence.level});
  const blockReasons: ScoreReason[] = (input.criticalBlockers ?? []).map(message => ({code: 'DATA_ELIGIBILITY' as const, message}));
  if (available.length < 2) blockReasons.push({code: 'INSUFFICIENT_FACTORS', message: 'Insufficient observed factor groups.'});
  if (input.trustLevel === 'INSUFFICIENT_DATA' || input.trustLevel === 'STALE') {
    const code = input.trustLevel === 'STALE' ? 'DATA_TRUST_STALE' as const : 'DATA_TRUST_INSUFFICIENT' as const;
    const messages = input.trustReasons?.length ? input.trustReasons : [`Data trust ${input.trustLevel}.`];
    blockReasons.push(...messages.map(message => ({code, message})));
  }
  if (['unknown','missing','stale'].includes(freshness)) blockReasons.push({code: 'DATA_FRESHNESS', message: `Underlying data freshness is ${freshness}.`});
  if (input.gateBlocks?.length) blockReasons.push(...input.gateBlocks);
  else if (input.regimeGated) blockReasons.push({code: 'REGIME_GATE', message: 'Setup is blocked by its regime gate.'});
  if (!input.trustLevel) blockReasons.push({code: 'DATA_TRUST_UNEVALUATED', message: 'Data trust has not been evaluated.'});
  const watchReasons: ScoreReason[] = [];
  if (result.coverage < 1) watchReasons.push({code: 'COVERAGE_INCOMPLETE', message: `Factor coverage ${Math.round(result.coverage * 100)}%.`});
  if (input.trustLevel === 'DEGRADED') watchReasons.push({code: 'DATA_TRUST_DEGRADED', message: 'Data trust DEGRADED.'});
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
    freshness,
    evidenceQuality: evidence.level,
    coverage: result.coverage,
    observedMagnitude: result.rawMagnitude,
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
