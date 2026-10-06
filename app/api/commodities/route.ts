import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';
import { readShared, readSharedMulti, writeShared } from '@/lib/cache/sharedResponse';
import { commodityFromYahooQuote, YAHOO_FUTURES_SOURCE_LABEL, YAHOO_FUTURES_SYMBOLS, YAHOO_FUTURES_UNAVAILABLE, type PreciousMetal } from '@/lib/commodities/yahooFutures';
import { isMonthlyObservationCurrent, monthlyAsOfLabel } from '@/lib/commodityFreshness';
import { deepAnalysisLimiter, getClientIP } from '@/lib/rateLimit';
import { getQuote } from '@/lib/yahoo-finance';

// Alpha Vantage commodity endpoints
// https://www.alphavantage.co/documentation/#commodities
//
// IMPORTANT: AV's WTI / NATURAL_GAS / COPPER / WHEAT endpoints return
// EIA/USDA historical data that is 1-30+ days delayed.
// For near-real-time pricing we use GLOBAL_QUOTE on commodity-tracking ETFs
// as the *primary* source and fall back to the legacy endpoint only when
// the ETF quote is unavailable.

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// ETF proxies for real-time commodity prices
// These trade in real-time and closely track the underlying commodity
const ETF_PROXIES: Record<string, { etf: string; multiplier: number; description: string }> = {
  WTI:         { etf: 'USO',  multiplier: 1,   description: 'United States Oil Fund' },
  BRENT:       { etf: 'BNO',  multiplier: 1,   description: 'United States Brent Oil Fund' },
  NATURAL_GAS: { etf: 'UNG',  multiplier: 1,   description: 'United States Natural Gas Fund' },
  COPPER:      { etf: 'CPER', multiplier: 1,   description: 'United States Copper Index Fund' },
  WHEAT:       { etf: 'WEAT', multiplier: 1,   description: 'Teucrium Wheat Fund' },
  CORN:        { etf: 'CORN', multiplier: 1,   description: 'Teucrium Corn Fund' },
  SUGAR:       { etf: 'CANE', multiplier: 1,   description: 'Teucrium Sugar Fund' },
  // No COFFEE proxy: the iPath coffee ETN (JO) was delisted in June 2023 and Alpha Vantage still returns its last quote
  // (2023-06-14), which showed coffee as "STALE · proxy JO, 1200d" (OV-16). Coffee uses AV's monthly COFFEE series.
};

/** An ETF proxy quote older than this is a dead or halted listing, not a live price: use the commodity series instead. */
const ETF_PROXY_MAX_AGE_DAYS = 7;

// Core commodities config (legacy endpoints used as fallback only)
const COMMODITIES = {
  WTI: { function: 'WTI', name: 'WTI Crude Oil', unit: '$/barrel', category: 'Energy', interval: 'daily' },
  BRENT: { function: 'BRENT', name: 'Brent Crude Oil', unit: '$/barrel', category: 'Energy', interval: 'daily' },
  NATURAL_GAS: { function: 'NATURAL_GAS', name: 'Natural Gas', unit: '$/MMBtu', category: 'Energy', interval: 'daily' },
  GOLD: { function: 'GOLD', name: 'Gold', unit: '$/oz', category: 'Metals' },
  SILVER: { function: 'SILVER', name: 'Silver', unit: '$/oz', category: 'Metals' },
  COPPER: { function: 'COPPER', name: 'Copper', unit: '$/metric ton', category: 'Metals', interval: 'monthly' },
  ALUMINUM: { function: 'ALUMINUM', name: 'Aluminum', unit: '$/metric ton', category: 'Metals', interval: 'monthly' },
  // Units as Alpha Vantage reports them in each series' `unit` field (World Bank monthly prices).
  WHEAT: { function: 'WHEAT', name: 'Wheat', unit: '$/metric ton', category: 'Agriculture', interval: 'monthly' },
  CORN: { function: 'CORN', name: 'Corn', unit: '$/metric ton', category: 'Agriculture', interval: 'monthly' },
  COTTON: { function: 'COTTON', name: 'Cotton', unit: 'cents/lb', category: 'Agriculture', interval: 'monthly' },
  SUGAR: { function: 'SUGAR', name: 'Sugar', unit: 'cents/lb', category: 'Agriculture', interval: 'monthly' },
  COFFEE: { function: 'COFFEE', name: 'Coffee', unit: 'cents/lb', category: 'Agriculture', interval: 'monthly' },
};

