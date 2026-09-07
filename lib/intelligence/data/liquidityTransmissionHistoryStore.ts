// Persistence for the previous confirmed transmissionRiskOn (MASTER LINK). This
// is the one Pine value the stateless engine cannot reconstruct locally:
// `transmissionRiskOn - transmissionRiskOn[1]` (stage-8 5D Δ display cell).
//
// Storage reuses migration 083 macro_series (series_key = LIQ_TX_MASTER_LINK,
// units = "score" 0..100). Best-effort: read()/write() no-op when DATABASE_URL
// is absent or the DB is unreachable, so the service renders identically in
// DB-less environments (returning null delta instead of fabricating one).

import { q } from '@/lib/db';

const SERIES_KEY = 'LIQ_TX_MASTER_LINK';

export interface MasterLinkHistoryPoint {
  observedOn: string;   // YYYY-MM-DD (confirmed daily date the value applies to)
  masterLink: number;   // 0..100 transmissionRiskOn
  writtenAt: string;    // ISO timestamp of the write
}

export interface MasterLinkHistoryStore {
  /** Latest persisted point strictly before `beforeDay` (YYYY-MM-DD). */
  readLatestBefore(beforeDay: string): Promise<MasterLinkHistoryPoint | null>;
  /** Persist today's confirmed value. Idempotent per (series_key, observed_on). */
  write(day: string, masterLink: number): Promise<boolean>;
}

export const dbMasterLinkHistoryStore: MasterLinkHistoryStore = {
  async readLatestBefore(beforeDay) {
    if (!process.env.DATABASE_URL) return null;
    try {
      const rows = await q<{ observed_on: Date; value: string; fetched_at: Date }>(
        `SELECT observed_on, value::text, fetched_at
           FROM macro_series
           WHERE series_key = $1 AND observed_on < $2
           ORDER BY observed_on DESC LIMIT 1`,
        [SERIES_KEY, beforeDay],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        observedOn: new Date(r.observed_on).toISOString().slice(0, 10),
        masterLink: Number(r.value),
        writtenAt: new Date(r.fetched_at).toISOString(),
      };
    } catch { return null; }
  },
  async write(day, masterLink) {
    if (!process.env.DATABASE_URL || !Number.isFinite(masterLink)) return false;
    try {
      await q(
        `INSERT INTO macro_series_meta (series_key, description, units, cadence, category, updated_at)
         VALUES ($1, 'Liquidity Transmission MASTER LINK (0..100)', 'score', 'daily', 'liquidity', NOW())
         ON CONFLICT (series_key) DO UPDATE SET updated_at = NOW()`,
        [SERIES_KEY],
      );
      await q(
        `INSERT INTO macro_series (series_key, observed_on, value, source, fetched_at)
         VALUES ($1, $2, $3, 'derived', NOW())
         ON CONFLICT (series_key, observed_on) DO UPDATE
           SET value = EXCLUDED.value, fetched_at = NOW()`,
        [SERIES_KEY, day, masterLink],
      );
      return true;
    } catch { return false; }
  },
};

/** In-memory store for tests (no DB). */
export function memoryMasterLinkHistoryStore(
  seed: MasterLinkHistoryPoint[] = [],
): MasterLinkHistoryStore {
  const rows: MasterLinkHistoryPoint[] = [...seed].sort((a, b) => a.observedOn.localeCompare(b.observedOn));
  return {
    async readLatestBefore(beforeDay) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].observedOn < beforeDay) return rows[i];
      }
      return null;
    },
    async write(day, masterLink) {
      const idx = rows.findIndex((r) => r.observedOn === day);
      const point: MasterLinkHistoryPoint = { observedOn: day, masterLink, writtenAt: new Date().toISOString() };
      if (idx >= 0) rows[idx] = point;
      else {
        rows.push(point);
        rows.sort((a, b) => a.observedOn.localeCompare(b.observedOn));
      }
      return true;
    },
  };
}
