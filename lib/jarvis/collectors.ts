/**
 * Private Jarvis — data collectors.
 *
 * READ ONLY. Every collector wraps an EXISTING canonical service or persisted
 * worker table and returns a Dataset envelope with provenance. Nothing here
 * recomputes indicators or scores; aggregation is limited to counting/ranking
 * values that production already produced.
 */
import { q } from '../db';
import { avFetch } from '../avRateGovernor';
import { getAggregatedOpenInterest, getCoinCategories, getDerivativesForSymbols, getGlobalData, getMarketData } from '../coingecko';
import { buildCalendarFeed, type CalendarFeed } from '../macro/calendar/feed';
import { ALL_COUNTRIES } from '../macro/calendar/countries';
import { ALL_FOCUS_ASSETS } from '../macro/calendar/relevance';
import type {
  BreadthAggregate,
  CrcsRow,
  CryptoSnapshot,
  Dataset,
  DerivativesDbRow,
  Environment,
  Freshness,
  IndicatorRow,
  IntelligenceBundle,
  MacroSeriesPoint,
  MicroRegimeRow,
  QuoteRow,
  RegimeSnapshotRow,
  SectorPerf,
} from './types';

const PROD_BASE = process.env.JARVIS_PROD_BASE ?? 'https://marketscannerpros.app';

export const KEY_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'GLD', 'SLV', 'XLE', 'XLF', 'BTC', 'ETH'] as const;

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** pg returns DATE columns as JS Date objects; normalise to YYYY-MM-DD. */
function isoDay(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

function ageMinutes(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.round((nowMs - t) / 60_000)) : null;
}

function freshnessByAge(age: number | null, liveMax: number, delayedMax: number): Freshness {
  if (age === null) return 'MISSING';
  if (age <= liveMax) return 'LIVE';
  if (age <= delayedMax) return 'DELAYED';
  return 'STALE';
}

function envelope<T>(args: {
  key: string; label: string; provider: string; environment: Environment; critical: boolean;
  observedAt: string | null; updatedAt?: string | null; nowMs: number; liveMax: number; delayedMax: number;
  coverage: string; data: T | null; warnings?: string[]; freshnessOverride?: Freshness; confidencePenalty?: number;
}): Dataset<T> {
  const age = ageMinutes(args.updatedAt ?? args.observedAt, args.nowMs);
  let freshness: Freshness = args.data === null ? 'MISSING' : freshnessByAge(age, args.liveMax, args.delayedMax);
  if (args.freshnessOverride && args.data !== null) freshness = args.freshnessOverride;
  const base = freshness === 'LIVE' ? 90 : freshness === 'DELAYED' ? 75 : freshness === 'PARTIAL' ? 60 : freshness === 'PROXY' ? 55 : freshness === 'STALE' ? 30 : freshness === 'CONFLICT' ? 40 : 0;
  return {
    key: args.key, label: args.label, provider: args.provider, environment: args.environment,
    observedAt: args.observedAt, updatedAt: args.updatedAt ?? args.observedAt, ageMinutes: age, freshness,
    coverage: args.coverage, confidence: Math.max(0, base - (args.confidencePenalty ?? 0)), critical: args.critical,
    warnings: args.warnings ?? [], data: args.data,
  };
}

function missing<T>(key: string, label: string, provider: string, critical: boolean, reason: string): Dataset<T> {
  return { key, label, provider, environment: 'NONE', observedAt: null, updatedAt: null, ageMinutes: null, freshness: 'MISSING', coverage: 'none', confidence: 0, critical, warnings: [reason], data: null };
}

async function safe<T>(fn: () => Promise<Dataset<T>>, fallback: (err: string) => Dataset<T>): Promise<Dataset<T>> {
  try {
    return await fn();
  } catch (err) {
    return fallback(err instanceof Error ? err.message : String(err));
  }
}

// ───────────────────────────── Regime (UPE worker snapshots) ─────────────────────────────

