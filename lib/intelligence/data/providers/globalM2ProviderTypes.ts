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

/** Default fetch that returns decoded text, with an optional charset (e.g. gbk). */
export async function fetchText(url: string, charset?: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'zh-CN,en' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (!charset) return res.text();
  const buf = new Uint8Array(await res.arrayBuffer());
  return new TextDecoder(charset).decode(buf);
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}
