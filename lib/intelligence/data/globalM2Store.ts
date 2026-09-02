// Persisted source-of-truth for Global M2. Production page-loads should consume
// the latest VALIDATED persisted normalized observations, not depend on every
// central-bank site being reachable at render time. Provider APIs are ingestion
// sources; a successful monthly ingest writes here, and a later provider outage
// serves last-known-good (STALE) instead of MISSING.
//
// Storage reuses macro_series (migration 083). We persist the fully-normalized
// USD monthly series per bloc (key `GM2_USD_<id>`, value in USD millions to fit
// NUMERIC(20,8)). No FX is needed at read time. Never fabricates or substitutes.
import { q } from '@/lib/db';
import type { NormalizedM2Bloc, NormalizedM2Observation } from './globalM2Normalize';
import type { M2Classification } from '../engines/globalM2';

export interface PersistedM2Point { month: string; usdM2: number }
export interface PersistedM2Read { observations: PersistedM2Point[]; latestFetchedAt: string | null }

export interface PersistedM2Store {
  read(id: string): Promise<PersistedM2Read | null>;
  write(id: string, obs: PersistedM2Point[], meta: { provider: string; classification: string }): Promise<number>;
}

const KEY = (id: string) => `GM2_USD_${id}`;
const USD_SCALE = 1e6; // persist USD millions

function toMonth(d: Date | string): string {
  const s = typeof d === 'string' ? d : d.toISOString();
  return s.slice(0, 7);
}

/** DB-backed store. No-ops (read→null, write→0) when DATABASE_URL is absent, so
 *  the pipeline runs identically in DB-less environments (e.g. local unit runs). */
export const dbGlobalM2Store: PersistedM2Store = {
  async read(id) {
    if (!process.env.DATABASE_URL) return null;
    try {
      const rows = await q<{ observed_on: Date; value: string; fetched_at: Date }>(
        `SELECT observed_on, value::text, fetched_at
           FROM macro_series WHERE series_key = $1 ORDER BY observed_on ASC`,
        [KEY(id)],
      );
      if (rows.length === 0) return null;
      const observations = rows.map((r) => ({ month: toMonth(r.observed_on), usdM2: Number(r.value) * USD_SCALE }));
      let latestFetchedAt: string | null = null;
      for (const r of rows) {
        const t = new Date(r.fetched_at).toISOString();
        if (!latestFetchedAt || t > latestFetchedAt) latestFetchedAt = t;
      }
      return { observations, latestFetchedAt };
    } catch {
      return null; // DB unreachable → behave as no-history (never throws at render)
    }
  },

  async write(id, obs, meta) {
    if (!process.env.DATABASE_URL || obs.length === 0) return 0;
    try {
      await q(
        `INSERT INTO macro_series_meta (series_key, description, units, cadence, category, updated_at)
         VALUES ($1,$2,'USD-millions','monthly','liquidity',NOW())
         ON CONFLICT (series_key) DO UPDATE SET description = EXCLUDED.description, updated_at = NOW()`,
        [KEY(id), `Global M2 (USD) — ${meta.provider} · ${meta.classification}`],
      );
      let written = 0;
      const chunkSize = 200;
      for (let i = 0; i < obs.length; i += chunkSize) {
        const chunk = obs.slice(i, i + chunkSize).filter((o) => Number.isFinite(o.usdM2));
        if (chunk.length === 0) continue;
        const values: string[] = [];
        const params: unknown[] = [];
        let p = 1;
        for (const o of chunk) {
          values.push(`($${p++}, $${p++}, $${p++}, 'derived', NOW())`);
          params.push(KEY(id), `${o.month}-01`, o.usdM2 / USD_SCALE);
        }
        await q(
          `INSERT INTO macro_series (series_key, observed_on, value, source, fetched_at)
           VALUES ${values.join(',')}
           ON CONFLICT (series_key, observed_on) DO UPDATE
             SET value = EXCLUDED.value, source = EXCLUDED.source, fetched_at = NOW()`,
          params,
        );
        written += chunk.length;
      }
      return written;
    } catch {
      return 0; // persistence best-effort; never breaks a live render
    }
  },
};

/** In-memory store for tests (no DB). */
export function memoryGlobalM2Store(seed: Record<string, PersistedM2Read> = {}): PersistedM2Store {
  const map = new Map<string, PersistedM2Read>(Object.entries(seed));
  return {
    async read(id) { return map.get(id) ?? null; },
    async write(id, obs) {
      map.set(id, { observations: obs.slice(), latestFetchedAt: new Date().toISOString() });
      return obs.length;
    },
  };
}

/** Reconstruct a normalized bloc from persisted USD history for STALE fallback.
 *  Carries no fabricated native/FX — provenance is explicitly 'PERSISTED'. */
export function blocFromPersisted(
  spec: { id: string; name: string; nativeCurrency: string; classification: M2Classification; provider: string },
  read: PersistedM2Read,
): NormalizedM2Bloc {
  const fxDate = read.latestFetchedAt ? read.latestFetchedAt.slice(0, 10) : null;
  const observations: NormalizedM2Observation[] = read.observations.map((o) => ({
    month: o.month,
    nativeM2: o.usdM2,
    nativeUnit: 'USD(persisted)',
    nativeValueRaw: o.usdM2,
    fxRate: 1,
    fxPair: 'PERSISTED',
    fxObservationDate: fxDate,
    fxAlignmentPolicy: null,
    usdM2: o.usdM2,
  }));
  const latest = observations.length ? observations[observations.length - 1].month : null;
  const retrievedAt = read.latestFetchedAt ?? new Date().toISOString();
  return {
    id: spec.id,
    name: spec.name,
    nativeCurrency: spec.nativeCurrency,
    nativeUnit: 'USD(persisted)',
    classification: spec.classification,
    observations,
    provider: `${spec.provider} (persisted last-known-good)`,
    sourceSeries: 'macro_series GM2_USD',
    stale: true,
    retrievedAt,
    freshness: {
      latestObservationMonth: latest,
      retrievedAt,
      expectedCadence: 'monthly',
      stale: true,
      staleReason: `persisted last-known-good (ingested ${fxDate ?? 'unknown'})`,
    },
  };
}