export async function collectRegime(nowMs: number): Promise<Dataset<{ latest: RegimeSnapshotRow; previousDay: RegimeSnapshotRow | null; history: RegimeSnapshotRow[] }>> {
  return safe(async () => {
    const rows = await q<any>(`SELECT id, snapshot_type, regime, capital_mode, volatility_state, liquidity_state, adaptive_confidence, components_json, created_at FROM global_regime_snapshots ORDER BY created_at DESC LIMIT 12`);
    if (!rows.length) return missing('regime', 'Global regime (UPE)', 'global_regime_snapshots', true, 'no rows');
    const map = (r: any): RegimeSnapshotRow => ({ id: r.id, snapshot_type: r.snapshot_type, regime: r.regime, capital_mode: r.capital_mode, volatility_state: r.volatility_state, liquidity_state: r.liquidity_state, adaptive_confidence: num(r.adaptive_confidence) ?? 0, components: r.components_json ?? {}, created_at: new Date(r.created_at).toISOString() });
    const history = rows.map(map);
    const latest = history[0];
    const cutoff = Date.parse(latest.created_at) - 20 * 3_600_000;
    const previousDay = history.find((h) => h.snapshot_type === latest.snapshot_type && Date.parse(h.created_at) <= cutoff) ?? null;
    return envelope({ key: 'regime', label: 'Global regime (UPE worker)', provider: 'global_regime_snapshots (quotes_latest breadth/vol/volume)', environment: 'PRODUCTION_DB', critical: true, observedAt: latest.created_at, nowMs, liveMax: 12 * 60, delayedMax: 30 * 60, coverage: `${num(latest.components.equitiesCount) ?? '?'} equities`, data: { latest, previousDay, history } });
  }, (e) => missing('regime', 'Global regime (UPE)', 'global_regime_snapshots', true, e));
}

export async function collectMicroRegime(nowMs: number): Promise<Dataset<{ latest: MicroRegimeRow[]; previousDay: MicroRegimeRow[] }>> {
  return safe(async () => {
    const rows = await q<any>(`SELECT asset_class, micro_state, components_json, computed_at FROM micro_regime_snapshots WHERE computed_at >= NOW() - INTERVAL '30 hours' ORDER BY computed_at DESC`);
    if (!rows.length) return missing('microRegime', 'Micro regime (UPE hourly)', 'micro_regime_snapshots', false, 'no rows in 30h');
    const map = (r: any): MicroRegimeRow => ({ asset_class: r.asset_class, micro_state: r.micro_state, breadthPercent: num(r.components_json?.breadthPercent), avgAbsMove: num(r.components_json?.avgAbsMove), symbolCount: num(r.components_json?.symbolCount), computed_at: new Date(r.computed_at).toISOString() });
    const all = rows.map(map);
    const latestTs = all[0].computed_at;
    const latest = all.filter((r) => r.computed_at === latestTs);
    const prevCut = Date.parse(latestTs) - 23 * 3_600_000;
    const prevTs = all.find((r) => Date.parse(r.computed_at) <= prevCut)?.computed_at;
    const previousDay = prevTs ? all.filter((r) => r.computed_at === prevTs) : [];
    return envelope({ key: 'microRegime', label: 'Micro regime by asset class (UPE hourly)', provider: 'micro_regime_snapshots', environment: 'PRODUCTION_DB', critical: false, observedAt: latestTs, nowMs, liveMax: 120, delayedMax: 360, coverage: latest.map((l) => `${l.asset_class}:${l.symbolCount}`).join(', '), data: { latest, previousDay } });
  }, (e) => missing('microRegime', 'Micro regime (UPE hourly)', 'micro_regime_snapshots', false, e));
}

// ───────────────────────────── Quotes / breadth / indicators (worker tables) ─────────────────────────────

export async function collectQuotes(nowMs: number): Promise<Dataset<{ key: Record<string, QuoteRow>; breadth: BreadthAggregate[]; equityAsOf: string | null; cryptoAsOf: string | null }>> {
  return safe(async () => {
    const rows = await q<any>(`SELECT ql.symbol, su.asset_type, ql.price, ql.change_percent, ql.volume, ql.latest_trading_day, ql.fetched_at FROM quotes_latest ql LEFT JOIN symbol_universe su ON su.symbol = ql.symbol WHERE su.enabled = TRUE OR ql.symbol = ANY($1)`, [[...KEY_SYMBOLS]]);
    const quotes: QuoteRow[] = rows.map((r: any) => ({ symbol: r.symbol, asset_type: r.asset_type, price: num(r.price) ?? 0, change_percent: num(r.change_percent) ?? 0, volume: num(r.volume) ?? 0, latest_trading_day: r.latest_trading_day ? isoDay(r.latest_trading_day) : null, fetched_at: new Date(r.fetched_at).toISOString() }));
    const key: Record<string, QuoteRow> = {};
    for (const s of KEY_SYMBOLS) { const row = quotes.find((x) => x.symbol === s); if (row) key[s] = row; }
    const breadth: BreadthAggregate[] = [];
    let equityAsOf: string | null = null, cryptoAsOf: string | null = null;
    for (const cls of ['equity', 'crypto'] as const) {
      const set = quotes.filter((x) => x.asset_type === cls);
      if (!set.length) continue;
      const advancing = set.filter((x) => x.change_percent > 0).length;
      const declining = set.filter((x) => x.change_percent < 0).length;
      const avgAbs = set.reduce((s, x) => s + Math.abs(x.change_percent), 0) / set.length;
      breadth.push({ assetClass: cls, total: set.length, advancing, declining, breadthPct: Math.round((advancing / set.length) * 1000) / 10, avgAbsChange: Math.round(avgAbs * 100) / 100 });
      const maxFetched = set.reduce((m, x) => (x.fetched_at > m ? x.fetched_at : m), '');
      if (cls === 'equity') equityAsOf = maxFetched; else cryptoAsOf = maxFetched;
    }
    const observedAt = equityAsOf ?? cryptoAsOf;
    const missingKeys = KEY_SYMBOLS.filter((s) => !key[s]);
    return envelope({ key: 'quotes', label: 'Quotes + breadth (worker)', provider: 'quotes_latest/symbol_universe (Alpha Vantage + CoinGecko via worker)', environment: 'PRODUCTION_DB', critical: true, observedAt, nowMs, liveMax: 16 * 60, delayedMax: 30 * 60, coverage: breadth.map((b) => `${b.assetClass}:${b.total}`).join(', '), data: { key, breadth, equityAsOf, cryptoAsOf }, warnings: missingKeys.length ? [`Key symbols not in universe: ${missingKeys.join(', ')}`] : [] });
  }, (e) => missing('quotes', 'Quotes + breadth (worker)', 'quotes_latest', true, e));
}

