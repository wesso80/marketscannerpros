import type { GlobalM2Dto } from '@/app/api/intelligence/global-m2/route';
/** An allowlist, not a spread: current measurements and trust information only. */
export function publicM2Summary(d: GlobalM2Dto) {
  return {
    contract: 'public-m2-summary-v1' as const,
    enabled: d.enabled, calculatedAt: d.calculatedAt, parityStatus: d.parityStatus,
    totalUsd: d.totalUsd, validBlocCount: d.validBlocCount, missingBlocCount: d.missingBlocCount,
    estimatedWeightedCoveragePercent: d.estimatedWeightedCoveragePercent,
    coveragePercent: d.coveragePercent, weightedCoverageThreshold: d.weightedCoverageThreshold,
    interpretationEligible: d.interpretationEligible, calculationStatus: d.calculationStatus,
    oneMonthPct: d.oneMonthPct, yoyPct: d.yoyPct,
    blocs: d.blocs.map(b => ({id:b.id,name:b.name,classification:b.classification,provider:b.provider,
      usdM2:b.usdM2,sharePct:b.sharePct,r1:b.r1,r12:b.r12,observationMonth:b.observationMonth,
      stale:b.stale,health:b.health})),
    // Provider error strings may contain request URLs or secrets. Keep safe missing-data notes.
    missing: d.missing.map(m => ({id:m.id,reason:'Observation unavailable from this source.',health:m.health})),
    excludedBlocs: d.excludedBlocs.map(b => ({id:b.id,name:b.name,reason:b.reason})),
  };
}
export type PublicM2Summary = ReturnType<typeof publicM2Summary>;
