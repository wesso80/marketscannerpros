/**
 * Overnight radar — data collection (read-only). Equities via Alpha Vantage daily-adjusted series
 * (real volume) with DB bar fallback; crypto via CoinGecko markets + market_chart (daily prices+volumes)
 * + /derivatives; catalysts/CRCS/indicators from production worker tables.
 */
import { q } from '../../db';
import { avFetch } from '../../avRateGovernor';
import { avFetchDailyBars, avFetchOverview } from '../../marketData/client';
import { STOCK_SECTOR_MAP } from '../../sectorMap';
import { getCoinCategories, getDerivativesForSymbols, getMarketChartRange, getMarketData } from '../../coingecko';
import type { CoinGeckoMarketData } from '../../coingecko';
import { fetchOptionsSnapshot } from '../../goldenEggFetchers';
import { findUniverseViolations } from '../../universe/assetClass';
import type { AssetClass, Bar, CatalystHit } from './types';
import { budget } from './budget';
import { OVERVIEW_CACHE_KEY, OVERVIEW_TTL_MS, kvGet, kvSet, type OverviewCache } from './store';

export const SECTOR_ETFS: Record<string, string> = { XLK: 'Technology', XLF: 'Financials', XLV: 'Health Care', XLE: 'Energy', XLY: 'Consumer Discretionary', XLP: 'Consumer Staples', XLI: 'Industrials', XLB: 'Materials', XLU: 'Utilities', XLRE: 'Real Estate', XLC: 'Communication Services' };
export const MACRO_PROXIES: Record<string, string> = { SPY: 'S&P 500', QQQ: 'Nasdaq-100', IWM: 'Russell 2000', DIA: 'Dow', GLD: 'Gold', SLV: 'Silver', USO: 'WTI crude (USO)', UNG: 'Nat gas (UNG)', UUP: 'US dollar (UUP)', FXY: 'JPY (FXY)', FXE: 'EUR (FXE)', TLT: '20y+ Treasuries', IEF: '7-10y Treasuries', HYG: 'HY credit', LQD: 'IG credit', CPER: 'Copper (CPER)', DBA: 'Agriculture (DBA)', EEM: 'EM equities', EFA: 'DM ex-US equities', VXX: 'VIX futures (VXX)' };
export const STABLE_OR_WRAPPED = new Set(['USDT', 'USDC', 'DAI', 'USDE', 'FDUSD', 'USDS', 'PYUSD', 'TUSD', 'USD1', 'BUSD', 'USDP', 'GUSD', 'FRAX', 'LUSD', 'USDD', 'CRVUSD', 'GHO', 'RLUSD', 'USDY', 'USD0', 'BUIDL', 'USDX', 'SUSDE', 'SUSDS', 'USDL', 'EURC', 'JPYC', 'JPYSC', 'GYEN', 'EURT', 'EURS', 'XSGD', 'USDB', 'USDA', 'DEUSD', 'SATUSD', 'USDTB', 'USDG', 'BFUSD', 'USDF', 'WBTC', 'WETH', 'STETH', 'WSTETH', 'WEETH', 'CBBTC', 'RETH', 'WBETH', 'EZETH', 'RSETH', 'METH', 'SOLVBTC', 'LBTC', 'TBTC', 'BNSOL', 'JITOSOL', 'MSOL', 'JUPSOL', 'BSOL', 'CBETH', 'WBNB', 'XAUT', 'PAXG', 'LSETH', 'FBTC', 'SUSDT']);

export interface EquityUniverseRow { symbol: string; name: string | null; assetClass: AssetClass; sector: string | null; sectorEtf: string | null }

export async function loadEquityUniverse(): Promise<{ rows: EquityUniverseRow[]; misclassified: string[] }> {
  budget.db++;
  const rows = await q<{ symbol: string; name: string | null; asset_type: string }>(`SELECT symbol, name, asset_type FROM symbol_universe WHERE asset_type IN ('equity', 'etf') AND enabled ORDER BY symbol`);
  // Trust the stored class; only *report* contradictions (fixed at source by migration 100 + tests).
  const misclassified = findUniverseViolations(rows).map((v) => `${v.symbol} (${v.declared}→${v.expected})`);
  const bad = new Set(findUniverseViolations(rows).map((v) => v.symbol));
  const out = new Map<string, EquityUniverseRow>();
  for (const r of rows) {
    const s = r.symbol.toUpperCase();
    if (bad.has(s)) continue;
    const etf = STOCK_SECTOR_MAP[s] ?? null;
    out.set(s, { symbol: s, name: r.name, assetClass: r.asset_type === 'etf' || SECTOR_ETFS[s] || MACRO_PROXIES[s] ? 'etf' : 'equity', sector: etf ? SECTOR_ETFS[etf] ?? null : SECTOR_ETFS[s] ?? null, sectorEtf: etf });
  }
  for (const [s, name] of Object.entries({ ...SECTOR_ETFS, ...MACRO_PROXIES })) if (!out.has(s)) out.set(s, { symbol: s, name, assetClass: 'etf', sector: SECTOR_ETFS[s] ?? null, sectorEtf: null });
  return { rows: [...out.values()], misclassified };
}