/** One shared copy of each commodity row, about 15 minutes. */
const COMMODITY_CACHE_TTL_SECONDS = 15 * 60;
/** A failed gold or silver quote is remembered briefly, then tried again. */
const COMMODITY_FAIL_CACHE_TTL_SECONDS = 90;
/** Last priced gold or silver row. Shown with its own as-of time when the latest fetch fails. */
const COMMODITY_LAST_GOOD_TTL_SECONDS = 6 * 60 * 60;
const commodityCacheKey = (symbol: string) => `commodities:v1:${symbol}`;
const lastGoodKey = (symbol: string) => `commodities:v1:lastgood:${symbol}`;

type CommodityFreshness = 'LIVE' | 'DELAYED' | 'STALE';
type CommoditySource = 'ETF_PROXY' | 'SPOT' | 'LEGACY_DAILY' | 'LEGACY_MONTHLY' | 'YAHOO_FUTURES';

interface CommodityData {
  symbol: string;
  /** Display name. ETF proxy rows are named by the fund, e.g. "USO (WTI Crude Oil proxy)", because the price is the
   *  fund's share price, not the commodity's (OV-20). */
  name: string;
  /** The commodity itself ("WTI Crude Oil"), for every row. */
  commodityName?: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  unit: string;
  category: string;
  date: string;
  history: { date: string; value: number }[];
  source: CommoditySource;
  sourceSymbol?: string;
  /** User-visible source, set for Yahoo futures rows. */
  sourceLabel?: string | null;
  /** Plain reason when price and change are null. */
  unavailableReason?: string | null;
  freshnessStatus: CommodityFreshness;
  dataAgeDays: number;
  eligibleForGate: boolean;
  /** Publication cadence of the underlying series; 'monthly' rows are judged by month, not day age. */
  cadence: 'live' | 'daily' | 'monthly';
  /** "monthly, as of Aug 2026" for monthly series; null otherwise. */
  asOfLabel: string | null;
}

function dataAgeDays(date: string): number {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000));
}

function withFreshness(
  data: Omit<CommodityData, 'source' | 'freshnessStatus' | 'dataAgeDays' | 'eligibleForGate' | 'cadence' | 'asOfLabel'>,
  source: CommoditySource,
  maxAgeDays: number,
  sourceSymbol?: string,
): CommodityData {
  const age = dataAgeDays(data.date);
  const monthly = source === 'LEGACY_MONTHLY';
  const stale = monthly ? !isMonthlyObservationCurrent(data.date) : !Number.isFinite(age) || age > maxAgeDays;
  const freshnessStatus: CommodityFreshness = stale
    ? 'STALE'
    : source === 'YAHOO_FUTURES'
      ? 'DELAYED'
      : source === 'ETF_PROXY' || source === 'SPOT'
        ? 'LIVE'
        : 'DELAYED';
  return {
    ...data,
    source,
    sourceSymbol,
    freshnessStatus,
    dataAgeDays: Number.isFinite(age) ? age : 9999,
    eligibleForGate: freshnessStatus !== 'STALE',
    cadence: monthly ? 'monthly' : source === 'LEGACY_DAILY' ? 'daily' : 'live',
    asOfLabel: monthly ? monthlyAsOfLabel(data.date) : null,
  };
}

async function fetchETFQuote(etfSymbol: string): Promise<{ price: number; change: number; changePercent: number; date: string } | null> {
  try {
    await avTakeToken();
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${etfSymbol}&entitlement=realtime&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json = await res.json();
    const quote = json['Global Quote'] || json['Global Quote - DATA DELAYED BY 15 MINUTES'];
    if (!quote || !quote['05. price']) return null;
    return {
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change'] || '0'),
      changePercent: parseFloat((quote['10. change percent'] || '0').replace('%', '')),
      date: quote['07. latest trading day'] || new Date().toISOString().split('T')[0],
    };
  } catch (err) {
    console.error(`[Commodities] ETF quote failed for ${etfSymbol}:`, err);
    return null;
  }
}

