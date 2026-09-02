// Shared provider contracts + fail-closed validation for Global M2 Wave-1.
// A malformed provider response must never produce a plausible-looking value.

export interface ProviderM2Raw {
  ok: boolean;
  id: string;
  provider: string;
  sourceSeries: string;
  sourceUrl?: string;
  nativeCurrency: string;
  nativeUnit: string;
  /** Ascending, validated monthly series in native reported units. */
  m2: { month: string; nativeM2: number }[];
  latestObservationMonth: string | null;
  retrievedAt: string;
  error?: string;
}

export interface ProviderFxRaw {
  ok: boolean;
  pair: string;
  /** Ascending daily FX closes (unit-per-USD or USD-per-unit per the pair). */
  daily: { date: string; rate: number }[];
  retrievedAt: string;
  error?: string;
}

export interface M2SeriesExpectation {
  /** Minimum plausible native value (guards against unit drift / wrong row). */
  minNative: number;
  /** Maximum plausible native value. */
  maxNative: number;
  /** Minimum number of monthly observations required. */
  minDepth: number;
}

/**
 * Validate a monthly native M2 series. Throws (fail-closed) on: empty/short
 * history, non-YYYY-MM months, non-monotonic order, duplicate months,
 * non-finite values, or values outside the plausible native scale.
 */
export function validateM2Series(m2: { month: string; nativeM2: number }[], exp: M2SeriesExpectation): void {
  if (m2.length < exp.minDepth) throw new Error(`M2 series too short: ${m2.length} < ${exp.minDepth}`);
  const seen = new Set<string>();
  for (let i = 0; i < m2.length; i++) {
    const { month, nativeM2 } = m2[i];
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`M2 series: bad month "${month}"`);
    if (seen.has(month)) throw new Error(`M2 series: duplicate month ${month}`);
    seen.add(month);
    if (i > 0 && month <= m2[i - 1].month) throw new Error(`M2 series: not strictly ascending at ${month}`);
    if (!Number.isFinite(nativeM2)) throw new Error(`M2 series: non-finite value at ${month}`);
    if (nativeM2 < exp.minNative || nativeM2 > exp.maxNative) {
      throw new Error(`M2 series: value ${nativeM2} at ${month} outside plausible [${exp.minNative}, ${exp.maxNative}]`);
    }
  }
}

/** Realistic desktop browser UA — some official sites (e.g. RBA) reject the bare
 *  "Mozilla/5.0" default with 403. Header changes cannot defeat IP-based blocks. */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url.slice(0, 60); }
}

/** Default fetch that returns decoded text, with an optional charset (e.g. gbk).
 *  Browser-like headers + a hard timeout; errors carry safe diagnostics (host,
 *  HTTP status, content-type, elapsed) but never response bodies or secrets. */
export async function fetchText(url: string, charset?: string): Promise<string> {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/csv,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
      },
    });
  } catch (e) {
    throw new Error(`fetch failed for ${hostOf(url)} after ${Date.now() - started}ms: ${e instanceof Error ? e.message : String(e)}`);
  }
  const elapsed = Date.now() - started;
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} (${res.headers.get('content-type') ?? '?'}) for ${hostOf(url)} in ${elapsed}ms`);
  }
  if (!charset) return res.text();
  const buf = new Uint8Array(await res.arrayBuffer());
  return new TextDecoder(charset).decode(buf);
}

export async function fetchJson<T>(url: string): Promise<T> {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json,*/*' },
    });
  } catch (e) {
    throw new Error(`fetch failed for ${hostOf(url)} after ${Date.now() - started}ms: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${hostOf(url)} in ${Date.now() - started}ms`);
  return res.json() as Promise<T>;
}