/** Build a universe row for a Stage-1 discovered symbol (not in symbol_universe). */
export function expandedRow(symbol: string, name: string | null, isEtf: boolean): EquityUniverseRow {
  const etf = STOCK_SECTOR_MAP[symbol] ?? null;
  return { symbol, name, assetClass: isEtf ? 'etf' : 'equity', sector: etf ? SECTOR_ETFS[etf] ?? null : null, sectorEtf: etf };
}

export interface BarsResult { bars: Bar[]; source: 'alpha_vantage' | 'coingecko' | 'db_bars' | 'none'; hasVolume: boolean }

async function dbDailyBars(symbol: string, limit = 260): Promise<Bar[]> {
  budget.db++;
  const rows = await q<any>(`SELECT ts, open, high, low, close, volume FROM ohlcv_bars WHERE symbol = $1 AND timeframe = 'daily' ORDER BY ts DESC LIMIT $2`, [symbol, limit]);
  return rows.reverse().map((r: any) => ({ date: new Date(r.ts).toISOString().slice(0, 10), open: +r.open, high: +r.high, low: +r.low, close: +r.close, volume: +r.volume }));
}

export async function fetchEquityBars(symbol: string, allowDbFallback = true): Promise<BarsResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      budget.av++;
      const r = await avFetchDailyBars(symbol, false);
      if (r && r.bars.length >= 25) return { bars: r.bars.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })), source: 'alpha_vantage', hasVolume: r.bars.some((b) => b.volume > 0) };
      if (r) break; // real but short series — no point retrying
    } catch { budget.errors++; }
  }
  if (!allowDbFallback) return { bars: [], source: 'none', hasVolume: false };
  try {
    const bars = await dbDailyBars(symbol);
    if (bars.length >= 25) return { bars, source: 'db_bars', hasVolume: false };
  } catch { /* none */ }
  return { bars: [], source: 'none', hasVolume: false };
}

export async function pool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

// ───────────────────────────── Crypto ─────────────────────────────

export interface CryptoMarketRow extends CoinGeckoMarketData {
  price_change_percentage_30d_in_currency?: number;
  ath_change_percentage?: number;
  last_updated?: string;
}

export async function loadCryptoMarkets(perPage = 250): Promise<CryptoMarketRow[]> {
  budget.cg++;
  const rows = (await getMarketData({ per_page: perPage, page: 1, sparkline: true, price_change_percentage: ['1h', '24h', '7d', '30d'] })) as CryptoMarketRow[] | null;
  if (!rows) return [];
  return rows.filter((r) => r.symbol && !STABLE_OR_WRAPPED.has(r.symbol.toUpperCase()) && /^[a-z0-9]{1,15}$/i.test(r.symbol) && Number.isFinite(r.current_price) && r.current_price > 0
    // Heuristic stable/pegged filter: essentially flat over 7d and 30d.
    && !(Math.abs(r.price_change_percentage_7d_in_currency ?? 99) < 0.7 && Math.abs((r as CryptoMarketRow).price_change_percentage_30d_in_currency ?? 99) < 1.5));
}

/** Daily bars from market_chart/range (>90d window → daily granularity), close-only OHLC with real daily volumes. */
export async function fetchCryptoBars(row: CryptoMarketRow, nowMs: number): Promise<BarsResult> {
  try {
    const to = Math.floor(nowMs / 1000), from = to - 130 * 86400;
    budget.cg++;
    const chart = await getMarketChartRange(row.id, from, to);
    if (!chart || chart.prices.length < 25) return { bars: [], source: 'none', hasVolume: false };
    const volByDay = new Map<string, number>();
    for (const [ts, v] of chart.total_volumes) volByDay.set(new Date(ts).toISOString().slice(0, 10), v);
    const bars: Bar[] = [];
    let prevClose: number | null = null;
    for (const [ts, p] of chart.prices) {
      const d = new Date(ts).toISOString().slice(0, 10);
      if (bars.length && bars[bars.length - 1].date === d) { bars[bars.length - 1].close = p; continue; }
      const o = prevClose ?? p;
      bars.push({ date: d, open: o, high: Math.max(o, p), low: Math.min(o, p), close: p, volume: volByDay.get(d) ?? 0 });
      prevClose = p;
    }
    // Replace/append the live bar with CoinGecko's true 24h high/low, live price and 24h volume.
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const live: Bar = { date: today, open: bars[bars.length - 1].date === today ? bars[bars.length - 1].open : bars[bars.length - 1].close, high: row.high_24h ?? row.current_price, low: row.low_24h ?? row.current_price, close: row.current_price, volume: row.total_volume ?? 0 };
    if (bars[bars.length - 1].date === today) bars[bars.length - 1] = live; else bars.push(live);
    return { bars, source: 'coingecko', hasVolume: bars.slice(-21, -1).every((b) => b.volume > 0) };
  } catch { return { bars: [], source: 'none', hasVolume: false }; }
}

