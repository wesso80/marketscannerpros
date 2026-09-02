import { NextResponse } from 'next/server';
import { buildWave3Bundle } from '@/lib/intelligence/data/globalM2Pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Read-only Global M2 diagnostic. Live providers are gated behind
// INTELLIGENCE_LIVE_DATA (same switch as Fragility) so production stays quiet
// until keys are set. Result is cached in-process (M2 is monthly) to avoid
// hammering ~20 external endpoints per request. The engine stays frozen and the
// result is DATA_PARITY_PENDING; interpretation is ineligible below 95% coverage.

export interface GlobalM2BlocDto {
  id: string; name: string; classification: string; provider: string;
  usdM2: number; sharePct: number; r1: number | null; r3: number | null; r12: number | null;
  observationMonth: string; stale: boolean; health: string;
}
export interface GlobalM2Dto {
  enabled: boolean;
  calculatedAt: string;
  parityStatus: string;
  totalUsd: number;
  validBlocCount: number;
  missingBlocCount: number;
  estimatedWeightedCoveragePercent: number;
  coveragePercent: number;
  weightedCoverageThreshold: number;
  interpretationEligible: boolean;
  calculationStatus: string;
  oneMonthPct: number | null;
  threeMonthPct: number | null;
  threeMonthAnnualizedPct: number | null;
  yoyPct: number | null;
  accelerationState: string;
  liquidityCycle: string;
  turnState: string;
  blocs: GlobalM2BlocDto[];
  missing: { id: string; reason: string; health: string }[];
}

const TTL_MS = 6 * 60 * 60 * 1000; // 6h — M2 is a monthly aggregate.
let cache: { at: number; dto: GlobalM2Dto } | null = null;

async function computeDto(): Promise<GlobalM2Dto> {
  const b = await buildWave3Bundle();
  const q = b.result.quality;
  const healthById = new Map(b.providerStatus.map((p) => [p.id, p.health ?? (p.ok ? 'LIVE' : 'DATA_UNAVAILABLE')]));
  return {
    enabled: true,
    calculatedAt: b.calculatedAt,
    parityStatus: q.parityStatus,
    totalUsd: b.result.totalUsd,
    validBlocCount: b.result.validBlocCount,
    missingBlocCount: q.missingBlocCount,
    estimatedWeightedCoveragePercent: q.estimatedWeightedCoveragePercent,
    coveragePercent: q.coveragePercent,
    weightedCoverageThreshold: b.eligibility.weightedCoverageThreshold,
    interpretationEligible: b.eligibility.interpretationEligible,
    calculationStatus: b.eligibility.calculationStatus,
    oneMonthPct: b.result.oneMonthPct,
    threeMonthPct: b.result.threeMonthPct,
    threeMonthAnnualizedPct: b.result.threeMonthAnnualizedPct,
    yoyPct: b.result.yoyPct,
    accelerationState: b.result.accelerationState,
    liquidityCycle: b.result.liquidityCycle,
    turnState: b.result.turnState,
    blocs: b.result.blocs.map((bl) => ({
      id: bl.id, name: bl.name, classification: bl.classification, provider: bl.provider,
      usdM2: bl.usdM2, sharePct: bl.shareOfGlobal, r1: bl.r1, r3: bl.r3, r12: bl.r12,
      observationMonth: bl.observationMonth, stale: bl.stale, health: healthById.get(bl.id) ?? 'LIVE',
    })),
    missing: b.providerStatus
      .filter((p) => !p.ok)
      .map((p) => ({ id: p.id, reason: p.error ?? p.staleReason ?? 'unavailable', health: p.health ?? 'DATA_UNAVAILABLE' })),
  };
}

function disabledDto(): GlobalM2Dto {
  return {
    enabled: false, calculatedAt: new Date().toISOString(), parityStatus: 'DATA_PARITY_PENDING',
    totalUsd: 0, validBlocCount: 0, missingBlocCount: 11, estimatedWeightedCoveragePercent: 0,
    coveragePercent: 0, weightedCoverageThreshold: 95, interpretationEligible: false, calculationStatus: 'PARTIAL',
    oneMonthPct: null, threeMonthPct: null, threeMonthAnnualizedPct: null, yoyPct: null,
    accelerationState: 'n/a', liquidityCycle: 'n/a', turnState: 'n/a', blocs: [], missing: [],
  };
}

export async function GET() {
  if (process.env.INTELLIGENCE_LIVE_DATA !== 'true') {
    return NextResponse.json({ data: disabledDto(), source: 'disabled' });
  }
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ data: cache.dto, source: 'live-cached' });
  }
  try {
    const dto = await computeDto();
    cache = { at: Date.now(), dto };
    return NextResponse.json({ data: dto, source: 'live-partial' });
  } catch (e) {
    if (cache) return NextResponse.json({ data: cache.dto, source: 'live-stale' });
    return NextResponse.json({ data: disabledDto(), source: 'error', error: e instanceof Error ? e.message : String(e) }, { status: 200 });
  }
}
