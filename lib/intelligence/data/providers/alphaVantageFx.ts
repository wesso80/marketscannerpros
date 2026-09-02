// FX provider — Alpha Vantage FX_DAILY. Returns ascending daily closes for a
// USD-based pair (from_symbol=USD → to_symbol=CNY/CHF), for month-end alignment.
import type { ProviderFxRaw } from './globalM2ProviderTypes';

interface AvFxResponse {
  'Time Series FX (Daily)'?: Record<string, Record<string, string>>;
  Note?: string;
  Information?: string;
}

/** Parse an Alpha Vantage FX_DAILY payload into ascending daily closes. */
export function parseAvFxDaily(json: AvFxResponse, pair: string, retrievedAt: string): ProviderFxRaw {
  const ts = json['Time Series FX (Daily)'];
  if (!ts) return { ok: false, pair, daily: [], retrievedAt, error: json.Note ?? json.Information ?? 'no-series' };
  const daily = Object.entries(ts)
    .map(([date, o]) => ({ date, rate: Number(o['4. close']) }))
    .filter((d) => Number.isFinite(d.rate) && d.rate > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (daily.length === 0) return { ok: false, pair, daily: [], retrievedAt, error: 'empty-series' };
  return { ok: true, pair, daily, retrievedAt };
}

export interface FxDeps {
  fetchJson?: (url: string) => Promise<AvFxResponse>;
}

/** Fetch a daily FX series for `from`→`to` (e.g. from='EUR',to='USD' gives EURUSD). */
export async function fetchFxDailyPair(from: string, to: string, deps: FxDeps = {}): Promise<ProviderFxRaw> {
  const retrievedAt = new Date().toISOString();
  const pair = `${from}${to}`;
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  const url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${encodeURIComponent(from)}&to_symbol=${encodeURIComponent(to)}&outputsize=full&apikey=${key}`;
  const fj = deps.fetchJson ?? (async (u: string) => {
    const r = await fetch(u, { cache: 'no-store' });
    return (await r.json()) as AvFxResponse;
  });
  try {
    return parseAvFxDaily(await fj(url), pair, retrievedAt);
  } catch (e) {
    return { ok: false, pair, daily: [], retrievedAt, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Fetch a daily FX series for USD→`to` (e.g. to='CNY' gives USDCNY). */
export async function fetchUsdFxDaily(to: string, deps: FxDeps = {}): Promise<ProviderFxRaw> {
  return fetchFxDailyPair('USD', to, deps);
}