export interface DerivAgg { fundingMedianPct: number | null; fundingVenues: number; openInterestUsd: number | null; oiVenues: number }

export async function loadDerivatives(symbols: string[]): Promise<Record<string, DerivAgg>> {
  budget.cg++;
  const perps = await getDerivativesForSymbols(symbols).catch(() => []);
  const by: Record<string, { f: number[]; oi: number }> = {};
  for (const t of perps) {
    const s = t.index_id.toUpperCase();
    const b = (by[s] ??= { f: [], oi: 0 });
    const fr = Number(t.funding_rate); if (Number.isFinite(fr)) b.f.push(fr);
    const oi = Number(t.open_interest); if (Number.isFinite(oi)) b.oi += oi;
  }
  const out: Record<string, DerivAgg> = {};
  for (const [s, b] of Object.entries(by)) {
    const srt = [...b.f].sort((a, c) => a - c);
    out[s] = { fundingMedianPct: srt.length ? srt[Math.floor(srt.length / 2)] : null, fundingVenues: srt.length, openInterestUsd: b.oi || null, oiVenues: srt.length };
  }
  return out;
}

export interface CategoryRow { name: string; id: string; change24h: number; marketCap: number }

export async function loadCategories(): Promise<CategoryRow[]> {
  budget.cg++;
  const cats = await getCoinCategories().catch(() => null);
  return (cats ?? []).filter((c: any) => Number.isFinite(c.market_cap_change_24h) && c.market_cap > 1e9).map((c: any) => ({ name: c.name, id: c.id, change24h: c.market_cap_change_24h, marketCap: c.market_cap }));
}

/** Category membership for the most-moved categories only (1 CoinGecko call per category). */
export async function loadCategoryMembers(cats: CategoryRow[], max = 14): Promise<Record<string, string[]>> {
  const pick = [...cats].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, max);
  const out: Record<string, string[]> = {};
  await pool(pick, 4, async (c) => {
    try {
      budget.cg++;
      const params = new URLSearchParams({ vs_currency: 'usd', category: c.id, per_page: '100', page: '1', order: 'market_cap_desc' });
      const rows = await cgRaw<CoinGeckoMarketData[]>('/coins/markets', params);
      for (const r of rows ?? []) (out[r.symbol.toUpperCase()] ??= []).push(c.name);
    } catch { /* skip */ }
  });
  return out;
}

