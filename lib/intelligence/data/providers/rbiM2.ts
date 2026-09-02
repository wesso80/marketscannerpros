// India provider — FAIL-CLOSED / DATA_UNAVAILABLE.
//
// The Reserve Bank of India DISCONTINUED the M2 (and M4) monetary aggregates in
// 2017; RBI now publishes only M0 (reserve money), M1, and M3 (broad money).
// There is therefore NO genuine current Indian "M2" series to source. Per the
// no-substitution rule we do NOT relabel M1 or M3 as M2 (India M3 ≈ $3T, an
// order away from TradingView ECONOMICS:INM2 ≈ $0.84T, which approximates the
// legacy M2/M1 magnitude). This provider fails closed and never fabricates data.
import type { ProviderM2Raw } from './globalM2ProviderTypes';

export const INDIA_M2_SOURCE = {
  id: 'IN',
  provider: 'RBI',
  sourceSeries: 'M2 (discontinued by RBI in 2017 — no current series)',
  sourceUrl: 'https://www.rbi.org.in/',
  nativeCurrency: 'INR',
  nativeUnit: 'crore-INR',
} as const;

export interface IndiaM2Deps {
  /** Optional injected raw series (tests only). No live endpoint substitutes M2. */
  fetchM2?: () => Promise<{ month: string; nativeM2: number }[]>;
}

/** Fetch India M2. Fails closed: RBI discontinued M2 in 2017 and no genuine
 *  current M2 series exists; M1/M3 are never substituted. */
export async function fetchIndiaM2(deps: IndiaM2Deps = {}): Promise<ProviderM2Raw> {
  const retrievedAt = new Date().toISOString();
  if (!deps.fetchM2) {
    return {
      ok: false, ...INDIA_M2_SOURCE, m2: [], latestObservationMonth: null, retrievedAt,
      error: 'India M2 DATA_UNAVAILABLE: RBI discontinued M2/M4 in 2017; no genuine current M2 series. ' +
        'M1/M3 are not substituted (India M3 ~$3T != TradingView INM2 ~$0.84T).',
    };
  }
  try {
    const m2 = (await deps.fetchM2()).slice().sort((a, b) => (a.month < b.month ? -1 : 1));
    if (m2.length === 0) throw new Error('empty series');
    return { ok: true, ...INDIA_M2_SOURCE, m2, latestObservationMonth: m2[m2.length - 1].month, retrievedAt };
  } catch (e) {
    return { ok: false, ...INDIA_M2_SOURCE, m2: [], latestObservationMonth: null, retrievedAt, error: e instanceof Error ? e.message : String(e) };
  }
}