function unavailableMetal(symbol: PreciousMetal): CommodityData {
  const config = COMMODITIES[symbol];
  return {
    symbol,
    name: config.name,
    commodityName: config.name,
    price: null,
    change: null,
    changePercent: null,
    unit: config.unit,
    category: config.category,
    date: '',
    history: [],
    source: 'YAHOO_FUTURES',
    sourceSymbol: YAHOO_FUTURES_SYMBOLS[symbol],
    sourceLabel: YAHOO_FUTURES_SOURCE_LABEL,
    unavailableReason: YAHOO_FUTURES_UNAVAILABLE,
    freshnessStatus: 'STALE',
    dataAgeDays: 0,
    eligibleForGate: false,
    cadence: 'live',
    asOfLabel: null,
  };
}

/** Gold and silver from Yahoo futures. A failed quote is an unavailable row, never a 0% change. */
async function fetchYahooMetal(symbol: PreciousMetal): Promise<CommodityData> {
  const config = COMMODITIES[symbol];
  let quote = null;
  try {
    quote = await getQuote(YAHOO_FUTURES_SYMBOLS[symbol]);
  } catch (err) {
    console.error(`[Commodities] Yahoo futures quote failed for ${symbol}:`, err);
  }
  const parsed = commodityFromYahooQuote(symbol, quote);
  if (parsed.price == null || parsed.unavailableReason) {
    return unavailableMetal(symbol);
  }
  const changeReady = parsed.change != null && parsed.changePercent != null;
  const row = withFreshness({
    symbol,
    name: config.name,
    commodityName: config.name,
    price: parsed.price,
    change: changeReady ? parsed.change : null,
    changePercent: changeReady ? parsed.changePercent : null,
    unit: config.unit,
    category: config.category,
    date: parsed.date,
    history: [{ date: parsed.date, value: parsed.price }],
  }, 'YAHOO_FUTURES', 3, parsed.yahooSymbol);
  return {
    ...row,
    eligibleForGate: changeReady && row.eligibleForGate,
    sourceLabel: parsed.sourceLabel,
    asOfLabel: parsed.asOfLabel,
    unavailableReason: null,
  };
}

