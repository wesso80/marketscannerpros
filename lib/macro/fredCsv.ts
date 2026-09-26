/**
 * lib/macro/fredCsv.ts — FRED's keyless CSV download (fredgraph.csv).
 *
 * Used when FRED_API_KEY is missing (ingestFred) and as a read-time fallback when the
 * stored VIX / HY OAS rows are stale (regime inputs, OV-1). Same data as the FRED API:
 * https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS
 *
 * Fails soft: fetch helpers return null on any error; nothing is invented.
 */

export interface FredCsvObservation {
  /** YYYY-MM-DD */
  date: string;
  /** FRED's value as text, same shape as the API ('.' never survives parsing). */
  value: string;
}

const FRED_CSV_BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

/** Parse fredgraph.csv ("observation_date,VIXCLS" then "2026-09-22,14.21"). Missing values ('' or '.') are skipped. Oldest first. */
export function parseFredCsv(text: string): FredCsvObservation[] {
  const out: FredCsvObservation[] = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [date, value] = line.split(',');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) continue; // header or junk
    const v = (value ?? '').trim();
    if (v === '' || v === '.' || !Number.isFinite(Number(v))) continue;
    out.push({ date, value: v });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

export function fredCsvUrl(fredId: string, sinceISO?: string): string {
  const params = new URLSearchParams({ id: fredId });
  if (sinceISO && /^\d{4}-\d{2}-\d{2}$/.test(sinceISO)) params.set('cosd', sinceISO);
  return `${FRED_CSV_BASE}?${params.toString()}`;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Fetch and parse one series. Throws on HTTP/network errors or an empty payload (callers decide how to degrade). */
export async function fetchFredCsv(fredId: string, opts: { sinceISO?: string; fetchImpl?: FetchLike; timeoutMs?: number } = {}): Promise<FredCsvObservation[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(fredCsvUrl(fredId, opts.sinceISO), { signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) });
  if (!res.ok) throw new Error(`FRED CSV HTTP ${res.status}`);
  const rows = parseFredCsv(await res.text());
  if (rows.length === 0) throw new Error(`FRED CSV ${fredId}: no observations`);
  return rows;
}

/** In-memory cache so read-time fallbacks hit FRED at most every few hours per instance. */
const CSV_TTL_MS = 6 * 60 * 60 * 1000;
/** After a failure, wait this long before trying again (don't hammer FRED from every request). */
const CSV_FAILURE_TTL_MS = 30 * 60 * 1000;
const csvCache = new Map<string, { at: number; rows: FredCsvObservation[] | null }>();

/** Cached fetch of recent observations (last ~2 years). null when FRED can't be reached. */
export async function getFredCsvCached(fredId: string, opts: { fetchImpl?: FetchLike; now?: number } = {}): Promise<FredCsvObservation[] | null> {
  const now = opts.now ?? Date.now();
  const hit = csvCache.get(fredId);
  if (hit && now - hit.at < (hit.rows ? CSV_TTL_MS : CSV_FAILURE_TTL_MS)) return hit.rows;
  const since = new Date(now - 730 * 86_400_000).toISOString().slice(0, 10);
  let rows: FredCsvObservation[] | null = null;
  try {
    rows = await fetchFredCsv(fredId, { sinceISO: since, fetchImpl: opts.fetchImpl });
  } catch (e) {
    console.warn(`[fredCsv] ${fredId} fallback fetch failed:`, e instanceof Error ? e.message : e);
    rows = null;
  }
  csvCache.set(fredId, { at: now, rows });
  return rows;
}

/** Test hook. */
export function clearFredCsvCache(): void {
  csvCache.clear();
}
