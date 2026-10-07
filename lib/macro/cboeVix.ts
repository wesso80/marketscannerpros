/**
 * Cboe daily VIX history, the free CSV the market regime reads first.
 * https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv
 *
 * The URL 307-redirects to cdn-api.cboe.com. Cloudflare rejects clients that do not look like a
 * browser, so the request follows redirects and sends a normal browser User-Agent.
 *
 * File shape: header DATE,OPEN,HIGH,LOW,CLOSE, DATE as MM/DD/YYYY, oldest row first.
 * The last valid row is the latest close. Blank and malformed rows are skipped.
 * FRED (stored VIXCLS, then its CSV) stays the fallback in regimeOverlayData.ts.
 */

export const CBOE_VIX_HISTORY_URL = 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv';
/** Source code stored on the regime VIX input. */
export const CBOE_VIX_SOURCE = 'cboe' as const;
/** Human label used wherever VIX source labels are built. */
export const CBOE_VIX_SOURCE_LABEL = 'Cboe daily VIX (close)';
export const CBOE_VIX_TIMEOUT_MS = 10_000;

/** A normal desktop browser UA. Cloudflare blocks the CSV without one. */
export const CBOE_BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type CboeVixObs = { /** YYYY-MM-DD, the US session date, not shifted by timezone. */ on: string; value: number };

const SUCCESS_TTL_MS = 15 * 60 * 1000;
const FAILURE_TTL_MS = 10 * 60 * 1000;

const MDY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** MM/DD/YYYY → YYYY-MM-DD. Invalid calendar dates are rejected. No local-timezone conversion. */
export function cboeDateToIso(mdy: string): string | null {
  const m = MDY.exec(mdy.trim());
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Valid closes from VIX_History.csv, oldest first (file order).
 * A row counts only when DATE is a real MM/DD/YYYY and CLOSE is a positive number.
 * Blank lines and malformed rows, including a bad trailing row, are skipped, so the last
 * returned row is the last valid close.
 */
export function parseCboeVixCsv(text: string): CboeVixObs[] {
  const out: CboeVixObs[] = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 5) continue;
    const on = cboeDateToIso(parts[0] ?? '');
    const value = Number((parts[4] ?? '').trim());
    if (!on || !Number.isFinite(value) || value <= 0) continue;
    out.push({ on, value });
  }
  return out;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

let cache: { at: number; rows: CboeVixObs[] | null } | null = null;

export function clearCboeVixCache(): void {
  cache = null;
}

/** Fetch and parse the daily history, oldest first. Throws on HTTP, network, timeout, or no valid rows. */
export async function fetchCboeVixDaily(opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {}): Promise<CboeVixObs[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(CBOE_VIX_HISTORY_URL, {
    redirect: 'follow',
    headers: {
      'User-Agent': CBOE_BROWSER_UA,
      Accept: 'text/csv,text/plain,*/*',
    },
    signal: AbortSignal.timeout(opts.timeoutMs ?? CBOE_VIX_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Cboe VIX CSV HTTP ${res.status}`);
  const rows = parseCboeVixCsv(await res.text());
  if (rows.length === 0) throw new Error('Cboe VIX CSV: no observations');
  return rows;
}

/**
 * Daily closes, newest first (same order as the regime chain). null when Cboe fails, times out,
 * or the file parses to nothing. Cached 15 minutes after a success, 10 minutes after a failure.
 */
export async function getCboeVixDailyCached(opts: { fetchImpl?: FetchLike; now?: number; timeoutMs?: number } = {}): Promise<CboeVixObs[] | null> {
  const now = opts.now ?? Date.now();
  if (cache && now - cache.at < (cache.rows ? SUCCESS_TTL_MS : FAILURE_TTL_MS)) return cache.rows;
  let rows: CboeVixObs[] | null = null;
  try {
    const parsed = await fetchCboeVixDaily({ fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs });
    rows = parsed.length ? [...parsed].reverse() : null;
  } catch (e) {
    console.warn('[cboeVix] daily VIX fetch failed:', e instanceof Error ? e.message : e);
    rows = null;
  }
  cache = { at: now, rows };
  return rows;
}
