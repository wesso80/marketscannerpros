/** Versioned research score boundary shared by routes and browser consumers. */
import { assessEvidenceQuality } from '@/lib/analysis/evidenceQuality';
import { computeCompositeV2, type CompositeV2Input, type ScoreFreshness } from '@/lib/analysis/scannerScoreV2';

export const SCANNER_SCORE_VERSION = 'msp.scanner.v2.1' as const;
export type ScorePermission = 'PASS' | 'WATCH' | 'BLOCK';
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
  regimeGated?: boolean;
  criticalBlockers?: string[];
  catalyst?: { earningsInDays: number | null; imminent: boolean };
}) {
  const applicable = input.factors.filter(f => f.applicable !== false);
  const available = applicable.filter(f => f.available && Number.isFinite(f.signed));
  const freshness = input.freshness ?? 'unknown';
  const evidence = assessEvidenceQuality({availableFactors: available.length, totalFactors: applicable.length, freshness});
  const result = computeCompositeV2({...input, freshness, evidenceQuality: evidence.level});
  const blockers: string[] = [...(input.criticalBlockers ?? [])];
  if (available.length < 2) blockers.push('Insufficient observed factor groups.');
  if (input.trustLevel === 'INSUFFICIENT_DATA' || input.trustLevel === 'STALE') blockers.push(...(input.trustReasons?.length ? input.trustReasons : [`Data trust ${input.trustLevel}.`]));
  if (['unknown','missing','stale'].includes(freshness)) blockers.push(`Underlying data freshness is ${freshness}.`);
  if (input.regimeGated) blockers.push('Setup is blocked by its regime gate.');
  const permission: ScorePermission = blockers.length ? 'BLOCK' : result.coverage < 1 || input.trustLevel === 'DEGRADED' || freshness === 'delayed' ? 'WATCH' : 'PASS';
  const trustCap = input.trustLevel ? SCORE_TRUST_CAP[input.trustLevel] : 40;
  if (!input.trustLevel) blockers.push('Data trust has not been evaluated.');
  const gateMultiplier = input.regimeGated ? 0.4 : 1;
  const beforeCap = result.composite * gateMultiplier;
  return {
    version: SCANNER_SCORE_VERSION,
    composite: Math.round(Math.min(beforeCap, trustCap)),
    direction: result.direction,
    percentileRank: 50,
    regime: result.regime,
    liquidityMultiplier: input.liquidityMultiplier ?? 1,
    catalyst: input.catalyst,
    permission: !input.trustLevel ? 'BLOCK' as const : permission,
    blockers,
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
