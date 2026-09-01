/**
 * lib/macro/fred.ts — Minimal FRED ingestor.
 *
 * Fetches the latest observations for a set of FRED series IDs and
 * upserts into macro_series. Returns ingest summary.
 *
 * Requires env: FRED_API_KEY. If absent, function reports a no-op
 * with reason='no-api-key' so the caller can degrade gracefully.
 *
 * Reference: https://fred.stlouisfed.org/docs/api/fred/series_observations.html
 *
 * Used by the daily macro cron and the Macro Pulse admin page.
 * Boundary: read-only data ingest, no derivatives, no broker.
 */

import { q } from '@/lib/db';

/** Map our internal series_key → FRED series_id + metadata. */
export const FRED_SERIES: Record<string, {
  fredId: string;
  description: string;
  units: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  category: 'rates' | 'vol' | 'fx' | 'credit' | 'liquidity' | 'sentiment';
}> = {
  FED_FUNDS_RATE: { fredId: 'DFF', description: 'Federal Funds Effective Rate', units: '%', cadence: 'daily', category: 'rates' },
  US10Y:          { fredId: 'DGS10', description: '10-Year Treasury Constant Maturity Rate', units: '%', cadence: 'daily', category: 'rates' },
  US2Y:           { fredId: 'DGS2', description: '2-Year Treasury Constant Maturity Rate', units: '%', cadence: 'daily', category: 'rates' },
  YIELD_2S10S:    { fredId: 'T10Y2Y', description: '10Y minus 2Y Treasury spread', units: '%', cadence: 'daily', category: 'rates' },
  VIX:            { fredId: 'VIXCLS', description: 'CBOE Volatility Index (VIX)', units: 'index', cadence: 'daily', category: 'vol' },
  VIX3M:          { fredId: 'VXVCLS', description: 'CBOE S&P 500 3-Month Volatility Index', units: 'index', cadence: 'daily', category: 'vol' },
  DXY:            { fredId: 'DTWEXBGS', description: 'Trade Weighted USD Index: Broad Goods and Services', units: 'index', cadence: 'daily', category: 'fx' },
  CREDIT_HY_OAS:  { fredId: 'BAMLH0A0HYM2', description: 'ICE BofA US High Yield Index Option-Adjusted Spread', units: '%', cadence: 'daily', category: 'credit' },
  UNRATE:         { fredId: 'UNRATE', description: 'US Unemployment Rate', units: '%', cadence: 'monthly', category: 'sentiment' },
  CPI_YOY:        { fredId: 'CPIAUCSL', description: 'CPI All Urban Consumers (level — YoY computed downstream)', units: 'index', cadence: 'monthly', category: 'sentiment' },
};

export type FredIngestSummary = {
  ok: boolean;
  reason?: 'no-api-key' | 'fred-error' | 'http-error';
  ingested: number;
  failed: number;
  perSeries: { seriesKey: string; rows: number; latest: string | null; error?: string }[];
};

interface FredObservation {
  date: string;
  value: string;     // FRED returns '.' for missing
}

