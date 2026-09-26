/**
 * Alpha Vantage INDEX_DATA (premium, 150+ RPM plans): daily OHLC for an index itself, e.g. VIX, SPX, NDX, RUT.
 * https://www.alphavantage.co/documentation/#index-data-vix
 *   GET /query?function=INDEX_DATA&symbol=VIX&interval=daily&apikey=…
 *   → { symbol: "VIX", name: "Cboe Volatility Index", interval: "daily",
 *       data: [ { date: "2026-09-25", open: "14.96", high: "16.57", low: "14.12", close: "14.87" }, … ] }  (newest first)
 *
 * Used as the primary VIX for the market regime (MV-1): FRED's VIXCLS is published the morning after the session
 * and often lands 1–3 trading days late, which kept the regime's "stale inputs" note on. FRED stays the fallback
 * (lib/scoring/canonical/regimeOverlayData.ts).
 */
import { avFetch } from '@/lib/avRateGovernor';

export type IndexObs = { on: string; value: number };

const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Daily closes from an INDEX_DATA payload, newest first. Rows without a valid date or a positive close are skipped. */
export function parseIndexDataCloses(payload: unknown): IndexObs[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const rows: IndexObs[] = [];
  for (const r of data as Array<Record<string, unknown>>) {
    const on = String(r?.date ?? '').slice(0, 10);
    const value = Number(r?.close);
    if (YMD.test(on) && Number.isFinite(value) && value > 0) rows.push({ on, value });
  }
  return rows.sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0));
}

const SUCCESS_TTL_MS = 15 * 60 * 1000;
const FAILURE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; rows: IndexObs[] | null }>();

export function clearAvIndexDataCache(): void {
  cache.clear();
}

/**
 * Daily closes for an index from Alpha Vantage, newest first; null when there is no key or the call fails
 * (the reason, including Alpha Vantage's own message, is logged). Cached per instance: 15 min, 10 min after a failure.
 */
export async function getAvIndexDailyCached(symbol: string, opts: { now?: number } = {}): Promise<IndexObs[] | null> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return null;
  const sym = symbol.trim().toUpperCase();
  const now = opts.now ?? Date.now();
  const hit = cache.get(sym);
  if (hit && now - hit.at < (hit.rows ? SUCCESS_TTL_MS : FAILURE_TTL_MS)) return hit.rows;
  let rows: IndexObs[] | null = null;
  try {
    const url = `https://www.alphavantage.co/query?function=INDEX_DATA&symbol=${encodeURIComponent(sym)}&interval=daily&apikey=${key}`;
    const payload = await avFetch(url, `INDEX_DATA ${sym}`);
    const parsed = parseIndexDataCloses(payload);
    if (parsed.length) rows = parsed;
    else console.warn(`[avIndexData] INDEX_DATA ${sym}: no daily closes in the response${payload ? '' : ' (Alpha Vantage "Error Message" or HTTP 404)'}`);
  } catch (e) {
    console.warn(`[avIndexData] INDEX_DATA ${sym} failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  cache.set(sym, { at: now, rows });
  return rows;
}
