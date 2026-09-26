/**
 * Alpha Vantage TOP_GAINERS_LOSERS with the realtime entitlement, and an honest fallback (OV-14).
 *
 * MSP's Alpha Vantage commercial agreement covers realtime display of US equities, and the key accepts
 * `entitlement=realtime` but refuses `entitlement=delayed` (26 Sep 2026). #151 had sent `delayed`, which returned no
 * equity rows. Any Note / Information / Error Message is kept as the reason. Alpha Vantage renames keys on some
 * payloads ("Global Quote - DATA DELAYED BY 15 MINUTES"), so keys are matched by prefix here.
 *
 * Order: the realtime call first; if it carries no rows, the default (end-of-day) call, labelled as such. The reason
 * the realtime call gave nothing is returned so the page and logs can say it.
 */
import { avTakeToken } from '@/lib/avRateGovernor';
import { parseAlphaVantageEasternTime } from '@/lib/analysis/providerAsOf';
import { avEquityEntitlementParam } from '@/lib/alphaVantageEntitlement';

export type AvMoversFeed = 'realtime' | 'end_of_day' | 'unavailable';

export interface AvTopMovers {
  gainers: any[];
  losers: any[];
  active: any[];
  /** Alpha Vantage `last_updated` as ISO; null if not sent. */
  asOf: string | null;
  feed: AvMoversFeed;
  /** Why the realtime feed was not used (Alpha Vantage's own message), or null. */
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
  const realtime = await call(apiKey, avEquityEntitlementParam(), fetcher);
  if (!('error' in realtime)) return { ...realtime, feed: 'realtime', note: null, apiCalls: 1 };
  console.warn(`[avTopMovers] realtime TOP_GAINERS_LOSERS gave no rows: ${realtime.error}; trying the end-of-day list`);
  const eod = await call(apiKey, '', fetcher);
  if (!('error' in eod)) return { ...eod, feed: 'end_of_day', note: `Realtime list unavailable (${realtime.error})`, apiCalls: 2 };
  console.warn(`[avTopMovers] end-of-day TOP_GAINERS_LOSERS also failed: ${eod.error}`);
  return { ...empty, feed: 'unavailable', note: `Alpha Vantage movers unavailable (${realtime.error})`, apiCalls: 2 };
}