async function cgRaw<T>(path: string, params: URLSearchParams): Promise<T | null> {
  const key = process.env.COINGECKO_API_KEY || process.env.COINGECKO_PRO_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://pro-api.coingecko.com/api/v3${path}?${params}`, { headers: { 'x-cg-pro-api-key': key }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

// ───────────────────────────── Catalysts / earnings / CRCS / indicators (DB) ─────────────────────────────

export async function loadCatalysts(symbols: string[]): Promise<Record<string, CatalystHit[]>> {
  budget.db++;
  const rows = await q<any>(`SELECT ticker, catalyst_type, headline, event_timestamp_utc, severity, source FROM catalyst_events WHERE ticker = ANY($1) AND event_timestamp_utc BETWEEN NOW() - INTERVAL '3 days' AND NOW() + INTERVAL '7 days' ORDER BY event_timestamp_utc DESC`, [symbols]);
  const out: Record<string, CatalystHit[]> = {};
  for (const r of rows) (out[r.ticker.toUpperCase()] ??= []).push({ type: r.catalyst_type, when: new Date(r.event_timestamp_utc).toISOString(), headline: r.headline, severity: r.severity, source: r.source });
  return out;
}

/** AV EARNINGS_CALENDAR (one CSV call for the whole market, 3-month horizon). */
export async function loadEarningsCalendar(): Promise<Record<string, string>> {
  const key = process.env.ALPHA_VANTAGE_API_KEY; if (!key) return {};
  const url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${key}`;
  try {
    const { avTakeToken } = await import('../../avRateGovernor');
    await avTakeToken(); budget.av++;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    if (!text.startsWith('symbol')) return {};
    const out: Record<string, string> = {};
    for (const line of text.split('\n').slice(1)) { const [sym, , date] = line.split(','); if (sym && date && !out[sym]) out[sym.toUpperCase()] = date.trim(); }
    return out;
  } catch { return {}; }
}

/** Keyed by `${asset_class}:${symbol}` — equity and crypto tickers collide (A, H, …). */
export async function loadCrcs(): Promise<Record<string, { final: number; eligibility: string; deltaVsPrevDay: number | null }>> {
  const [latestTs] = await q<{ computed_at: string }>(`SELECT MAX(computed_at) computed_at FROM crcs_hourly_base`);
  if (!latestTs?.computed_at) return {};
  const [prevTs] = await q<{ computed_at: string }>(`SELECT MAX(computed_at) computed_at FROM crcs_hourly_base WHERE computed_at <= $1::timestamptz - INTERVAL '23 hours'`, [latestTs.computed_at]);
  const rows = await q<any>(`SELECT symbol, asset_class, crcs_final, global_eligibility, computed_at FROM crcs_hourly_base WHERE computed_at IN ($1, $2)`, [latestTs.computed_at, prevTs?.computed_at ?? latestTs.computed_at]);
  const out: Record<string, { final: number; eligibility: string; deltaVsPrevDay: number | null }> = {};
  const prev: Record<string, number> = {};
  for (const r of rows) {
    const cls = r.asset_class === 'crypto' ? 'crypto' : 'equity';
    const s = `${cls}:${String(r.symbol).toUpperCase().replace(/USDT?$/, '')}`;
    if (new Date(r.computed_at).toISOString() === new Date(latestTs.computed_at).toISOString()) out[s] = { final: +r.crcs_final, eligibility: r.global_eligibility, deltaVsPrevDay: null };
    else prev[s] = +r.crcs_final;
  }
  for (const s of Object.keys(out)) if (prev[s] !== undefined && prevTs?.computed_at) out[s].deltaVsPrevDay = out[s].final - prev[s];
  return out;
}

export async function loadIndicatorsDb(symbols: string[]): Promise<Record<string, { ema200: number | null; adx14: number | null; rsi14: number | null; inSqueeze: boolean | null; computedAt: string }>> {
  const rows = await q<any>(`SELECT symbol, ema200, adx14, rsi14, in_squeeze, computed_at FROM indicators_latest WHERE timeframe = 'daily' AND symbol = ANY($1)`, [symbols]);
  const out: Record<string, any> = {};
  for (const r of rows) out[r.symbol.toUpperCase()] = { ema200: r.ema200 === null ? null : +r.ema200, adx14: r.adx14 === null ? null : +r.adx14, rsi14: r.rsi14 === null ? null : +r.rsi14, inSqueeze: r.in_squeeze, computedAt: new Date(r.computed_at).toISOString() };
  return out;
}

// ───────────────────────────── Deep-dive fetchers (bounded) ─────────────────────────────

export async function fetchOverview(symbol: string) {
  try { budget.av++; const r = await avFetchOverview(symbol); if (!r) return null; const o = r.overview; return { sector: o.sector, industry: o.industry, marketCap: o.marketCap, beta: o.beta, high52w: o.high52w, low52w: o.low52w, name: o.name }; } catch { budget.errors++; return null; }
}

/**
 * Sector/industry for equities via a persisted AV OVERVIEW cache (30-day TTL), topped up with a
 * bounded number of new fetches per run so the whole universe gets covered over a few nights.
 */
export async function loadOverviewCache(symbols: string[], nowMs: number, fetchBudget: number, log: (m: string) => void): Promise<{ cache: OverviewCache; fetched: number; missing: number; fromDb: number }> {
  const cache = (await kvGet<OverviewCache>(OVERVIEW_CACHE_KEY)) ?? {};
  const stale = (s: string) => { const e = cache[s]; return !e || nowMs - Date.parse(e.fetchedAt) > OVERVIEW_TTL_MS; };
  // Free first source: production company_overview (filled by the refresh-fundamentals cron when it runs).
  let fromDb = 0;
  try {
    const want = symbols.filter(stale);
    if (want.length) {
      budget.db++;
      const rows = await q<any>(`SELECT symbol, name, sector, industry, market_cap, beta, high_52w, low_52w, fetched_at FROM company_overview WHERE symbol = ANY($1) AND fetched_at > NOW() - INTERVAL '30 days'`, [want]);
      for (const r of rows) { cache[r.symbol] = { sector: r.sector, industry: r.industry, marketCap: r.market_cap === null ? null : +r.market_cap, beta: r.beta === null ? null : +r.beta, high52w: r.high_52w === null ? null : +r.high_52w, low52w: r.low_52w === null ? null : +r.low_52w, name: r.name, fetchedAt: new Date(r.fetched_at).toISOString() }; fromDb++; }
    }
  } catch { budget.errors++; }
  const need = symbols.filter(stale);
  const todo = need.slice(0, fetchBudget);
  log(`overview cache: ${symbols.length - need.length}/${symbols.length} cached (${fromDb} seeded from company_overview); fetching ${todo.length} of ${need.length} missing (budget ${fetchBudget})`);
  let fetched = 0;
  await pool(todo, 6, async (s) => {
    const o = await fetchOverview(s);
    // Cache misses too (as nulls) so unknown symbols are not re-fetched every night.
    cache[s] = { sector: o?.sector ?? null, industry: o?.industry ?? null, marketCap: o?.marketCap ?? null, beta: o?.beta ?? null, high52w: o?.high52w ?? null, low52w: o?.low52w ?? null, name: o?.name ?? null, fetchedAt: new Date(nowMs).toISOString() };
    if (o) fetched++;
  });
  if (todo.length || fromDb) await kvSet(OVERVIEW_CACHE_KEY, cache);
  return { cache, fetched, missing: need.length - todo.length, fromDb };
}

export async function fetchNews48h(symbol: string, nowMs: number, name: string | null) {
  const key = process.env.ALPHA_VANTAGE_API_KEY; if (!key) return null;
  const from = new Date(nowMs - 48 * 3600e3).toISOString().replace(/[-:]/g, '').slice(0, 13);
  try {
    budget.av++;
    const json = await avFetch<any>(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(symbol)}&time_from=${from}&sort=LATEST&limit=50&apikey=${key}`, `NEWS ${symbol}`);
    const feed: any[] = json?.feed ?? [];
    if (!json || !Array.isArray(json.feed)) return null;
    const rel = feed.map((a) => ({ a, t: (a.ticker_sentiment ?? []).find((x: any) => x.ticker?.toUpperCase() === symbol.toUpperCase()) })).filter((x) => x.t && Number(x.t.relevance_score) >= 0.5);
    const named = rel.filter((x) => headlineNames(String(x.a.title ?? ''), symbol, name));
    const scores = rel.map((x) => Number(x.t.ticker_sentiment_score)).filter(Number.isFinite);
    const top = (named[0] ?? rel[0])?.a;
    return { count48h: rel.length, namedCount48h: named.length, avgSentiment: scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : null, topHeadline: top?.title ?? null, topSource: top?.source ?? null, publishedAt: top?.time_published ? `${top.time_published.slice(0, 4)}-${top.time_published.slice(4, 6)}-${top.time_published.slice(6, 8)}T${top.time_published.slice(9, 11)}:${top.time_published.slice(11, 13)}Z` : null };
  } catch { return null; }
}

