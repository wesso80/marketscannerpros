/**
 * MV-6: Alpha Vantage ETF_PROFILE (https://www.alphavantage.co/documentation/#etf-profile), GET function=ETF_PROFILE&symbol=XLK.
 *   → { net_assets, net_expense_ratio, portfolio_turnover, dividend_yield, inception_date, last_updated, leveraged,
 *       sectors: [{ sector, weight }], holdings: [{ symbol, description, weight }] }  (weights are fractions, as strings)
 * Used for the sector ETFs on Markets & sectors (top holdings + sector weights). Goes through the shared AV rate governor;
 * only the compact summary is cached (12 h, 15 min after a failure). Holdings change slowly (AV refreshes them daily).
 */
import { avFetch } from '@/lib/avRateGovernor';

export interface EtfHolding { symbol: string; name: string; weightPct: number }
export interface EtfSectorWeight { sector: string; weightPct: number }
export interface EtfProfileSummary {
  status: 'ok';
  symbol: string;
  netAssets: number | null;
  expenseRatioPct: number | null;
  dividendYieldPct: number | null;
  inceptionDate: string | null;
  lastUpdated: string | null;
  leveraged: boolean | null;
  sectors: EtfSectorWeight[];
  topHoldings: EtfHolding[];
  holdingsCount: number;
  topHoldingsWeightPct: number | null;
}
export type EtfProfileUnavailable = { status: 'unavailable'; symbol: string; reason: string };
export type EtfProfileResult = EtfProfileSummary | EtfProfileUnavailable;

const num = (v: unknown): number | null => {
  if (v == null || v === '' || v === 'n/a' || v === 'None') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const pct = (fraction: number | null, d = 2) => (fraction == null ? null : Math.round(fraction * 100 * 10 ** d) / 10 ** d);
const SMALL = new Set(['and', 'of', 'the', '&']);
/** "INFORMATION TECHNOLOGY" → "Information Technology". */
export const titleCase = (s: string) =>
  s.toLowerCase().split(/\s+/).filter(Boolean).map((w, i) => (i > 0 && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ');

export function summarizeEtfProfile(symbol: string, payload: unknown, topN = 10): EtfProfileResult {
  const p = payload as Record<string, unknown> | null;
  const sym = symbol.toUpperCase();
  if (!p || (!Array.isArray(p.holdings) && !Array.isArray(p.sectors))) return { status: 'unavailable', symbol: sym, reason: 'Alpha Vantage returned no ETF profile for this symbol' };
  const sectors: EtfSectorWeight[] = ((p.sectors as Array<Record<string, unknown>>) ?? [])
    .map((s) => ({ sector: titleCase(String(s?.sector ?? '')), weightPct: pct(num(s?.weight), 1) ?? 0 }))
    .filter((s) => s.sector && s.weightPct > 0)
    .sort((a, b) => b.weightPct - a.weightPct);
  const holdings: EtfHolding[] = ((p.holdings as Array<Record<string, unknown>>) ?? [])
    .map((h) => ({ symbol: String(h?.symbol ?? '').trim().toUpperCase(), name: String(h?.description ?? '').trim(), weightPct: pct(num(h?.weight)) ?? 0 }))
    .filter((h) => (h.symbol || h.name) && h.weightPct > 0)
    .sort((a, b) => b.weightPct - a.weightPct);
  const top = holdings.slice(0, topN);
  const lev = typeof p.leveraged === 'string' ? p.leveraged.toUpperCase() : null;
  return {
    status: 'ok', symbol: sym,
    netAssets: num(p.net_assets),
    expenseRatioPct: pct(num(p.net_expense_ratio)),
    dividendYieldPct: pct(num(p.dividend_yield)),
    inceptionDate: typeof p.inception_date === 'string' ? p.inception_date : null,
    lastUpdated: typeof p.last_updated === 'string' ? p.last_updated : null,
    leveraged: lev === 'YES' ? true : lev === 'NO' ? false : null,
    sectors,
    topHoldings: top,
    holdingsCount: holdings.length,
    topHoldingsWeightPct: top.length ? Math.round(top.reduce((a, h) => a + h.weightPct, 0) * 10) / 10 : null,
  };
}

/** Short, user-safe reason from an avFetch failure; any API key AV echoes back is redacted. */
export function etfUnavailableReason(err: unknown, key = process.env.ALPHA_VANTAGE_API_KEY || ''): string {
  let msg = err instanceof Error ? err.message : String(err ?? 'unknown error');
  msg = msg.replace(/^AV info error:\s*/i, 'Alpha Vantage: ').replace(/^AV quota exceeded:\s*/i, 'Alpha Vantage rate limit: ');
  if (key) msg = msg.split(key).join('[key]');
  msg = msg.replace(/(API key (?:as|is)\s+)[A-Za-z0-9]+/gi, '$1[key]').replace(/apikey=[^&\s]+/gi, 'apikey=[key]');
  return msg.length > 220 ? `${msg.slice(0, 217)}…` : msg;
}

const OK_TTL = 12 * 60 * 60_000;
const FAIL_TTL = 15 * 60_000;
const cache = new Map<string, { at: number; value: EtfProfileResult }>();
const inflight = new Map<string, Promise<EtfProfileResult>>();

export function clearEtfProfileCache(): void {
  cache.clear();
  inflight.clear();
}

export async function getEtfProfileCached(rawSymbol: string, opts: { now?: number } = {}): Promise<EtfProfileResult> {
  const symbol = rawSymbol.trim().toUpperCase();
  const now = opts.now ?? Date.now();
  const key = process.env.ALPHA_VANTAGE_API_KEY || '';
  if (!key) return { status: 'unavailable', symbol, reason: 'Alpha Vantage is not configured' };
  const hit = cache.get(symbol);
  if (hit && now - hit.at < (hit.value.status === 'ok' ? OK_TTL : FAIL_TTL)) return hit.value;
  const running = inflight.get(symbol);
  if (running) return running;
  const p = (async (): Promise<EtfProfileResult> => {
    try {
      const data = await avFetch(`https://www.alphavantage.co/query?function=ETF_PROFILE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`, `ETF_PROFILE ${symbol}`);
      if (data == null) return { status: 'unavailable', symbol, reason: 'Alpha Vantage has no ETF profile for this symbol' };
      return summarizeEtfProfile(symbol, data);
    } catch (e) {
      const reason = etfUnavailableReason(e, key);
      console.warn(`[etfProfile] ETF_PROFILE ${symbol} unavailable: ${reason}`);
      return { status: 'unavailable', symbol, reason };
    }
  })().then((value) => { cache.set(symbol, { at: now, value }); return value; }).finally(() => inflight.delete(symbol));
  inflight.set(symbol, p);
  return p;
}
