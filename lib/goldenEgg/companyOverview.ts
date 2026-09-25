import { valuationAtPrice } from '@/lib/market/valuationIntegrity';
/**
 * Shared, cached equity fundamentals access so Golden Egg, Deep Analyst and the Fundamentals tab read the SAME
 * Alpha Vantage OVERVIEW / EARNINGS / EARNINGS_CALENDAR snapshot for a symbol.
 */
import { avFetch, avTakeToken } from '@/lib/avRateGovernor';
import { getQuote } from '@/lib/onDemandFetch';
import { describeMultiple, periodLabels, parseEarningsCalendarCsv, nextEarningsFromCalendar, daysUntil, type EarningsCalendarRow } from './fundamentalsContext';

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';
const OVERVIEW_TTL = 6 * 60 * 60_000;
const EARNINGS_TTL = 6 * 60 * 60_000;
const CALENDAR_TTL = 12 * 60 * 60_000;

const overviewCache = new Map<string, { ts: number; data: Record<string, any> | null }>();
const earningsCache = new Map<string, { ts: number; data: EarningsHistory | null }>();
const calendarCache = new Map<string, { ts: number; data: EarningsCalendarRow | null }>();

const numOrNull = (v: unknown): number | null => { if (v == null || v === 'None' || v === '-' || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

export async function getCompanyOverviewRaw(symbol: string): Promise<Record<string, any> | null> {
  const key = symbol.toUpperCase();
  const hit = overviewCache.get(key);
  if (hit && Date.now() - hit.ts < OVERVIEW_TTL) return hit.data;
  if (!AV_KEY) return null;
  const data = await avFetch<Record<string, any>>(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(key)}&apikey=${AV_KEY}`, `OVERVIEW ${key}`);
  const ok = data && data.Symbol && !data['Error Message'] && !data.Note && !data.Information ? data : null;
  if (ok) overviewCache.set(key, { ts: Date.now(), data: ok });
  return ok;
}

export interface EarningsQuarter { fiscalDateEnding: string; reportedDate: string | null; reportedEPS: number | null; estimatedEPS: number | null; surprise: number | null; surprisePercent: number | null; beat: boolean | null }
export interface EarningsHistory { recentQuarters: EarningsQuarter[]; beatRate: number | null; lastReported: EarningsQuarter | null; annualEPS: Array<{ fiscalYear: string; eps: number | null }> }

export async function getEarningsHistory(symbol: string): Promise<EarningsHistory | null> {
  const key = symbol.toUpperCase();
  const hit = earningsCache.get(key);
  if (hit && Date.now() - hit.ts < EARNINGS_TTL) return hit.data;
  if (!AV_KEY) return null;
  const data = await avFetch<any>(`https://www.alphavantage.co/query?function=EARNINGS&symbol=${encodeURIComponent(key)}&apikey=${AV_KEY}`, `EARNINGS ${key}`);
  if (!data?.quarterlyEarnings && !data?.annualEarnings) { earningsCache.set(key, { ts: Date.now(), data: null }); return null; }
  const recentQuarters: EarningsQuarter[] = (data.quarterlyEarnings ?? []).slice(0, 4).map((q: any) => {
    const rep = numOrNull(q.reportedEPS), est = numOrNull(q.estimatedEPS);
    return { fiscalDateEnding: q.fiscalDateEnding, reportedDate: q.reportedDate ?? null, reportedEPS: rep, estimatedEPS: est, surprise: rep != null && est != null ? rep - est : null, surprisePercent: numOrNull(q.surprisePercentage), beat: rep != null && est != null ? rep > est : null };
  });
  const beats = recentQuarters.filter((q) => q.beat === true).length;
  const out: EarningsHistory = {
    recentQuarters,
    beatRate: recentQuarters.length ? (beats / recentQuarters.length) * 100 : null,
    lastReported: recentQuarters[0] ?? null,
    annualEPS: (data.annualEarnings ?? []).slice(0, 3).map((a: any) => ({ fiscalYear: String(a.fiscalDateEnding ?? '').split('-')[0], eps: numOrNull(a.reportedEPS) })),
  };
  earningsCache.set(key, { ts: Date.now(), data: out });
  return out;
}

/** SCHEDULED = a report inside the 3-month horizon; NONE_IN_HORIZON = the calendar loaded and lists none;
 *  UNKNOWN = the calendar could not be read (no key, provider error / rate-limit JSON, network). UNKNOWN must never be
 *  shown as "not scheduled". */
export type NextEarningsStatus = 'SCHEDULED' | 'NONE_IN_HORIZON' | 'UNKNOWN';

export async function getNextEarningsWithStatus(symbol: string): Promise<{ status: NextEarningsStatus; row: EarningsCalendarRow | null }> {
  const key = symbol.toUpperCase();
  const hit = calendarCache.get(key);
  if (hit && Date.now() - hit.ts < CALENDAR_TTL) return { status: hit.data ? 'SCHEDULED' : 'NONE_IN_HORIZON', row: hit.data };
  if (!AV_KEY) return { status: 'UNKNOWN', row: null };
  try {
    await avTakeToken();
    const res = await fetch(`https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${encodeURIComponent(key)}&horizon=3month&apikey=${AV_KEY}`);
    const text = await res.text();
    // A JSON body is a provider note / error (e.g. rate limit), not an empty calendar: do not cache it as "none".
    if (!res.ok || text.trim().startsWith('{')) return { status: 'UNKNOWN', row: null };
    const row = nextEarningsFromCalendar(parseEarningsCalendarCsv(text), key);
    calendarCache.set(key, { ts: Date.now(), data: row });
    return { status: row ? 'SCHEDULED' : 'NONE_IN_HORIZON', row };
  } catch {
    return { status: 'UNKNOWN', row: null };
  }
}

/** Next scheduled report from EARNINGS_CALENDAR (CSV, 3-month horizon). null = none scheduled OR unknown; use
 *  `getNextEarningsWithStatus` when the difference matters. */
export async function getNextEarnings(symbol: string): Promise<EarningsCalendarRow | null> {
  return (await getNextEarningsWithStatus(symbol)).row;
}

export interface FundamentalsSummary {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  pe: number | null;
  sharesOutstanding?: number | null;
  dividendYield?: number | null;
  valuationBasis?: string;
  forwardPe: number | null;
  peg: number | null;
  eps: number | null;
  revenueTtm: number | null;
  profitMargin: number | null;
  revenueGrowthYoy: number | null;
  earningsGrowthYoy: number | null;
  analystTarget: number | null;
  analystCount: number | null;
  ratings: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number } | null;
  multiple: ReturnType<typeof describeMultiple>;
  period: ReturnType<typeof periodLabels>;
  nextEarningsDate: string | null;
  /** SCHEDULED / NONE_IN_HORIZON / UNKNOWN (calendar unreadable). Optional for older cached payloads. */
  nextEarningsStatus?: NextEarningsStatus;
  daysToEarnings: number | null;
  lastReportedQuarter: string | null;
  lastEpsBeat: boolean | null;
  currentPrice: number | null;
  fetchedAt: string;
}

/** Compact, canonical fundamentals block for the Golden Egg packet and Deep Analyst. */
export async function getFundamentalsSummary(symbol: string, opts: { includeEarnings?: boolean } = {}): Promise<FundamentalsSummary | null> {
  const raw = await getCompanyOverviewRaw(symbol);
  if (!raw) return null;
  const [earnings, next, quote] = await Promise.all([
    opts.includeEarnings === false ? null : getEarningsHistory(symbol).catch(() => null),
    opts.includeEarnings === false ? null : getNextEarningsWithStatus(symbol).catch(() => ({ status: 'UNKNOWN' as const, row: null })),
    getQuote(symbol).catch(() => null),
  ]);
  const valuation = valuationAtPrice(quote?.price, raw.EPS, raw.SharesOutstanding, raw.MarketCapitalization);
  const pe = valuation.pe, fwd = numOrNull(raw.ForwardPE), peg = numOrNull(raw.PEGRatio);
  const ratings = { strongBuy: Number(raw.AnalystRatingStrongBuy) || 0, buy: Number(raw.AnalystRatingBuy) || 0, hold: Number(raw.AnalystRatingHold) || 0, sell: Number(raw.AnalystRatingSell) || 0, strongSell: Number(raw.AnalystRatingStrongSell) || 0 };
  const analystCount = ratings.strongBuy + ratings.buy + ratings.hold + ratings.sell + ratings.strongSell;
  const nextDate = next?.row?.reportDate ?? null;
  return {
    symbol: raw.Symbol,
    name: raw.Name ?? null,
    sector: raw.Sector ?? null,
    industry: raw.Industry ?? null,
    marketCap: valuation.marketCap,
    sharesOutstanding: numOrNull(raw.SharesOutstanding),
    dividendYield: numOrNull(raw.DividendYield),
    valuationBasis: valuation.basis,
    pe, forwardPe: fwd, peg,
    eps: numOrNull(raw.EPS),
    revenueTtm: numOrNull(raw.RevenueTTM),
    profitMargin: numOrNull(raw.ProfitMargin),
    revenueGrowthYoy: numOrNull(raw.QuarterlyRevenueGrowthYOY),
    earningsGrowthYoy: numOrNull(raw.QuarterlyEarningsGrowthYOY),
    analystTarget: numOrNull(raw.AnalystTargetPrice),
    analystCount: analystCount || null,
    ratings: analystCount ? ratings : null,
    multiple: describeMultiple(pe, fwd, peg),
    period: periodLabels(raw),
    nextEarningsDate: nextDate,
    nextEarningsStatus: next?.status ?? 'UNKNOWN',
    daysToEarnings: daysUntil(nextDate),
    lastReportedQuarter: earnings?.lastReported?.fiscalDateEnding ?? raw.LatestQuarter ?? null,
    lastEpsBeat: earnings?.lastReported?.beat ?? null,
    currentPrice: quote?.price ?? null,
    fetchedAt: new Date().toISOString(),
  };
}
