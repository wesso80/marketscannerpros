// US M2 provider — FRED M2SL (EXACT, USD, no FX). Reuses lib/macro/fred.ts.
import { fetchFredObservationsRaw } from '@/lib/macro/fred';
import { validateM2Series, type ProviderM2Raw } from './globalM2ProviderTypes';

export const US_M2_SOURCE = {
  id: 'US',
  provider: 'FRED',
  sourceSeries: 'M2SL',
  sourceUrl: 'https://fred.stlouisfed.org/series/M2SL',
  nativeCurrency: 'USD',
  nativeUnit: 'billions-USD',
} as const;

interface FredObs { date: string; value: string }

/** Fetch US M2 (M2SL) as an ascending monthly native series in billions USD. */
export async function fetchUsM2(
  deps: { fetchObservations?: (fredId: string, start?: string) => Promise<FredObs[]> } = {},
): Promise<ProviderM2Raw> {
  const retrievedAt = new Date().toISOString();
  const fetchObs = deps.fetchObservations ?? fetchFredObservationsRaw;
  try {
    const obs = await fetchObs('M2SL', '2000-01-01');
    const m2 = obs
      .filter((o) => o.value !== '.' && o.value !== '')
      .map((o) => ({ month: o.date.slice(0, 7), nativeM2: Number(o.value) }))
      .filter((o) => Number.isFinite(o.nativeM2))
      .sort((a, b) => (a.month < b.month ? -1 : 1));
    // US M2 in billions USD is ~5,000–40,000 across 2000–2030.
    validateM2Series(m2, { minNative: 3000, maxNative: 60000, minDepth: 13 });
    return {
      ok: true, ...US_M2_SOURCE, m2,
      latestObservationMonth: m2[m2.length - 1].month, retrievedAt,
    };
  } catch (e) {
    return { ok: false, ...US_M2_SOURCE, m2: [], latestObservationMonth: null, retrievedAt, error: e instanceof Error ? e.message : String(e) };
  }
}