export async function collectIndicators(nowMs: number, symbols: string[]): Promise<Dataset<Record<string, IndicatorRow>>> {
  return safe(async () => {
    const rows = await q<any>(`SELECT symbol, rsi14, adx14, macd_hist, ema20, ema50, ema200, bb_upper, bb_lower, atr14, natr14, roc12, in_squeeze, computed_at FROM indicators_latest WHERE timeframe = 'daily' AND symbol = ANY($1)`, [symbols]);
    const out: Record<string, IndicatorRow> = {};
    let latest: string | null = null;
    for (const r of rows) {
      const computed = new Date(r.computed_at).toISOString();
      if (!latest || computed > latest) latest = computed;
      out[r.symbol] = { symbol: r.symbol, rsi14: num(r.rsi14), adx14: num(r.adx14), macd_hist: num(r.macd_hist), ema20: num(r.ema20), ema50: num(r.ema50), ema200: num(r.ema200), bb_upper: num(r.bb_upper), bb_lower: num(r.bb_lower), atr14: num(r.atr14), natr14: num(r.natr14), roc12: num(r.roc12), in_squeeze: typeof r.in_squeeze === 'boolean' ? r.in_squeeze : null, computed_at: computed };
    }
    return envelope({ key: 'indicators', label: 'Daily indicators (worker)', provider: 'indicators_latest (lib/scanner-indicators via worker)', environment: 'PRODUCTION_DB', critical: false, observedAt: latest, nowMs, liveMax: 16 * 60, delayedMax: 30 * 60, coverage: `${rows.length}/${symbols.length} symbols`, data: rows.length ? out : null });
  }, (e) => missing('indicators', 'Daily indicators (worker)', 'indicators_latest', false, e));
}

// ───────────────────────────── Sectors (same AV SECTOR endpoint as /api/sectors/heatmap) ─────────────────────────────

const SECTOR_MAP: Array<{ name: string; key: string; etf: string }> = [
  { name: 'Technology', key: 'Information Technology', etf: 'XLK' }, { name: 'Financials', key: 'Financials', etf: 'XLF' },
  { name: 'Healthcare', key: 'Health Care', etf: 'XLV' }, { name: 'Energy', key: 'Energy', etf: 'XLE' },
  { name: 'Consumer Discretionary', key: 'Consumer Discretionary', etf: 'XLY' }, { name: 'Consumer Staples', key: 'Consumer Staples', etf: 'XLP' },
  { name: 'Industrials', key: 'Industrials', etf: 'XLI' }, { name: 'Materials', key: 'Materials', etf: 'XLB' },
  { name: 'Utilities', key: 'Utilities', etf: 'XLU' }, { name: 'Real Estate', key: 'Real Estate', etf: 'XLRE' },
  { name: 'Communication Services', key: 'Communication Services', etf: 'XLC' },
];

