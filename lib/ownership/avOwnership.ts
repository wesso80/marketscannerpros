/**
 * MV-5: insider, congressional and institutional ownership context for an equity, from Alpha Vantage.
 *   INSIDER_TRANSACTIONS   https://www.alphavantage.co/documentation/#insider-transactions   (symbol, from=YYYY-MM-DD)
 *   CONGRESS_TRADES        https://www.alphavantage.co/documentation/#congress-trades        (symbol or bioguide_id)
 *   INSTITUTIONAL_HOLDINGS https://www.alphavantage.co/documentation/#institutional-holdings (symbol)
 * All calls go through the shared AV rate governor (avFetch). Only compact summaries are cached (these payloads run to
 * megabytes and change slowly): 6 h for insider data, 12 h for congress trades and 13F holdings, 15 min after a failure.
 * Research context only: these are reported filings, not signals.
 */
import { avFetch } from '@/lib/avRateGovernor';

export type Unavailable = { status: 'unavailable'; reason: string };

export interface InsiderSide { count: number; shares: number; value: number }
export interface InsiderTxn { date: string; name: string; title: string; side: 'buy' | 'sell'; shares: number; price: number; value: number }
export interface InsiderSummary {
  status: 'ok';
  windowDays: number;
  from: string;
  /** Common-stock acquisitions with a price (A, price > 0). */
  buys: InsiderSide;
  /** Common-stock disposals with a price (D, price > 0). */
  sells: InsiderSide;
  netShares: number;
  netValue: number;
  /** Zero-price acquisitions: grants, awards, vesting. Not counted as buys. */
  awards: { count: number; shares: number };
  /** Options, RSU/phantom unit rows, zero-price disposals (e.g. withholding) and other derivative rows. */
  otherCount: number;
  notable: InsiderTxn[];
  lastTransactionDate: string | null;
}

export interface CongressTrade { date: string; politician: string; party: string | null; state: string | null; chamber: string | null; type: string; amountMin: number | null; amountMax: number | null; owner: string | null; filedDate: string | null }
export interface CongressSummary {
  status: 'ok';
  totalTrades: number;
  last12m: { buys: number; sells: number; other: number };
  recent: CongressTrade[];
  lastTradeDate: string | null;
}

export interface InstitutionalHolder { name: string; shares: number; changeShares: number | null; changePct: number | null; changeType: string | null; lastReported: string | null }
export interface InstitutionalSummary {
  status: 'ok';
  ownershipPct: number | null;
  holders: number | null;
  totalShares: number | null;
  holdersIncreased: number | null;
  holdersDecreased: number | null;
  holdersUnchanged: number | null;
  /** Shares added by holders that increased minus shares cut by holders that decreased, over the latest reported quarter. */
  netSharesChanged: number | null;
  netSharesChangedPct: number | null;
  reportPeriod: string | null;
  topHolders: InstitutionalHolder[];
}

export interface OwnershipContext {
  symbol: string;
  insider: InsiderSummary | Unavailable;
  congress: CongressSummary | Unavailable;
  institutional: InstitutionalSummary | Unavailable;
}

