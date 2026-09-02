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
import { fetchEuroM2 } from './providers/ecbM2';
import { fetchUkM2 } from './providers/boeM2';
import { fetchJapanM2 } from './providers/bojM2';
import { fetchCanadaM2 } from './providers/statcanM2';
import { fetchAustraliaM2 } from './providers/rbaM2';
import { fetchIndiaM2 } from './providers/rbiM2';
import { fetchKoreaM2 } from './providers/bokM2';
import { fetchBrazilM2 } from './providers/bcbM2';
import { fetchUsdFxDaily, fetchFxDailyPair } from './providers/alphaVantageFx';
import type { ProviderM2Raw, ProviderFxRaw } from './providers/globalM2ProviderTypes';

export interface ProviderStalePolicy { maxAgeMonths: number }
// Publication lag is normal; a monthly aggregate is NOT stale just because the
// current calendar month is unpublished. Configurable per provider.
export const WAVE1_STALE_POLICY: Record<string, ProviderStalePolicy> = {
  US: { maxAgeMonths: 3 }, CN: { maxAgeMonths: 3 }, CH: { maxAgeMonths: 4 },
};
// Wave-2 adds Euro Area, Japan, UK (same publication-lag tolerance).
export const WAVE2_STALE_POLICY: Record<string, ProviderStalePolicy> = {
  ...WAVE1_STALE_POLICY, EU: { maxAgeMonths: 3 }, JP: { maxAgeMonths: 3 }, GB: { maxAgeMonths: 3 },
};
// Wave-3 adds Canada, Australia, India, Korea, Brazil (StatCan/RBA lag longer).
export const WAVE3_STALE_POLICY: Record<string, ProviderStalePolicy> = {
  ...WAVE2_STALE_POLICY, CA: { maxAgeMonths: 4 }, AU: { maxAgeMonths: 4 }, IN: { maxAgeMonths: 4 }, KR: { maxAgeMonths: 4 }, BR: { maxAgeMonths: 4 },
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

function assessStaleWith(
  id: string, latest: string | null, policyMap: Record<string, ProviderStalePolicy>,
): { stale: boolean; staleReason: string | null } {
  if (!latest) return { stale: true, staleReason: 'no-observations' };
  const policy = policyMap[id];
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

/* ── Wave 2: add Euro Area (ECB), Japan (BOJ), United Kingdom (BOE) ─────────── */

export interface Wave2Deps {
  us?: () => Promise<ProviderM2Raw>;
  china?: () => Promise<ProviderM2Raw>;
  swiss?: () => Promise<ProviderM2Raw>;
  euro?: () => Promise<ProviderM2Raw>;
  uk?: () => Promise<ProviderM2Raw>;
  japan?: () => Promise<ProviderM2Raw>;
  usdcny?: () => Promise<ProviderFxRaw>;
  usdchf?: () => Promise<ProviderFxRaw>;
  eurusd?: () => Promise<ProviderFxRaw>;
  gbpusd?: () => Promise<ProviderFxRaw>;
  usdjpy?: () => Promise<ProviderFxRaw>;
}

interface BlocSpec {
  id: string;
  name: string;
  nativeCurrency: string;
  classification: NormalizedM2Bloc['classification'];
  raw: ProviderM2Raw;
  fx: ProviderFxRaw | null;         // null → USD bloc, no FX
  nativeUnitScale: number;
  fxDirection: 'multiply' | 'divide' | 'none';
  fxPair: string | null;
  fxFailReason: string;             // status reason when the FX pair failed
  definitionBreakpoints?: string[];
}

/**
 * Build the Wave-2 (US + China + Switzerland + Euro Area + UK + Japan) live
 * partial Global M2 bundle. Reuses the frozen engine; live results carry
 * DATA_PARITY_PENDING. Japan fails closed until a BOJ source is configured.
 */
export async function buildWave2Bundle(deps: Wave2Deps = {}, options: Wave1Options = {}): Promise<Wave1Bundle> {
  const calculatedAt = new Date().toISOString();
  const [us, china, swiss, euro, uk, japan, usdcny, usdchf, eurusd, gbpusd, usdjpy] = await Promise.all([
    (deps.us ?? fetchUsM2)(),
    (deps.china ?? fetchChinaM2)(),
    (deps.swiss ?? fetchSwissM2)(),
    (deps.euro ?? fetchEuroM2)(),
    (deps.uk ?? fetchUkM2)(),
    (deps.japan ?? fetchJapanM2)(),
    (deps.usdcny ?? (() => fetchUsdFxDaily('CNY')))(),
    (deps.usdchf ?? (() => fetchUsdFxDaily('CHF')))(),
    (deps.eurusd ?? (() => fetchFxDailyPair('EUR', 'USD')))(),
    (deps.gbpusd ?? (() => fetchFxDailyPair('GBP', 'USD')))(),
    (deps.usdjpy ?? (() => fetchUsdFxDaily('JPY')))(),
  ]);

  const specs: BlocSpec[] = [
    { id: 'US', name: 'United States', nativeCurrency: 'USD', classification: 'EXACT', raw: us, fx: null, nativeUnitScale: UNIT_TRANSFORMS.fredBillionsUsdToUsd(1), fxDirection: 'none', fxPair: null, fxFailReason: '' },
    { id: 'CN', name: 'China', nativeCurrency: 'CNY', classification: 'EXACT', raw: china, fx: usdcny, nativeUnitScale: UNIT_TRANSFORMS.pbocYiYuanToCny(1), fxDirection: 'divide', fxPair: 'USDCNY', fxFailReason: 'USDCNY-fx-failed', definitionBreakpoints: ['2011-10 caliber', '2018-01 MMF adjustment', '2025-01 M1 revision (M2 unaffected)'] },
    { id: 'CH', name: 'Switzerland', nativeCurrency: 'CHF', classification: 'EXACT', raw: swiss, fx: usdchf, nativeUnitScale: UNIT_TRANSFORMS.snbChfMillionsToChf(1), fxDirection: 'divide', fxPair: 'USDCHF', fxFailReason: 'USDCHF-fx-failed' },
    { id: 'EU', name: 'Euro Area', nativeCurrency: 'EUR', classification: 'ALTERNATIVE', raw: euro, fx: eurusd, nativeUnitScale: 1e6, fxDirection: 'multiply', fxPair: 'EURUSD', fxFailReason: 'EURUSD-fx-failed', definitionBreakpoints: ['ECB harmonised M2 (euro-area definition, not identical to US M2)'] },
    { id: 'GB', name: 'United Kingdom', nativeCurrency: 'GBP', classification: 'ALTERNATIVE', raw: uk, fx: gbpusd, nativeUnitScale: 1e6, fxDirection: 'multiply', fxPair: 'GBPUSD', fxFailReason: 'GBPUSD-fx-failed', definitionBreakpoints: ['BOE M2 = UK estimate of EMU aggregate; all-currency, liabilities to private & public sectors, NSA'] },
    { id: 'JP', name: 'Japan', nativeCurrency: 'JPY', classification: 'ALTERNATIVE', raw: japan, fx: usdjpy, nativeUnitScale: 1e8, fxDirection: 'divide', fxPair: 'USDJPY', fxFailReason: 'USDJPY-fx-failed' },
  ];

  const blocs: NormalizedM2Bloc[] = [];
  const providerStatus: Wave1Bundle['providerStatus'] = [];

  for (const s of specs) {
    const fxOk = s.fx === null || s.fx.ok;
    if (s.raw.ok && fxOk) {
      const st = assessStaleWith(s.id, s.raw.latestObservationMonth, WAVE2_STALE_POLICY);
      blocs.push(normalizeM2BlocFull({
        id: s.id, name: s.name, nativeCurrency: s.nativeCurrency, nativeUnit: s.raw.nativeUnit,
        classification: s.classification, provider: s.raw.provider, sourceSeries: s.raw.sourceSeries, sourceUrl: s.raw.sourceUrl,
        definitionBreakpoints: s.definitionBreakpoints, retrievedAt: s.raw.retrievedAt,
        nativeUnitScale: s.nativeUnitScale, fxDirection: s.fxDirection, fxPair: s.fxPair,
        dailyFx: s.fx ? (s.fx.daily as DailyFxPoint[]) : undefined,
        m2: s.raw.m2, stale: st.stale, staleReason: st.staleReason,
      }));
      providerStatus.push({ id: s.id, ok: true, latestObservationMonth: s.raw.latestObservationMonth, ...st });
    } else {
      providerStatus.push({
        id: s.id, ok: false, latestObservationMonth: s.raw.latestObservationMonth, stale: true,
        staleReason: s.raw.ok ? s.fxFailReason : `${s.raw.provider}-failed`,
        error: s.raw.error ?? s.fx?.error,
      });
    }
  }

  const result = computeGlobalM2({ blocs }, GLOBAL_M2_CONFIG, calculatedAt);
  result.quality.parityStatus = 'DATA_PARITY_PENDING';

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

/* ── Wave 3: add Canada, Australia, India, South Korea, Brazil ──────────────── */

export interface Wave3Deps extends Wave2Deps {
  canada?: () => Promise<ProviderM2Raw>;
  australia?: () => Promise<ProviderM2Raw>;
  india?: () => Promise<ProviderM2Raw>;
  korea?: () => Promise<ProviderM2Raw>;
  brazil?: () => Promise<ProviderM2Raw>;
  usdcad?: () => Promise<ProviderFxRaw>;
  audusd?: () => Promise<ProviderFxRaw>;
  usdinr?: () => Promise<ProviderFxRaw>;
  usdkrw?: () => Promise<ProviderFxRaw>;
  usdbrl?: () => Promise<ProviderFxRaw>;
}

/**
 * Build the full (up to 11-bloc) live partial Global M2 bundle. Reuses the
 * frozen engine; live results carry DATA_PARITY_PENDING. Japan/India/Korea fail
 * closed until sources/credentials are configured; Australia uses M3 (PROXY, no
 * national M2). No aggregate is ever silently substituted.
 */
export async function buildWave3Bundle(deps: Wave3Deps = {}, options: Wave1Options = {}): Promise<Wave1Bundle> {
  const calculatedAt = new Date().toISOString();
  const [us, china, swiss, euro, uk, japan, canada, australia, india, korea, brazil,
    usdcny, usdchf, eurusd, gbpusd, usdjpy, usdcad, audusd, usdinr, usdkrw, usdbrl] = await Promise.all([
    (deps.us ?? fetchUsM2)(),
    (deps.china ?? fetchChinaM2)(),
    (deps.swiss ?? fetchSwissM2)(),
    (deps.euro ?? fetchEuroM2)(),
    (deps.uk ?? fetchUkM2)(),
    (deps.japan ?? fetchJapanM2)(),
    (deps.canada ?? fetchCanadaM2)(),
    (deps.australia ?? fetchAustraliaM2)(),
    (deps.india ?? fetchIndiaM2)(),
    (deps.korea ?? fetchKoreaM2)(),
    (deps.brazil ?? fetchBrazilM2)(),
    (deps.usdcny ?? (() => fetchUsdFxDaily('CNY')))(),
    (deps.usdchf ?? (() => fetchUsdFxDaily('CHF')))(),
    (deps.eurusd ?? (() => fetchFxDailyPair('EUR', 'USD')))(),
    (deps.gbpusd ?? (() => fetchFxDailyPair('GBP', 'USD')))(),
    (deps.usdjpy ?? (() => fetchUsdFxDaily('JPY')))(),
    (deps.usdcad ?? (() => fetchUsdFxDaily('CAD')))(),
    (deps.audusd ?? (() => fetchFxDailyPair('AUD', 'USD')))(),
    (deps.usdinr ?? (() => fetchUsdFxDaily('INR')))(),
    (deps.usdkrw ?? (() => fetchUsdFxDaily('KRW')))(),
    (deps.usdbrl ?? (() => fetchUsdFxDaily('BRL')))(),
  ]);

  const specs: BlocSpec[] = [
    { id: 'US', name: 'United States', nativeCurrency: 'USD', classification: 'EXACT', raw: us, fx: null, nativeUnitScale: UNIT_TRANSFORMS.fredBillionsUsdToUsd(1), fxDirection: 'none', fxPair: null, fxFailReason: '' },
    { id: 'CN', name: 'China', nativeCurrency: 'CNY', classification: 'EXACT', raw: china, fx: usdcny, nativeUnitScale: UNIT_TRANSFORMS.pbocYiYuanToCny(1), fxDirection: 'divide', fxPair: 'USDCNY', fxFailReason: 'USDCNY-fx-failed', definitionBreakpoints: ['2011-10 caliber', '2018-01 MMF adjustment', '2025-01 M1 revision (M2 unaffected)'] },
    { id: 'CH', name: 'Switzerland', nativeCurrency: 'CHF', classification: 'EXACT', raw: swiss, fx: usdchf, nativeUnitScale: UNIT_TRANSFORMS.snbChfMillionsToChf(1), fxDirection: 'divide', fxPair: 'USDCHF', fxFailReason: 'USDCHF-fx-failed' },
    { id: 'EU', name: 'Euro Area', nativeCurrency: 'EUR', classification: 'ALTERNATIVE', raw: euro, fx: eurusd, nativeUnitScale: 1e6, fxDirection: 'multiply', fxPair: 'EURUSD', fxFailReason: 'EURUSD-fx-failed', definitionBreakpoints: ['ECB harmonised M2 (euro-area definition, not identical to US M2)'] },
    { id: 'GB', name: 'United Kingdom', nativeCurrency: 'GBP', classification: 'ALTERNATIVE', raw: uk, fx: gbpusd, nativeUnitScale: 1e6, fxDirection: 'multiply', fxPair: 'GBPUSD', fxFailReason: 'GBPUSD-fx-failed', definitionBreakpoints: ['BOE M2 = UK estimate of EMU aggregate; all-currency, private & public sectors, NSA'] },
    { id: 'JP', name: 'Japan', nativeCurrency: 'JPY', classification: 'ALTERNATIVE', raw: japan, fx: usdjpy, nativeUnitScale: 1e8, fxDirection: 'divide', fxPair: 'USDJPY', fxFailReason: 'USDJPY-fx-failed' },
    { id: 'CA', name: 'Canada', nativeCurrency: 'CAD', classification: 'EXACT', raw: canada, fx: usdcad, nativeUnitScale: 1e6, fxDirection: 'divide', fxPair: 'USDCAD', fxFailReason: 'USDCAD-fx-failed', definitionBreakpoints: ['StatCan 10-10-0116-01 M2 (gross)'] },
    { id: 'AU', name: 'Australia', nativeCurrency: 'AUD', classification: 'PROXY', raw: australia, fx: audusd, nativeUnitScale: 1e9, fxDirection: 'multiply', fxPair: 'AUDUSD', fxFailReason: 'AUDUSD-fx-failed', definitionBreakpoints: ['RBA M3 (SA) — Australia publishes no M2; PROXY; TV AUM2 currently n/a'] },
    { id: 'IN', name: 'India', nativeCurrency: 'INR', classification: 'PROXY', raw: india, fx: usdinr, nativeUnitScale: 1e7, fxDirection: 'divide', fxPair: 'USDINR', fxFailReason: 'USDINR-fx-failed', definitionBreakpoints: ['RBI discontinued M2 in 2017 — fail-closed'] },
    { id: 'KR', name: 'South Korea', nativeCurrency: 'KRW', classification: 'EXACT', raw: korea, fx: usdkrw, nativeUnitScale: 1e9, fxDirection: 'divide', fxPair: 'USDKRW', fxFailReason: 'USDKRW-fx-failed', definitionBreakpoints: ['BoK ECOS M2 — credential-gated'] },
    { id: 'BR', name: 'Brazil', nativeCurrency: 'BRL', classification: 'EXACT', raw: brazil, fx: usdbrl, nativeUnitScale: 1e3, fxDirection: 'divide', fxPair: 'USDBRL', fxFailReason: 'USDBRL-fx-failed', definitionBreakpoints: ['BCB SGS 27842 M2 (fim de período)'] },
  ];

  const blocs: NormalizedM2Bloc[] = [];
  const providerStatus: Wave1Bundle['providerStatus'] = [];

  for (const s of specs) {
    const fxOk = s.fx === null || s.fx.ok;
    if (s.raw.ok && fxOk) {
      const st = assessStaleWith(s.id, s.raw.latestObservationMonth, WAVE3_STALE_POLICY);
      blocs.push(normalizeM2BlocFull({
        id: s.id, name: s.name, nativeCurrency: s.nativeCurrency, nativeUnit: s.raw.nativeUnit,
        classification: s.classification, provider: s.raw.provider, sourceSeries: s.raw.sourceSeries, sourceUrl: s.raw.sourceUrl,
        definitionBreakpoints: s.definitionBreakpoints, retrievedAt: s.raw.retrievedAt,
        nativeUnitScale: s.nativeUnitScale, fxDirection: s.fxDirection, fxPair: s.fxPair,
        dailyFx: s.fx ? (s.fx.daily as DailyFxPoint[]) : undefined,
        m2: s.raw.m2, stale: st.stale, staleReason: st.staleReason,
      }));
      providerStatus.push({ id: s.id, ok: true, latestObservationMonth: s.raw.latestObservationMonth, ...st });
    } else {
      providerStatus.push({
        id: s.id, ok: false, latestObservationMonth: s.raw.latestObservationMonth, stale: true,
        staleReason: s.raw.ok ? s.fxFailReason : `${s.raw.provider}-failed`,
        error: s.raw.error ?? s.fx?.error,
      });
    }
  }

  const result = computeGlobalM2({ blocs }, GLOBAL_M2_CONFIG, calculatedAt);
  result.quality.parityStatus = 'DATA_PARITY_PENDING';

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