async function fetchCommodity(symbol: keyof typeof COMMODITIES): Promise<CommodityData | null> {
  try {
    if (symbol === 'GOLD' || symbol === 'SILVER') return await fetchYahooMetal(symbol);

    const config = COMMODITIES[symbol];

    // ── Strategy 1: ETF proxy via GLOBAL_QUOTE (real-time) ──
    const proxy = ETF_PROXIES[symbol];
    if (proxy) {
      console.log(`[Commodities] Trying real-time ETF proxy ${proxy.etf} for ${symbol}...`);
      const etfQuote = await fetchETFQuote(proxy.etf);
      const proxyAge = etfQuote ? dataAgeDays(etfQuote.date) : Number.POSITIVE_INFINITY;
      if (etfQuote && etfQuote.price > 0 && proxyAge <= ETF_PROXY_MAX_AGE_DAYS) {
        console.log(`[Commodities] ✓ ETF proxy ${proxy.etf} → $${etfQuote.price} (${etfQuote.changePercent}%)`);
        return withFreshness({
          symbol,
          name: `${proxy.etf} (${config.name} proxy)`,
          commodityName: config.name,
          price: etfQuote.price,
          change: etfQuote.change,
          changePercent: etfQuote.changePercent,
          unit: `$ per ${proxy.etf} share (fund price)`,
          category: config.category,
          date: etfQuote.date,
          history: [{ date: etfQuote.date, value: etfQuote.price }],
        }, 'ETF_PROXY', 7, proxy.etf);
      }
      console.log(`[Commodities] ETF proxy ${proxy.etf} ${etfQuote ? `quote is ${etfQuote.date} (${proxyAge}d old)` : 'unavailable'}, falling back to legacy endpoint`);
    }

    // ── Strategy 2: legacy commodity endpoint (not used for gold or silver) ──
    const interval = 'interval' in config ? config.interval : 'monthly';
    const url = `https://www.alphavantage.co/query?function=${config.function}&interval=${interval}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    
    console.log(`[Commodities] Fetching ${symbol} via legacy endpoint...`);
    
    await avTakeToken();
    const res = await fetch(url, { 
      next: { revalidate: 900 } // 15 min cache
    });
    
    if (!res.ok) {
      console.error(`Failed to fetch ${symbol}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    
    // Check for API errors
    if (data['Error Message'] || data['Note']) {
      console.error(`Alpha Vantage error for ${symbol}:`, data['Error Message'] || data['Note']);
      return null;
    }

    const dataPoints = data.data;
    if (!dataPoints || !Array.isArray(dataPoints) || dataPoints.length < 2) {
      console.error(`No data for ${symbol}:`, JSON.stringify(data));
      return null;
    }

    const latest = dataPoints[0];
    const previous = dataPoints[1];
    const currentPrice = parseFloat(latest.value);
    const previousPrice = parseFloat(previous.value);
    const latestDate = latest.date;
    const historyLimit = interval === 'daily' ? 30 : 12;
    const history = dataPoints.slice(0, historyLimit).map((d: any) => ({
      date: d.date,
      value: parseFloat(d.value),
    }));

    const change = currentPrice - previousPrice;
    const changePercent = previousPrice !== 0 ? (change / previousPrice) * 100 : 0;
    const source: CommoditySource = interval === 'daily' ? 'LEGACY_DAILY' : 'LEGACY_MONTHLY';
    // LEGACY_MONTHLY ignores maxAgeDays: it is judged by month (lib/commodityFreshness).
    const maxAgeDays = source === 'LEGACY_DAILY' ? 10 : 45;
    return withFreshness({
      symbol,
      name: config.name,
      commodityName: config.name,
      price: currentPrice,
      change,
      changePercent,
      unit: config.unit,
      category: config.category,
      date: latestDate,
      history,
    }, source, maxAgeDays);
  } catch (err) {
    console.error(`Error fetching ${symbol}:`, err);
    if (symbol === 'GOLD' || symbol === 'SILVER') return unavailableMetal(symbol);
    return null;
  }
}

function isPreciousQuote(symbol: string): symbol is PreciousMetal {
  return symbol === 'GOLD' || symbol === 'SILVER';
}

/** A failed metal row can be replaced by the last priced quote. That quote keeps its own as-of time and is never 0. */
async function preferLastGood(symbol: keyof typeof COMMODITIES, row: CommodityData): Promise<CommodityData> {
  if (!isPreciousQuote(symbol) || row.price != null) return row;
  const last = await readShared<CommodityData>(lastGoodKey(symbol));
  if (last?.symbol === symbol && typeof last.price === 'number' && Number.isFinite(last.price) && last.price > 0) {
    // Hours-old gold or silver stays visible with its own as-of time, but it does not enter the breadth score.
    return { ...last, eligibleForGate: false };
  }
  return row;
}

async function storeCommodity(symbol: keyof typeof COMMODITIES, data: CommodityData): Promise<CommodityData> {
  if (isPreciousQuote(symbol) && data.price == null) {
    await writeShared(commodityCacheKey(symbol), data, COMMODITY_FAIL_CACHE_TTL_SECONDS);
    return preferLastGood(symbol, data);
  }
  if (isPreciousQuote(symbol) && data.price != null) {
    await writeShared(lastGoodKey(symbol), data, COMMODITY_LAST_GOOD_TTL_SECONDS);
  }
  await writeShared(commodityCacheKey(symbol), data, COMMODITY_CACHE_TTL_SECONDS);
  return data;
}

/**
 * Shared Redis first. The limiter runs only when at least one symbol still needs a vendor call.
 * Returns 'limited' when that call is not allowed.
 */