const DAY = 86_400_000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown): number | null => {
  if (v == null || v === '' || v === 'None' || v === 'n/a') return null;
  const n = Number(String(v).replace(/[%,]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const COMMON = /common|ordinary/i;

export function summarizeInsiderTransactions(payload: unknown, now: number, windowDays = 90): InsiderSummary | Unavailable {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return { status: 'unavailable', reason: 'Alpha Vantage returned no insider transaction data' };
  const from = ymd(now - windowDays * DAY);
  const buys: InsiderSide = { count: 0, shares: 0, value: 0 };
  const sells: InsiderSide = { count: 0, shares: 0, value: 0 };
  const awards = { count: 0, shares: 0 };
  let otherCount = 0;
  let last: string | null = null;
  const txns: InsiderTxn[] = [];
  for (const r of data as Array<Record<string, unknown>>) {
    const date = String(r?.transaction_date ?? '').slice(0, 10);
    if (!YMD.test(date) || date < from) continue;
    if (!last || date > last) last = date;
    const shares = num(r.shares) ?? 0;
    const price = num(r.share_price) ?? 0;
    const ad = String(r.acquisition_or_disposal ?? '').toUpperCase();
    const common = COMMON.test(String(r.security_type ?? ''));
    if (!(shares > 0) || !common) { otherCount++; continue; }
    if (ad === 'A' && price <= 0) { awards.count++; awards.shares += shares; continue; }
    if ((ad !== 'A' && ad !== 'D') || price <= 0) { otherCount++; continue; }
    const side = ad === 'A' ? buys : sells;
    const value = shares * price;
    side.count++; side.shares += shares; side.value += value;
    txns.push({ date, name: str(r.executive) ?? 'Unnamed insider', title: str(r.executive_title) ?? '', side: ad === 'A' ? 'buy' : 'sell', shares: round(shares, 0), price: round(price), value: round(value, 0) });
  }
  const fix = (s: InsiderSide): InsiderSide => ({ count: s.count, shares: round(s.shares, 0), value: round(s.value, 0) });
  txns.sort((a, b) => b.value - a.value || (a.date < b.date ? 1 : -1));
  return {
    status: 'ok', windowDays, from,
    buys: fix(buys), sells: fix(sells),
    netShares: round(buys.shares - sells.shares, 0), netValue: round(buys.value - sells.value, 0),
    awards: { count: awards.count, shares: round(awards.shares, 0) },
    otherCount, notable: txns.slice(0, 5), lastTransactionDate: last,
  };
}

export function summarizeCongressTrades(payload: unknown, now: number, limit = 8): CongressSummary | Unavailable {
  const trades = (payload as { trades?: unknown })?.trades;
  if (!Array.isArray(trades)) return { status: 'unavailable', reason: 'Alpha Vantage returned no congressional trade data' };
  const since = ymd(now - 365 * DAY);
  const last12m = { buys: 0, sells: 0, other: 0 };
  const rows: CongressTrade[] = [];
  for (const t of trades as Array<Record<string, unknown>>) {
    const date = String(t?.transaction_date ?? '').slice(0, 10);
    if (!YMD.test(date)) continue;
    const type = String(t.transaction_type ?? '').toUpperCase() || 'OTHER';
    if (date >= since) {
      if (type.startsWith('BUY') || type.startsWith('PURCHASE')) last12m.buys++;
      else if (type.startsWith('SELL') || type.startsWith('SALE')) last12m.sells++;
      else last12m.other++;
    }
    rows.push({
      date, type,
      politician: str(t.politician_canonical) ?? str(t.politician) ?? 'Unnamed member',
      party: str(t.party), state: str(t.state), chamber: str(t.chamber),
      amountMin: num(t.amount_min), amountMax: num(t.amount_max),
      owner: str(t.owner_code), filedDate: str(t.filed_date)?.slice(0, 10) ?? null,
    });
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { status: 'ok', totalTrades: rows.length, last12m, recent: rows.slice(0, limit), lastTradeDate: rows[0]?.date ?? null };
}

export function summarizeInstitutionalHoldings(payload: unknown, limit = 5): InstitutionalSummary | Unavailable {
  const p = payload as Record<string, unknown> | null;
  const holdings = p?.holdings;
  if (!p || (!Array.isArray(holdings) && p.total_institutional_holders == null)) return { status: 'unavailable', reason: 'Alpha Vantage returned no institutional holdings data' };
  const list = (Array.isArray(holdings) ? holdings : []) as Array<Record<string, unknown>>;
  const periods = new Map<string, number>();
  const top: InstitutionalHolder[] = [];
  for (const h of list) {
    const lr = str(h.last_reported)?.slice(0, 10) ?? null;
    if (lr && YMD.test(lr)) periods.set(lr, (periods.get(lr) ?? 0) + 1);
    const shares = num(h.shares_held);
    if (shares == null || shares <= 0) continue;
    top.push({ name: str(h.holder_name) ?? 'Unnamed holder', shares, changeShares: num(h.shares_changed), changePct: num(h.shares_changed_percentage), changeType: str(h.change_type), lastReported: lr });
  }
  top.sort((a, b) => b.shares - a.shares);
  const reportPeriod = [...periods.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0]?.[0] ?? null;
  const total = num(p.total_institutional_shares);
  const inc = num(p.shares_with_increased_holdings);
  const dec = num(p.shares_with_decreased_holdings);
  const net = inc != null && dec != null ? inc - dec : null;
  const prior = total != null && net != null ? total - net : null;
  return {
    status: 'ok',
    ownershipPct: num(p.total_institutional_ownership_percentage),
    holders: num(p.total_institutional_holders),
    totalShares: total,
    holdersIncreased: num(p.holders_with_increased_holdings),
    holdersDecreased: num(p.holders_with_decreased_holdings),
    holdersUnchanged: num(p.holders_with_unchanged_holdings),
    netSharesChanged: net,
    netSharesChangedPct: net != null && prior && prior > 0 ? round((net / prior) * 100) : null,
    reportPeriod,
    topHolders: top.slice(0, limit),
  };
}

/** A short, user-safe reason from an avFetch failure. Any API key that AV echoes back is redacted. */
export function unavailableReason(err: unknown, key = process.env.ALPHA_VANTAGE_API_KEY || ''): string {
  let msg = err instanceof Error ? err.message : String(err ?? 'unknown error');
  msg = msg.replace(/^AV info error:\s*/i, 'Alpha Vantage: ').replace(/^AV quota exceeded:\s*/i, 'Alpha Vantage rate limit: ');
  if (key) msg = msg.split(key).join('[key]');
  msg = msg.replace(/(API key (?:as|is)\s+)[A-Za-z0-9]+/gi, '$1[key]').replace(/apikey=[^&\s]+/gi, 'apikey=[key]');
  return msg.length > 220 ? `${msg.slice(0, 217)}…` : msg;
}

const OK_TTL = { insider: 6 * 60 * 60_000, congress: 12 * 60 * 60_000, institutional: 12 * 60 * 60_000 } as const;
const FAIL_TTL = 15 * 60_000;
type Kind = keyof typeof OK_TTL;
const cache = new Map<string, { at: number; value: { status: string } }>();
const inflight = new Map<string, Promise<{ status: string }>>();

export function clearOwnershipCache(): void {
  cache.clear();
  inflight.clear();
}

async function cached<T extends { status: string }>(kind: Kind, symbol: string, now: number, load: () => Promise<T>): Promise<T> {
  const k = `${kind}:${symbol}`;
  const hit = cache.get(k);
  if (hit && now - hit.at < (hit.value.status === 'ok' ? OK_TTL[kind] : FAIL_TTL)) return hit.value as T;
  const running = inflight.get(k);
  if (running) return running as Promise<T>;
  const p = load().then((value) => { cache.set(k, { at: now, value }); return value; }).finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

async function callAv(fn: string, symbol: string, key: string, extra = ''): Promise<{ ok: true; data: unknown } | Unavailable> {
  try {
    const data = await avFetch(`https://www.alphavantage.co/query?function=${fn}&symbol=${encodeURIComponent(symbol)}${extra}&apikey=${key}`, `${fn} ${symbol}`);
    if (data == null) return { status: 'unavailable', reason: 'Alpha Vantage has no data for this symbol' };
    return { ok: true, data };
  } catch (e) {
    const reason = unavailableReason(e, key);
    console.warn(`[ownership] ${fn} ${symbol} unavailable: ${reason}`);
    return { status: 'unavailable', reason };
  }
}

export async function getOwnershipContext(rawSymbol: string, opts: { now?: number } = {}): Promise<OwnershipContext> {
  const symbol = rawSymbol.trim().toUpperCase();
  const now = opts.now ?? Date.now();
  const key = process.env.ALPHA_VANTAGE_API_KEY || '';
  if (!key) {
    const u: Unavailable = { status: 'unavailable', reason: 'Alpha Vantage is not configured' };
    return { symbol, insider: u, congress: u, institutional: u };
  }
  const [insider, congress, institutional] = await Promise.all([
    cached('insider', symbol, now, async () => {
      const r = await callAv('INSIDER_TRANSACTIONS', symbol, key, `&from=${ymd(now - 90 * DAY)}`);
      return 'ok' in r ? summarizeInsiderTransactions(r.data, now) : r;
    }),
    cached('congress', symbol, now, async () => {
      const r = await callAv('CONGRESS_TRADES', symbol, key);
      return 'ok' in r ? summarizeCongressTrades(r.data, now) : r;
    }),
    cached('institutional', symbol, now, async () => {
      const r = await callAv('INSTITUTIONAL_HOLDINGS', symbol, key);
      return 'ok' in r ? summarizeInstitutionalHoldings(r.data) : r;
    }),
  ]);
  return { symbol, insider, congress, institutional };
}