export async function collectSectors(nowMs: number): Promise<Dataset<SectorPerf[]>> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return missing('sectors', 'Sector performance', 'Alpha Vantage SECTOR', true, 'ALPHA_VANTAGE_API_KEY not set');
  return safe(async () => {
    const data = await avFetch<any>(`https://www.alphavantage.co/query?function=SECTOR&apikey=${apiKey}`, 'JARVIS SECTOR');
    const rt = data?.['Rank A: Real-Time Performance'];
    const pct = (s: string | undefined) => (s ? parseFloat(String(s).replace('%', '')) || 0 : 0);
    let rows: SectorPerf[];
    const warnings: string[] = [];
    if (rt) {
      const d1 = data['Rank B: 1 Day Performance'] ?? {}, d5 = data['Rank C: 5 Day Performance'] ?? {}, m1 = data['Rank D: 1 Month Performance'] ?? {}, m3 = data['Rank E: 3 Month Performance'] ?? {}, ytd = data['Rank F: Year-to-Date (YTD) Performance'] ?? {};
      rows = SECTOR_MAP.map((s) => ({ name: s.name, etf: s.etf, realtime: pct(rt[s.key]), d1: pct(d1[s.key]), d5: pct(d5[s.key]), m1: pct(m1[s.key]), m3: pct(m3[s.key]), ytd: pct(ytd[s.key]), persistenceRank: 0 }));
    } else {
      // AV SECTOR currently returns {} (production /api/sectors/heatmap hits the same wall and falls back to
      // 1-day ETF quotes). Jarvis reproduces the fallback but adds multi-period returns from ETF daily closes
      // so leadership is persistence-based rather than single-session.
      warnings.push('AV SECTOR endpoint returned an empty payload; multi-period returns derived from sector-ETF daily closes (TIME_SERIES_DAILY_ADJUSTED).');
      const ret = (closes: number[], n: number) => (closes.length > n && closes[n] > 0 ? ((closes[0] - closes[n]) / closes[n]) * 100 : 0);
      const perEtf = await Promise.all(SECTOR_MAP.map(async (s) => {
        const series = await avFetch<any>(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${s.etf}&outputsize=compact&apikey=${apiKey}`, `JARVIS DAILY ${s.etf}`);
        const ts = series?.['Time Series (Daily)'];
        if (!ts) return null;
        const dates = Object.keys(ts).sort().reverse();
        const closes = dates.map((d) => parseFloat(ts[d]['5. adjusted close'] ?? ts[d]['4. close']));
        const yearStart = dates.find((d) => d < `${new Date(nowMs).getUTCFullYear()}-01-01`);
        const ytdBase = yearStart ? parseFloat(ts[yearStart]['5. adjusted close'] ?? ts[yearStart]['4. close']) : NaN;
        return { name: s.name, etf: s.etf, realtime: ret(closes, 1), d1: ret(closes, 1), d5: ret(closes, 5), m1: ret(closes, 21), m3: ret(closes, 63), ytd: Number.isFinite(ytdBase) && ytdBase > 0 ? ((closes[0] - ytdBase) / ytdBase) * 100 : null, persistenceRank: 0, asOf: dates[0] } as SectorPerf & { asOf: string };
      }));
      rows = perEtf.filter((r): r is SectorPerf & { asOf: string } => r !== null);
      if (!rows.length) return missing('sectors', 'Sector performance', 'Alpha Vantage (SECTOR + TIME_SERIES_DAILY_ADJUSTED)', true, 'AV SECTOR empty and ETF daily series unavailable');
      if (rows.length < SECTOR_MAP.length) warnings.push(`Only ${rows.length}/11 sector ETFs returned daily series.`);
      warnings.push(`ETF closes as of ${(rows[0] as SectorPerf & { asOf: string }).asOf}. YTD unavailable (compact 100-day series has no prior-year close).`);
    }
    // Persistence = average rank across 5d/1m/3m (trend persistence, not a single day).
    const rankBy = (k: keyof SectorPerf) => [...rows].sort((a, b) => (b[k] as number) - (a[k] as number)).map((r) => r.name);
    const r5 = rankBy('d5'), r1 = rankBy('m1'), r3 = rankBy('m3');
    for (const r of rows) r.persistenceRank = Math.round(((r5.indexOf(r.name) + r1.indexOf(r.name) + r3.indexOf(r.name)) / 3) * 10) / 10;
    return envelope({ key: 'sectors', label: 'S&P sector performance', provider: rt ? 'Alpha Vantage SECTOR' : 'Alpha Vantage TIME_SERIES_DAILY_ADJUSTED for 11 sector ETFs (SECTOR endpoint empty)', environment: 'LOCAL_LIVE', critical: true, observedAt: new Date(nowMs).toISOString(), nowMs, liveMax: 60, delayedMax: 24 * 60, coverage: `${rows.length}/11 sectors`, data: rows.map(({ ...r }) => { delete (r as any).asOf; return r; }), warnings, freshnessOverride: rt ? undefined : 'DELAYED' });
  }, (e) => missing('sectors', 'Sector performance', 'Alpha Vantage SECTOR', true, e));
}

// ───────────────────────────── Scanner (UPE CRCS hourly base — production per-symbol scores) ─────────────────────────────

export async function collectCrcs(nowMs: number): Promise<Dataset<{ latest: CrcsRow[]; previousDay: CrcsRow[]; batchAt: string; previousBatchAt: string | null }>> {
  return safe(async () => {
    const batches = await q<{ computed_at: string }>(`SELECT DISTINCT computed_at FROM crcs_hourly_base WHERE computed_at >= NOW() - INTERVAL '30 hours' ORDER BY computed_at DESC`);
    if (!batches.length) return missing('scanner', 'Scanner composite (CRCS hourly)', 'crcs_hourly_base', true, 'no batches in 30h');
    const latestTs = new Date(batches[0].computed_at).toISOString();
    const prev = batches.find((b) => Date.parse(String(b.computed_at)) <= Date.parse(latestTs) - 23 * 3_600_000);
    const prevTs = prev ? new Date(prev.computed_at).toISOString() : null;
    const map = (r: any): CrcsRow => ({ symbol: r.symbol, asset_class: r.asset_class, cluster: r.cluster, global_eligibility: r.global_eligibility, confluence_score: num(r.confluence_score) ?? 0, rar_score: num(r.rar_score) ?? 0, crcs_final: num(r.crcs_final) ?? 0, computed_at: new Date(r.computed_at).toISOString() });
    const latest = (await q<any>(`SELECT symbol, asset_class, cluster, global_eligibility, confluence_score, rar_score, crcs_final, computed_at FROM crcs_hourly_base WHERE computed_at = $1 ORDER BY crcs_final DESC`, [latestTs])).map(map);
    const previousDay = prevTs ? (await q<any>(`SELECT symbol, asset_class, cluster, global_eligibility, confluence_score, rar_score, crcs_final, computed_at FROM crcs_hourly_base WHERE computed_at = $1`, [prevTs])).map(map) : [];
    const byClass = latest.reduce<Record<string, number>>((acc, r) => { acc[r.asset_class] = (acc[r.asset_class] ?? 0) + 1; return acc; }, {});
    return envelope({ key: 'scanner', label: 'Scanner composite universe (UPE CRCS hourly)', provider: 'crcs_hourly_base (worker/upe-crcs-hourly)', environment: 'PRODUCTION_DB', critical: true, observedAt: latestTs, nowMs, liveMax: 120, delayedMax: 360, coverage: Object.entries(byClass).map(([k, v]) => `${k}:${v}`).join(', '), data: { latest, previousDay, batchAt: latestTs, previousBatchAt: prevTs }, warnings: prevTs ? [] : ['No batch ≥23h old available for rotation comparison'] });
  }, (e) => missing('scanner', 'Scanner composite (CRCS hourly)', 'crcs_hourly_base', true, e));
}

// ───────────────────────────── Crypto (CoinGecko lib — same client as production routes) ─────────────────────────────

export async function collectCrypto(nowMs: number): Promise<Dataset<CryptoSnapshot>> {
  if (!process.env.COINGECKO_API_KEY && !process.env.COINGECKO_PRO_API_KEY) return missing('crypto', 'Crypto market structure', 'CoinGecko', true, 'COINGECKO_API_KEY not set');
  return safe(async () => {
    const [global, markets, perps, oi, categories] = await Promise.all([
      getGlobalData(), getMarketData({ per_page: 100, price_change_percentage: ['24h', '7d'] }),
      getDerivativesForSymbols(['BTC', 'ETH', 'SOL']).catch(() => []), getAggregatedOpenInterest(['BTC', 'ETH', 'SOL']).catch(() => []), getCoinCategories().catch(() => null),
    ]);
    if (!global && !markets) return missing('crypto', 'Crypto market structure', 'CoinGecko', true, 'CoinGecko global + markets unavailable');
    const top100 = (markets ?? []).map((m) => ({ symbol: m.symbol.toUpperCase(), change24h: num(m.price_change_percentage_24h), change7d: num(m.price_change_percentage_7d_in_currency), marketCap: num(m.market_cap), volume24h: num(m.total_volume) }));
    const valid24 = top100.filter((c) => c.change24h !== null);
    const valid7 = top100.filter((c) => c.change7d !== null);
    const alts = valid24.filter((c) => !['BTC', 'ETH', 'USDT', 'USDC', 'DAI', 'USDE', 'FDUSD', 'USDS', 'PYUSD', 'TUSD', 'USD1'].includes(c.symbol)).map((c) => c.change24h as number).sort((a, b) => a - b);
    // Funding: MEDIAN of raw perpetual funding_rate per index. CoinGecko /derivatives reports funding_rate already in
    // percent per interval (median BTC ≈ 0.005); the shared getAggregatedFundingRates() takes the MEAN and multiplies by
    // 100, so a couple of outlier venues (e.g. 9.9) inflate it to double-digit "percent". Jarvis does not reuse that number.
    const fundingMap: CryptoSnapshot['funding'] = {};
    const bySym: Record<string, number[]> = {};
    for (const t of perps) { const r = num(t.funding_rate); if (r === null) continue; (bySym[t.index_id.toUpperCase()] ??= []).push(r); }
    for (const [sym, rates] of Object.entries(bySym)) {
      const s = [...rates].sort((a, b) => a - b); const med = s[Math.floor(s.length / 2)];
      fundingMap[sym] = { fundingRatePct: med, annualised: med * 3 * 365, exchangeCount: s.length, sentiment: med > 0.03 ? 'Bullish' : med < -0.01 ? 'Bearish' : 'Neutral' };
    }
    const funding = Object.keys(fundingMap);
    const oiMap: CryptoSnapshot['openInterest'] = {}; for (const o of oi) oiMap[o.symbol] = { totalOI: o.totalOpenInterest, exchangeCount: o.exchanges };
    const snapshot: CryptoSnapshot = {
      totalMarketCapUsd: num(global?.total_market_cap?.usd), marketCapChange24hPct: num(global?.market_cap_change_percentage_24h_usd),
      btcDominance: num(global?.market_cap_percentage?.btc), ethDominance: num(global?.market_cap_percentage?.eth), top100,
      breadth24hPct: valid24.length ? Math.round((valid24.filter((c) => (c.change24h as number) > 0).length / valid24.length) * 1000) / 10 : null,
      breadth7dPct: valid7.length ? Math.round((valid7.filter((c) => (c.change7d as number) > 0).length / valid7.length) * 1000) / 10 : null,
      medianAlt24h: alts.length ? alts[Math.floor(alts.length / 2)] : null,
      btc24h: top100.find((c) => c.symbol === 'BTC')?.change24h ?? null, eth24h: top100.find((c) => c.symbol === 'ETH')?.change24h ?? null,
      funding: fundingMap, openInterest: oiMap,
      categories: (categories ?? []).slice(0, 60).map((c) => ({ name: c.name, change24h: num(c.market_cap_change_24h), marketCap: num(c.market_cap) })),
    };
    const warnings: string[] = ['Funding = median of raw perpetual funding_rate (percent per interval). Shared lib getAggregatedFundingRates() uses mean×100 and is outlier-inflated — production Derivatives widget likely affected.'];
    if (!global) warnings.push('CoinGecko /global unavailable — dominance/total cap missing');
    if (!funding.length) warnings.push('CoinGecko derivatives tickers unavailable — funding/OI missing');
    return envelope({ key: 'crypto', label: 'Crypto market structure (CoinGecko)', provider: 'CoinGecko /global, /coins/markets, /derivatives, /coins/categories (lib/coingecko)', environment: 'LOCAL_LIVE', critical: true, observedAt: new Date(nowMs).toISOString(), nowMs, liveMax: 15, delayedMax: 120, coverage: `${top100.length} coins, funding ${Object.keys(fundingMap).length}, categories ${snapshot.categories.length}`, data: snapshot, warnings, freshnessOverride: !global || !funding.length ? 'PARTIAL' : undefined });
  }, (e) => missing('crypto', 'Crypto market structure', 'CoinGecko', true, e));
}

export async function collectDerivativesDb(nowMs: number): Promise<Dataset<DerivativesDbRow[]>> {
  return safe(async () => {
    const rows = await q<any>(`SELECT DISTINCT ON (symbol) symbol, funding_rate_pct, total_oi, sentiment, captured_at FROM derivatives_snapshots WHERE symbol IN ('BTC','ETH','SOL') ORDER BY symbol, captured_at DESC`);
    if (!rows.length) return missing('derivativesDb', 'Derivatives snapshots (worker)', 'derivatives_snapshots', false, 'no rows');
    const data: DerivativesDbRow[] = rows.map((r: any) => ({ symbol: r.symbol, funding_rate_pct: num(r.funding_rate_pct) ?? 0, total_oi: num(r.total_oi) ?? 0, sentiment: r.sentiment, captured_at: new Date(r.captured_at).toISOString() }));
    const latest = data.reduce((m, d) => (d.captured_at > m ? d.captured_at : m), '');
    return envelope({ key: 'derivativesDb', label: 'Derivatives snapshots (worker, persisted)', provider: 'derivatives_snapshots', environment: 'PRODUCTION_DB', critical: false, observedAt: latest, nowMs, liveMax: 120, delayedMax: 24 * 60, coverage: data.map((d) => d.symbol).join(','), data });
  }, (e) => missing('derivativesDb', 'Derivatives snapshots (worker)', 'derivatives_snapshots', false, e));
}

// ───────────────────────────── Macro series (FRED ingest → macro_series) ─────────────────────────────

const MACRO_KEYS = ['US10Y', 'US2Y', 'YIELD_2S10S', 'VIX', 'DXY', 'FED_FUNDS_RATE', 'CREDIT_HY_OAS', 'CPI_YOY', 'UNRATE'];

export async function collectMacroSeries(nowMs: number): Promise<Dataset<Record<string, MacroSeriesPoint>>> {
  return safe(async () => {
    const rows = await q<any>(
      `WITH ranked AS (
         SELECT series_key, observed_on, value, source, ROW_NUMBER() OVER (PARTITION BY series_key ORDER BY observed_on DESC) AS rn
           FROM macro_series WHERE series_key = ANY($1) AND value IS NOT NULL)
       SELECT series_key, observed_on, value, source, rn FROM ranked WHERE rn IN (1, 21) ORDER BY series_key, rn`, [MACRO_KEYS]);
    if (!rows.length) return missing('macro', 'Macro series (FRED)', 'macro_series', true, 'no rows');
    const out: Record<string, MacroSeriesPoint> = {};
    let latestObs = '';
    for (const r of rows) {
      const obs = isoDay(r.observed_on);
      const rn = Number(r.rn);
      if (rn === 1) { out[r.series_key] = { key: r.series_key, value: num(r.value) ?? 0, observedOn: obs, prior: null, priorObservedOn: null, source: r.source }; if (obs > latestObs) latestObs = obs; }
      else if (out[r.series_key]) { out[r.series_key].prior = num(r.value); out[r.series_key].priorObservedOn = obs; }
    }
    const missingKeys = MACRO_KEYS.filter((k) => !out[k]);
    // FRED daily series should be within ~3 business days; anything older is a broken ingest, not a market fact.
    return envelope({ key: 'macro', label: 'Rates / USD / VIX / credit (FRED via macro_series)', provider: 'macro_series (lib/macro/fred ingest)', environment: 'PRODUCTION_DB', critical: true, observedAt: latestObs ? `${latestObs}T00:00:00.000Z` : null, nowMs, liveMax: 3 * 24 * 60, delayedMax: 7 * 24 * 60, coverage: `${Object.keys(out).length}/${MACRO_KEYS.length} series`, data: out, warnings: [...(missingKeys.length ? [`Missing series: ${missingKeys.join(', ')}`] : []), 'DXY is FRED broad-dollar (proxy for ICE DXY)'] });
  }, (e) => missing('macro', 'Macro series (FRED)', 'macro_series', true, e));
}

// ───────────────────────────── Intelligence (PRODUCTION endpoints, unauthenticated GETs) ─────────────────────────────

async function fetchProd(path: string): Promise<{ data: any; source?: any } | null> {
  const res = await fetch(`${PROD_BASE}${path}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return (await res.json()) as { data: any; source?: any };
}

export async function collectIntelligence(nowMs: number): Promise<Dataset<IntelligenceBundle>> {
  const results = await Promise.allSettled([fetchProd('/api/intelligence/fragility'), fetchProd('/api/intelligence/liquidity'), fetchProd('/api/intelligence/global-m2')]);
  const pick = (i: number) => (results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<any>).value?.data ?? null : null);
  const errs = results.map((r, i) => (r.status === 'rejected' ? `${['fragility', 'liquidity', 'global-m2'][i]}: ${(r.reason as Error).message}` : null)).filter(Boolean) as string[];
  const bundle: IntelligenceBundle = { fragility: pick(0), liquidity: pick(1), globalM2: pick(2) };
  if (!bundle.fragility && !bundle.liquidity && !bundle.globalM2) return missing('intelligence', 'Intelligence (Fragility / Liquidity / Global M2)', 'marketscannerpros.app/api/intelligence/*', true, errs.join('; ') || 'all unavailable');
  const warnings = [...errs];
  if (bundle.globalM2 && bundle.globalM2.interpretationEligible === false) warnings.push(`Global M2 interpretation ineligible: weighted coverage ${Number(bundle.globalM2.estimatedWeightedCoveragePercent).toFixed(1)}% < ${bundle.globalM2.weightedCoverageThreshold}%`);
  if (bundle.liquidity?.parityStatus) warnings.push(`Liquidity Transmission parity: ${bundle.liquidity.parityStatus}`);
  if (bundle.liquidity?.statusLabel) warnings.push(`Liquidity status: ${bundle.liquidity.statusLabel}`);
  const ts = bundle.fragility?.timestamp ?? bundle.liquidity?.calculatedAt ?? bundle.globalM2?.calculatedAt ?? null;
  const partial = Boolean(warnings.length);
  return envelope({ key: 'intelligence', label: 'Intelligence engines (production)', provider: 'PRODUCTION /api/intelligence/{fragility,liquidity,global-m2}', environment: 'PRODUCTION_LIVE', critical: true, observedAt: ts, nowMs, liveMax: 90, delayedMax: 24 * 60, coverage: `${[bundle.fragility, bundle.liquidity, bundle.globalM2].filter(Boolean).length}/3 modules`, data: bundle, warnings, freshnessOverride: partial ? 'PARTIAL' : undefined });
}

// ───────────────────────────── Calendar (same lib as /api/economic-calendar) ─────────────────────────────

export async function collectCalendar(nowMs: number): Promise<Dataset<CalendarFeed>> {
  return safe(async () => {
    const feed = await buildCalendarFeed({ nowMs, days: 7, countries: ALL_COUNTRIES, focusAssets: ALL_FOCUS_ASSETS, lookbackHours: 24 });
    const provider = feed.meta.provider === 'curated' ? 'curated official-schedule seed (FALLBACK — no live calendar provider configured)' : `live provider ${feed.meta.provider} + curated`;
    return envelope({ key: 'calendar', label: 'Global macro calendar', provider, environment: 'LIB', critical: true, observedAt: feed.meta.generatedAt, nowMs, liveMax: 60, delayedMax: 24 * 60, coverage: `${feed.events.length} events / 7d, ${new Set(feed.events.map((e) => e.countryCode)).size} countries`, data: feed, warnings: feed.meta.warnings, freshnessOverride: feed.meta.provider === 'curated' ? 'PARTIAL' : undefined });
  }, (e) => missing('calendar', 'Global macro calendar', 'lib/macro/calendar', true, e));
}

// ───────────────────────────── Per-ticker catalysts (catalyst_events) ─────────────────────────────

export async function collectTickerCatalysts(nowMs: number, symbols: string[]): Promise<Dataset<Record<string, Array<{ type: string; headline: string; at: string; severity: string }>>>> {
  return safe(async () => {
    const rows = await q<any>(`SELECT ticker, catalyst_type, headline, event_timestamp_utc, severity FROM catalyst_events WHERE ticker = ANY($1) AND event_timestamp_utc BETWEEN NOW() - INTERVAL '2 days' AND NOW() + INTERVAL '14 days' ORDER BY event_timestamp_utc`, [symbols]);
    const out: Record<string, Array<{ type: string; headline: string; at: string; severity: string }>> = {};
    for (const r of rows) (out[r.ticker] ??= []).push({ type: r.catalyst_type, headline: r.headline, at: new Date(r.event_timestamp_utc).toISOString(), severity: r.severity });
    return envelope({ key: 'tickerCatalysts', label: 'Per-ticker catalysts (±14d)', provider: 'catalyst_events', environment: 'PRODUCTION_DB', critical: false, observedAt: new Date(nowMs).toISOString(), nowMs, liveMax: 60, delayedMax: 24 * 60, coverage: `${rows.length} events for ${Object.keys(out).length}/${symbols.length} symbols`, data: out, warnings: rows.length ? [] : ['No upcoming per-ticker catalysts in catalyst_events for the candidate set'] });
  }, (e) => missing('tickerCatalysts', 'Per-ticker catalysts', 'catalyst_events', false, e));
}

// ───────────────────────────── Explicitly unavailable in this prototype ─────────────────────────────

export function collectUnavailable(): Dataset<null>[] {
  return [
    missing('options', 'Options flow / IV / skew', 'Alpha Vantage REALTIME_OPTIONS_FMV', false, 'Single-symbol on-demand only (Pro Trader gated, AV quota); options_metrics_latest has 0 rows. Not ingested.'),
    missing('news', 'News / sentiment', 'Alpha Vantage NEWS_SENTIMENT + CryptoCompare', false, 'Per-ticker only, rate-limited, OpenAI-costly; no market-wide news service exists. Not ingested.'),
    missing('credit', 'Credit (HYG/LQD price)', 'quotes_latest', false, 'HYG/LQD/TLT not in symbol_universe; only FRED HY OAS (stale) available.'),
    missing('leadLag', 'Cross-asset lead/lag, NQ pressure, auction, master', '/api/intelligence/status', false, 'UNDER_CONSTRUCTION per production status — excluded by rule.'),
  ];
}
