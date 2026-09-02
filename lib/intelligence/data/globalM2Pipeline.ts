// Global M2 Wave-1 live pipeline: providers → USD normalization → engine.
// Provider adapters carry NO scoring logic; computeGlobalM2 stays pure. The pure
// engine reports FORMULA_VALIDATED; because this path is fed LIVE provider data,
// the pipeline downgrades the result's parityStatus to DATA_PARITY_PENDING.

import { computeGlobalM2, GLOBAL_M2_CONFIG, type GlobalM2Result } from '../engines/globalM2';
import {
  normalizeM2BlocFull, UNIT_TRANSFORMS, type NormalizedM2Bloc, type DailyFxPoint,
} from './globalM2Normalize';
import { fetchUsM2 } from './providers/fredM2';
import { fetchChinaM2 } from './providers/pbocM2';
import { fetchSwissM2 } from './providers/snbM2';
import { fetchUsdFxDaily } from './providers/alphaVantageFx';
import type { ProviderM2Raw, ProviderFxRaw } from './providers/globalM2ProviderTypes';

export interface ProviderStalePolicy { maxAgeMonths: number }
// Publication lag is normal; a monthly aggregate is NOT stale just because the
// current calendar month is unpublished. Configurable per provider.
export const WAVE1_STALE_POLICY: Record<string, ProviderStalePolicy> = {
  US: { maxAgeMonths: 3 }, CN: { maxAgeMonths: 3 }, CH: { maxAgeMonths: 4 },
};

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

function assessStale(id: string, latest: string | null): { stale: boolean; staleReason: string | null } {
  if (!latest) return { stale: true, staleReason: 'no-observations' };
  const policy = WAVE1_STALE_POLICY[id];
  const age = monthsBetween(latest, currentMonth());
  if (policy && age > policy.maxAgeMonths) return { stale: true, staleReason: `latest ${latest} is ${age} months old (> ${policy.maxAgeMonths})` };
  return { stale: false, staleReason: null };
}

export interface Wave1Deps {
  us?: () => Promise<ProviderM2Raw>;
  china?: () => Promise<ProviderM2Raw>;
  swiss?: () => Promise<ProviderM2Raw>;
  usdcny?: () => Promise<ProviderFxRaw>;
  usdchf?: () => Promise<ProviderFxRaw>;
}

export interface Wave1Bundle {
  result: GlobalM2Result;
  blocs: NormalizedM2Bloc[];              // normalized (present) blocs, full provenance
  providerStatus: { id: string; ok: boolean; latestObservationMonth: string | null; stale: boolean; staleReason: string | null; error?: string }[];
  missingBlocIds: string[];
  eligibility: GlobalM2Eligibility;
  calculatedAt: string;
}

export interface GlobalM2Eligibility {
  /** Estimated weighted coverage must clear this to be production-interpretable. */
  weightedCoverageThreshold: number;
  interpretationEligible: boolean;
  headlineEligible: boolean;
  /** COMPLETE only when interpretation-eligible; otherwise PARTIAL. */
  calculationStatus: 'COMPLETE' | 'PARTIAL';
}

// Below this estimated weighted coverage, the headline Global M2 regime/cycle is
// NOT production-interpretable (the engine still returns its math for diagnostics).
export const INTERPRETATION_MIN_WEIGHTED_COVERAGE = 95;

export interface Wave1Options {
  interpretationThreshold?: number;
}

const ALL_IDS = ['US', 'CN', 'EU', 'JP', 'GB', 'CA', 'AU', 'IN', 'CH', 'KR', 'BR'];

