/**
 * Alpha Vantage TOP_GAINERS_LOSERS with the 15-minute-delayed entitlement, and an honest fallback (OV-14).
 *
 * After #151 added `entitlement=delayed`, the live /api/market-movers returned no equity rows and no `equityAsOf`
 * (26 Sep 22:25 AEST: every mover was crypto), where the same route without the entitlement had returned equities.
 * The old code dropped any Note / Information / Error Message silently. Alpha Vantage also renames keys on delayed
 * payloads for other functions ("Global Quote - DATA DELAYED BY 15 MINUTES"), so keys are matched by prefix here.
 *
 * Order: the delayed call first; if it carries no rows, the default (end-of-day) call, labelled as such. The reason
 * the delayed call gave nothing is returned so the page and logs can say it.
 */
import { avTakeToken } from '@/lib/avRateGovernor';
import { parseAlphaVantageEasternTime } from '@/lib/analysis/providerAsOf';
import { avEquityEntitlementParam } from '@/lib/alphaVantageEntitlement';

export type AvMoversFeed = 'delayed' | 'end_of_day' | 'unavailable';

export interface AvTopMovers {
  gainers: any[];
  losers: any[];
  active: any[];
  /** Alpha Vantage `last_updated` as ISO; null if not sent. */
  asOf: string | null;
  feed: AvMoversFeed;
  /** Why the delayed feed was not used (Alpha Vantage's own message), or null. */
  note: string | null;
  apiCalls: number;
}

type Parsed = { gainers: any[]; losers: any[]; active: any[]; asOf: string | null } | { error: string };

/** Value of the first key that equals `name` or starts with `name` (e.g. "top_gainers - DATA DELAYED BY 15 MINUTES"). */
function pick(json: Record<string, unknown>, name: string): unknown {
  if (name in json) return json[name];
  const key = Object.keys(json).find((k) => k.toLowerCase().startsWith(name));
  return key ? json[key] : undefined;
}

export function parseAvTopMovers(json: unknown): Parsed {
  if (!json || typeof json !== 'object') return { error: 'empty response' };
  const j = json as Record<string, unknown>;
  const msg = j['Note'] ?? j['Information'] ?? j['Error Message'];
  if (typeof msg === 'string' && msg) return { error: msg.slice(0, 200) };
  const list = (name: string) => { const v = pick(j, name); return Array.isArray(v) ? v : []; };
  const gainers = list('top_gainers');
  const losers = list('top_losers');
  const active = list('most_actively_traded');
  if (!gainers.length && !losers.length && !active.length) return { error: `no mover lists in the response (keys: ${Object.keys(j).slice(0, 6).join(', ') || 'none'})` };
  return { gainers, losers, active, asOf: parseAlphaVantageEasternTime(pick(j, 'last_updated')) };
}

async function call(apiKey: string, entitlement: string, fetcher: typeof fetch): Promise<Parsed> {
  try {
    await avTakeToken();
    const res = await fetcher(`https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${apiKey}${entitlement}`, { cache: 'no-store' });
    if (res.ok === false) return { error: `HTTP ${res.status}` };
    return parseAvTopMovers(await res.json());
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchAvTopMovers(apiKey: string, fetcher: typeof fetch = fetch): Promise<AvTopMovers> {
  const empty = { gainers: [], losers: [], active: [], asOf: null };
  if (!apiKey) return { ...empty, feed: 'unavailable', note: 'no Alpha Vantage key', apiCalls: 0 };
  const delayed = await call(apiKey, avEquityEntitlementParam(), fetcher);
  if (!('error' in delayed)) return { ...delayed, feed: 'delayed', note: null, apiCalls: 1 };
  console.warn(`[avTopMovers] delayed TOP_GAINERS_LOSERS gave no rows: ${delayed.error}; trying the end-of-day list`);
  const eod = await call(apiKey, '', fetcher);
  if (!('error' in eod)) return { ...eod, feed: 'end_of_day', note: `15-minute delayed list unavailable (${delayed.error})`, apiCalls: 2 };
  console.warn(`[avTopMovers] end-of-day TOP_GAINERS_LOSERS also failed: ${eod.error}`);
  return { ...empty, feed: 'unavailable', note: `Alpha Vantage movers unavailable (${delayed.error})`, apiCalls: 2 };
}