async function fetchFredSeries(apiKey: string, fredId: string, observationStart?: string): Promise<FredObservation[]> {
  const params = new URLSearchParams({
    series_id: fredId,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'asc',
  });
  if (observationStart) params.set('observation_start', observationStart);
  const url = `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  const json = await res.json() as { observations?: FredObservation[]; error_message?: string };
  if (json.error_message) throw new Error(`FRED: ${json.error_message}`);
  return json.observations ?? [];
}

async function upsertMeta(seriesKey: string, meta: typeof FRED_SERIES[string]): Promise<void> {
  await q(
    `INSERT INTO macro_series_meta (series_key, description, units, cadence, category, updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (series_key) DO UPDATE
       SET description = EXCLUDED.description,
           units = EXCLUDED.units,
           cadence = EXCLUDED.cadence,
           category = EXCLUDED.category,
           updated_at = NOW()`,
    [seriesKey, meta.description, meta.units, meta.cadence, meta.category],
  );
}

async function upsertObservations(seriesKey: string, rows: FredObservation[]): Promise<number> {
  let written = 0;
  // Batch in chunks of 200 to keep parameter count reasonable
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).filter((r) => r.value !== '.' && r.value !== '');
    if (chunk.length === 0) continue;
    const values: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const r of chunk) {
      values.push(`($${p++}, $${p++}, $${p++}, 'fred', NOW())`);
      params.push(seriesKey, r.date, Number(r.value));
    }
    await q(
      `INSERT INTO macro_series (series_key, observed_on, value, source, fetched_at)
       VALUES ${values.join(',')}
       ON CONFLICT (series_key, observed_on) DO UPDATE
         SET value = EXCLUDED.value,
             source = EXCLUDED.source,
             fetched_at = NOW()`,
      params,
    );
    written += chunk.length;
  }
  return written;
}

export async function ingestFred(opts: { sinceISO?: string; only?: string[] } = {}): Promise<FredIngestSummary> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: 'no-api-key', ingested: 0, failed: 0, perSeries: [] };
  }
  const targets = opts.only && opts.only.length > 0
    ? opts.only.filter((k) => k in FRED_SERIES)
    : Object.keys(FRED_SERIES);
  const perSeries: FredIngestSummary['perSeries'] = [];
  let ingested = 0, failed = 0;
  for (const seriesKey of targets) {
    const meta = FRED_SERIES[seriesKey];
    try {
      await upsertMeta(seriesKey, meta);
      const obs = await fetchFredSeries(apiKey, meta.fredId, opts.sinceISO);
      const rows = await upsertObservations(seriesKey, obs);
      const latest = obs.length > 0 ? obs[obs.length - 1].date : null;
      perSeries.push({ seriesKey, rows, latest });
      ingested += rows;
    } catch (e: unknown) {
      perSeries.push({ seriesKey, rows: 0, latest: null, error: e instanceof Error ? e.message : String(e) });
      failed++;
    }
  }
  return { ok: failed === 0, ingested, failed, perSeries };
}

export interface MacroSnapshot {
  seriesKey: string;
  description: string;
  units: string;
  category: string;
  cadence: string;
  latestValue: number | null;
  latestObservedOn: string | null;
  prevValue: number | null;
  prevObservedOn: string | null;
  change: number | null;
  changePct: number | null;
  freshnessAgeDays: number | null;
}

export async function readMacroSnapshot(): Promise<MacroSnapshot[]> {
  const rows = await q<{
    series_key: string; description: string | null; units: string | null;
    category: string | null; cadence: string | null;
    latest_value: string | null; latest_observed_on: Date | null;
    prev_value: string | null; prev_observed_on: Date | null;
  }>(
    `WITH ranked AS (
       SELECT series_key, observed_on, value,
              ROW_NUMBER() OVER (PARTITION BY series_key ORDER BY observed_on DESC) AS rn
         FROM macro_series
     ),
     latest AS (SELECT series_key, observed_on, value FROM ranked WHERE rn = 1),
     prev   AS (SELECT series_key, observed_on, value FROM ranked WHERE rn = 2)
     SELECT m.series_key,
            mm.description, mm.units, mm.category, mm.cadence,
            l.value::text AS latest_value, l.observed_on AS latest_observed_on,
            p.value::text AS prev_value,   p.observed_on AS prev_observed_on
       FROM (SELECT DISTINCT series_key FROM macro_series) m
       LEFT JOIN macro_series_meta mm USING (series_key)
       LEFT JOIN latest l USING (series_key)
       LEFT JOIN prev   p USING (series_key)
      ORDER BY mm.category NULLS LAST, m.series_key`,
  );
  const num = (v: string | null) => v === null ? null : Number(v);
  return rows.map((r) => {
    const latest = num(r.latest_value);
    const prev = num(r.prev_value);
    const change = latest !== null && prev !== null ? latest - prev : null;
    const changePct = latest !== null && prev !== null && prev !== 0
      ? ((latest - prev) / Math.abs(prev)) * 100
      : null;
    const ageDays = r.latest_observed_on
      ? Math.floor((Date.now() - r.latest_observed_on.getTime()) / 86400_000)
      : null;
    return {
      seriesKey: r.series_key,
      description: r.description ?? r.series_key,
      units: r.units ?? '',
      category: r.category ?? 'other',
      cadence: r.cadence ?? 'unknown',
      latestValue: latest,
      latestObservedOn: r.latest_observed_on ? r.latest_observed_on.toISOString().slice(0, 10) : null,
      prevValue: prev,
      prevObservedOn: r.prev_observed_on ? r.prev_observed_on.toISOString().slice(0, 10) : null,
      change,
      changePct,
      freshnessAgeDays: ageDays,
    };
  });
}