/** True when the headline actually names the company/ticker (vs. an incidental provider tag). */
export function headlineNames(headline: string, symbol: string, name: string | null): boolean {
  // 13F / insider-filing boilerplate names the holder, not a catalyst for the holder.
  if (/\b(buys new shares|takes position|acquires \d|sells \d|has \$[\d.]+ (million|billion) (stake|position)|holdings? (in|of) .* (lifted|lowered|trimmed|boosted)|purchases? \d[\d,]* shares)\b/i.test(headline)) return false;
  const h = headline.toLowerCase();
  if (new RegExp(`(^|[^a-z])\\$?${symbol.toLowerCase()}([^a-z]|$)`).test(h)) return true;
  const first = (name ?? '').split(/[\s,.]+/).filter((w) => w.length > 2 && !/^(inc|corp|the|group|co|ltd|plc|holdings|company)$/i.test(w))[0];
  return !!first && h.includes(first.toLowerCase());
}

export async function fetchOptions(symbol: string, price: number) {
  try { budget.av += 2; const o = await fetchOptionsSnapshot(symbol, price); return o ? { putCallRatio: o.putCallRatio, ivRank: o.ivRank, unusualActivity: o.unusualActivity, sentiment: o.sentiment, dealerGamma: o.dealerGamma } : null; } catch { budget.errors++; return null; }
}