/** Build the Wave-1 (US + China + Switzerland) live partial Global M2 bundle. */
export async function buildWave1Bundle(deps: Wave1Deps = {}, options: Wave1Options = {}): Promise<Wave1Bundle> {
  const calculatedAt = new Date().toISOString();
  const [us, china, swiss, usdcny, usdchf] = await Promise.all([
    (deps.us ?? fetchUsM2)(),
    (deps.china ?? fetchChinaM2)(),
    (deps.swiss ?? fetchSwissM2)(),
    (deps.usdcny ?? (() => fetchUsdFxDaily('CNY')))(),
    (deps.usdchf ?? (() => fetchUsdFxDaily('CHF')))(),
  ]);

  const blocs: NormalizedM2Bloc[] = [];
  const providerStatus: Wave1Bundle['providerStatus'] = [];

  // US — USD, no FX.
  if (us.ok) {
    const s = assessStale('US', us.latestObservationMonth);
    blocs.push(normalizeM2BlocFull({
      id: 'US', name: 'United States', nativeCurrency: 'USD', nativeUnit: us.nativeUnit,
      classification: 'EXACT', provider: us.provider, sourceSeries: us.sourceSeries, sourceUrl: us.sourceUrl,
      retrievedAt: us.retrievedAt, nativeUnitScale: 1e9, fxDirection: 'none', fxPair: null,
      m2: us.m2, stale: s.stale, staleReason: s.staleReason,
    }));
    providerStatus.push({ id: 'US', ok: true, latestObservationMonth: us.latestObservationMonth, ...s });
  } else providerStatus.push({ id: 'US', ok: false, latestObservationMonth: null, stale: true, staleReason: 'provider-failed', error: us.error });

  // China — CNY ÷ USDCNY.
  if (china.ok && usdcny.ok) {
    const s = assessStale('CN', china.latestObservationMonth);
    blocs.push(normalizeM2BlocFull({
      id: 'CN', name: 'China', nativeCurrency: 'CNY', nativeUnit: china.nativeUnit,
      classification: 'EXACT', provider: china.provider, sourceSeries: china.sourceSeries, sourceUrl: china.sourceUrl,
      definitionBreakpoints: ['2011-10 caliber', '2018-01 MMF adjustment', '2025-01 M1 revision (M2 unaffected)'],
      retrievedAt: china.retrievedAt, nativeUnitScale: UNIT_TRANSFORMS.pbocYiYuanToCny(1), // 1e8
      fxDirection: 'divide', fxPair: 'USDCNY', dailyFx: usdcny.daily as DailyFxPoint[],
      m2: china.m2, stale: s.stale, staleReason: s.staleReason,
    }));
    providerStatus.push({ id: 'CN', ok: true, latestObservationMonth: china.latestObservationMonth, ...s });
  } else {
    providerStatus.push({ id: 'CN', ok: false, latestObservationMonth: china.latestObservationMonth, stale: true, staleReason: china.ok ? 'USDCNY-fx-failed' : 'PBOC-failed', error: china.error ?? usdcny.error });
  }

  // Switzerland — CHF ÷ USDCHF.
  if (swiss.ok && usdchf.ok) {
    const s = assessStale('CH', swiss.latestObservationMonth);
    blocs.push(normalizeM2BlocFull({
      id: 'CH', name: 'Switzerland', nativeCurrency: 'CHF', nativeUnit: swiss.nativeUnit,
      classification: 'EXACT', provider: swiss.provider, sourceSeries: swiss.sourceSeries, sourceUrl: swiss.sourceUrl,
      retrievedAt: swiss.retrievedAt, nativeUnitScale: UNIT_TRANSFORMS.snbChfMillionsToChf(1), // 1e6
      fxDirection: 'divide', fxPair: 'USDCHF', dailyFx: usdchf.daily as DailyFxPoint[],
      m2: swiss.m2, stale: s.stale, staleReason: s.staleReason,
    }));
    providerStatus.push({ id: 'CH', ok: true, latestObservationMonth: swiss.latestObservationMonth, ...s });
  } else {
    providerStatus.push({ id: 'CH', ok: false, latestObservationMonth: swiss.latestObservationMonth, stale: true, staleReason: swiss.ok ? 'USDCHF-fx-failed' : 'SNB-failed', error: swiss.error ?? usdchf.error });
  }

  const result = computeGlobalM2({ blocs }, GLOBAL_M2_CONFIG, calculatedAt);
  // Live data → parity is pending until TradingView cross-checks exist.
  result.quality.parityStatus = 'DATA_PARITY_PENDING';

  // Interpretation eligibility is based on data-quality coverage, not merely
  // whether the engine produced a number. Below threshold, the headline cycle is
  // diagnostic-only (the UI must not present a partial-bloc cycle as the regime).
  const threshold = options.interpretationThreshold ?? INTERPRETATION_MIN_WEIGHTED_COVERAGE;
  const interpretationEligible = result.quality.estimatedWeightedCoveragePercent >= threshold;
  const eligibility: GlobalM2Eligibility = {
    weightedCoverageThreshold: threshold,
    interpretationEligible,
    headlineEligible: interpretationEligible,
    calculationStatus: interpretationEligible ? 'COMPLETE' : 'PARTIAL',
  };

  const presentIds = new Set(blocs.map((b) => b.id));
  const missingBlocIds = ALL_IDS.filter((id) => !presentIds.has(id));
  return { result, blocs, providerStatus, missingBlocIds, eligibility, calculatedAt };
}