async function loadCommodities(
  symbols: (keyof typeof COMMODITIES)[],
  ip: string,
): Promise<(CommodityData | null)[] | 'limited'> {
  const cachedRows = await readSharedMulti<CommodityData>(symbols.map((symbol) => commodityCacheKey(symbol)));
  const hits = new Map<string, CommodityData>();
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const row = cachedRows[i];
    if (row?.symbol !== symbol) continue;
    console.log(`[Commodities] Shared cache hit for ${symbol}`);
    hits.set(symbol, await preferLastGood(symbol, row));
  }
  if (symbols.some((symbol) => !hits.has(symbol))) {
    const rateCheck = deepAnalysisLimiter.check(ip);
    if (!rateCheck.allowed) return 'limited';
  }

  const results: (CommodityData | null)[] = [];
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const hit = hits.get(symbol);
    if (hit) {
      results.push(hit);
      continue;
    }
    const data = await fetchCommodity(symbol);
    results.push(data ? await storeCommodity(symbol, data) : data);
    const moreMisses = symbols.slice(i + 1).some((next) => !hits.has(next));
    if (moreMisses) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return results;
}

export async function GET(req: NextRequest) {
  // Auth guard: AV license requires authenticated users only
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in to access commodity data' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol')?.toUpperCase();
    const symbols = symbol && symbol in COMMODITIES
      ? [symbol as keyof typeof COMMODITIES]
      : (Object.keys(COMMODITIES) as (keyof typeof COMMODITIES)[]);

    console.log(`[Commodities] Starting fetch for ${symbols.length} commodities...`);
    const loaded = await loadCommodities(symbols, getClientIP(req));
    if (loaded === 'limited') {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    if (symbols.length === 1 && symbol) {
      const data = loaded[0];
      if (!data) {
        return NextResponse.json({ error: `Failed to fetch ${symbol}` }, { status: 500 });
      }
      return NextResponse.json({ success: true, commodity: data });
    }

    const results = loaded;
    const commodities = results.filter((r): r is CommodityData => r !== null);
    
    console.log(`[Commodities] Fetched ${commodities.length}/${symbols.length} successfully`);
    
    // If zero commodities, return error
    if (commodities.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to fetch commodity data. Please try again.',
        success: false 
      }, { status: 500 });
    }
    
    // Preserve all returned rows for transparency, but only fresh-enough rows may
    // participate in the live analysis gate.
    const byCategory = {
      Energy: commodities.filter(c => c.category === 'Energy'),
      Metals: commodities.filter(c => c.category === 'Metals'),
      Agriculture: commodities.filter(c => c.category === 'Agriculture'),
    };
    const gateCommodities = commodities.filter(c => c.eligibleForGate).filter((c): c is CommodityData & { changePercent: number } =>
      typeof c.changePercent === 'number' && Number.isFinite(c.changePercent));
    // A missing gold/silver quote is unavailable, not a stale observation.
    const staleSymbols = commodities.filter(c => !c.eligibleForGate && c.price != null).map(c => c.symbol);
    const gateCategories = new Set(gateCommodities.map(c => c.category));
    const gateReady = gateCommodities.length >= 6
      && gateCategories.has('Energy')
      && gateCategories.has('Metals')
      && gateCategories.has('Agriculture');

    const summary = {
      totalCommodities: gateCommodities.length,
      availableCommodities: commodities.length,
      staleExcluded: staleSymbols.length,
      gainers: gateCommodities.filter(c => c.changePercent > 0).length,
      losers: gateCommodities.filter(c => c.changePercent < 0).length,
      avgChange: gateCommodities.length > 0
        ? gateCommodities.reduce((sum, c) => sum + c.changePercent, 0) / gateCommodities.length
        : 0,
      topGainer: gateCommodities.length > 0
        ? gateCommodities.reduce((max, c) => c.changePercent > max.changePercent ? c : max)
        : null,
      topLoser: gateCommodities.length > 0
        ? gateCommodities.reduce((min, c) => c.changePercent < min.changePercent ? c : min)
        : null,
    };

    const sourceAsOf = gateCommodities
      .map(c => c.date)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    console.log(`[Commodities] Gate eligible ${gateCommodities.length}/${commodities.length}; stale excluded: ${staleSymbols.join(', ') || 'none'}`);

    return NextResponse.json({
      success: true,
      commodities,
      byCategory,
      summary,
      dataHealth: {
        gateReady,
        eligibleCount: gateCommodities.length,
        totalCount: commodities.length,
        staleSymbols,
      },
      sourceAsOf,
      lastUpdate: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Commodities API error:', err);
    return NextResponse.json({ error: 'Failed to fetch commodity data' }, { status: 500 });
  }
}
