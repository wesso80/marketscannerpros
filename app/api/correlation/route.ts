/**
 * Correlation Confluence API — /api/correlation
 *
 * Computes rolling return-based Pearson correlations between a target
 * ticker and a comparison universe (auto-detected + optional custom symbols).
 *
 * Query params:
 *   symbol   — required target ticker (e.g. XRP, AAPL)
 *   window   — rolling window in days: 7 | 30 | 90  (default 30)
 *   type     — asset class hint: crypto | equity | forex  (auto-detected if omitted)
 *   compare  — optional comma-separated custom tickers to include (e.g. "ETH,SPY,GOLD")
 *
 * Response: { success, symbol, window, type, correlations[], divergenceBadge, regime, cachedAt }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getCached, setCached } from '@/lib/redis';
import { avFetch } from '@/lib/avRateGovernor';
import { getOHLC, resolveSymbolToId, COINGECKO_ID_MAP } from '@/lib/coingecko';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

/* ── Universes ─────────────────────────────────────────────────── */

const CRYPTO_UNIVERSE = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'BNB', 'AVAX', 'DOT', 'LINK'];

const EQUITY_UNIVERSE = ['SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META'];

const FOREX_UNIVERSE = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF'];

/* ── Types ─────────────────────────────────────────────────────── */

interface DailyClose { date: string; close: number }

interface CorrelationResult {
  symbol: string;
  name: string;
  coefficient: number;
  label: 'HIGH' | 'MEDIUM' | 'LOW' | 'INVERSE' | 'NONE';
  diverging: boolean;
  leadLag: string | null;  // e.g. "leads by ~1 bar" or null
}

interface CorrelationResponse {
  success: boolean;
  symbol: string;
  window: number;
  type: string;
  correlations: CorrelationResult[];
  divergenceBadge: boolean;
  regime: 'stable' | 'breaking' | 'inverting';
  cachedAt: number;
  error?: string;
}

/* ── Crypto name mapping ──────────────────────────────────────── */

const CRYPTO_NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP',
  ADA: 'Cardano', DOGE: 'Dogecoin', BNB: 'BNB', AVAX: 'Avalanche',
  DOT: 'Polkadot', LINK: 'Chainlink', MATIC: 'Polygon', LTC: 'Litecoin',
  SHIB: 'Shiba Inu', UNI: 'Uniswap', ATOM: 'Cosmos', NEAR: 'NEAR',
};

/* ── Helpers ──────────────────────────────────────────────────── */

function detectType(symbol: string): 'crypto' | 'equity' | 'forex' {
  const upper = symbol.toUpperCase();
  // Known crypto bases
  if (COINGECKO_ID_MAP[upper] || COINGECKO_ID_MAP[upper.replace(/USDT?$/, '')]) return 'crypto';
  // Forex pairs (6 chars, two 3-letter currencies)
  if (/^[A-Z]{6}$/.test(upper) && FOREX_UNIVERSE.includes(upper)) return 'forex';
  return 'equity';
}

function normalizeCryptoBase(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.includes('/')) return upper.split('/')[0];
  return upper.replace(/USDT$/, '').replace(/USD$/, '');
}

/**
 * Get comparison universe, excluding target ticker
 */
function getUniverse(type: string, targetSymbol: string): string[] {
  const target = targetSymbol.toUpperCase();
  let universe: string[];
  if (type === 'crypto') {
    universe = CRYPTO_UNIVERSE;
  } else if (type === 'forex') {
    universe = FOREX_UNIVERSE;
  } else {
    universe = EQUITY_UNIVERSE;
  }
  // Exclude the target itself (handle crypto variants like BTCUSDT vs BTC)
  const targetBase = normalizeCryptoBase(target);
  return universe.filter(s => {
    const sBase = normalizeCryptoBase(s);
    return sBase !== targetBase && s.toUpperCase() !== target;
  });
}

/**
 * Fetch daily closes for a crypto symbol via CoinGecko OHLC
 */
async function fetchCryptoDailyCloses(symbol: string, days: number): Promise<DailyClose[]> {
  const base = normalizeCryptoBase(symbol);
  const coinId = COINGECKO_ID_MAP[base] || await resolveSymbolToId(base);
  if (!coinId) return [];

  const ohlcDays = days <= 7 ? 7 : days <= 30 ? 30 : days <= 90 ? 90 : 180;
  const ohlc = await getOHLC(coinId, ohlcDays as any, { timeoutMs: 12_000 });
  if (!ohlc || !ohlc.length) return [];

  return ohlc
    .map(row => ({
      date: new Date(row[0]).toISOString().slice(0, 10),
      close: Number(row[4]),
    }))
    .filter(d => Number.isFinite(d.close) && d.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fetch daily closes for an equity/ETF via Alpha Vantage
 */
async function fetchEquityDailyCloses(symbol: string): Promise<DailyClose[]> {
  if (!AV_KEY) return [];

  // Check individual symbol's daily cache first (1 hour TTL)
  const cacheKey = `corr:daily:${symbol.toUpperCase()}`;
  const cached = await getCached<DailyClose[]>(cacheKey);
  if (cached?.length) return cached;

  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&entitlement=realtime&apikey=${AV_KEY}`;
  const data = await avFetch<Record<string, any>>(url, `DAILY ${symbol}`);
  if (!data) return [];

  const tsKey = Object.keys(data).find(k => k.startsWith('Time Series'));
  const ts = tsKey ? data[tsKey] : null;
  if (!ts) return [];

  const closes: DailyClose[] = Object.entries(ts)
    .map(([date, v]: any) => ({
      date,
      close: parseFloat(v['4. close']),
    }))
    .filter(d => Number.isFinite(d.close) && d.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Cache individual daily series for 1 hour to avoid redundant AV calls
  await setCached(cacheKey, closes, 3600).catch(() => {});
  return closes;
}

/**
 * Fetch daily closes for a forex pair via Alpha Vantage FX_DAILY
 */
async function fetchForexDailyCloses(pair: string): Promise<DailyClose[]> {
  if (!AV_KEY) return [];

  const cacheKey = `corr:daily:FX:${pair.toUpperCase()}`;
  const cached = await getCached<DailyClose[]>(cacheKey);
  if (cached?.length) return cached;

  const from = pair.substring(0, 3);
  const to = pair.substring(3, 6);
  const url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${from}&to_symbol=${to}&outputsize=compact&apikey=${AV_KEY}`;
  const data = await avFetch<Record<string, any>>(url, `FX_DAILY ${pair}`);
  if (!data) return [];

  const tsKey = Object.keys(data).find(k => k.includes('Time Series'));
  const ts = tsKey ? data[tsKey] : null;
  if (!ts) return [];

  const closes: DailyClose[] = Object.entries(ts)
    .map(([date, v]: any) => ({
      date,
      close: parseFloat(v['4. close']),
    }))
    .filter(d => Number.isFinite(d.close) && d.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  await setCached(cacheKey, closes, 3600).catch(() => {});
  return closes;
}

/**
 * Route daily close fetching through the right provider
 */
async function fetchDailyCloses(symbol: string, type: string, days: number): Promise<DailyClose[]> {
  if (type === 'crypto') return fetchCryptoDailyCloses(symbol, days);
  if (type === 'forex') return fetchForexDailyCloses(symbol);
  return fetchEquityDailyCloses(symbol);
}

/**
 * Convert a daily close series into daily log-returns
 */
function computeReturns(closes: DailyClose[]): { date: string; ret: number }[] {
  const returns: { date: string; ret: number }[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1].close > 0) {
      returns.push({
        date: closes[i].date,
        ret: (closes[i].close - closes[i - 1].close) / closes[i - 1].close,
      });
    }
  }
  return returns;
}

/**
 * Pearson correlation coefficient between two aligned return series
 */
function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 5) return 0;

  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

/**
 * Align two return series by date intersection, trim to window
 */
function alignReturns(
  a: { date: string; ret: number }[],
  b: { date: string; ret: number }[],
  window: number,
): { alignedA: number[]; alignedB: number[] } {
  const bMap = new Map(b.map(r => [r.date, r.ret]));
  const pairs: { retA: number; retB: number }[] = [];

  for (const rA of a) {
    const retB = bMap.get(rA.date);
    if (retB !== undefined) {
      pairs.push({ retA: rA.ret, retB: retB });
    }
  }

  // Take the last `window` pairs (most recent)
  const trimmed = pairs.slice(-window);
  return {
    alignedA: trimmed.map(p => p.retA),
    alignedB: trimmed.map(p => p.retB),
  };
}

/**
 * Classify a correlation coefficient
 */
function classify(r: number): 'HIGH' | 'MEDIUM' | 'LOW' | 'INVERSE' | 'NONE' {
  if (!Number.isFinite(r)) return 'NONE';
  const abs = Math.abs(r);
  if (r <= -0.40) return 'INVERSE';
  if (abs >= 0.70) return 'HIGH';
  if (abs >= 0.40) return 'MEDIUM';
  return 'LOW';
}

/**
 * Detect lead/lag by shifting one series by 1 bar and checking if correlation increases
 */
function detectLeadLag(a: number[], b: number[]): string | null {
  if (a.length < 10) return null;
  const baseCorr = Math.abs(pearson(a, b));

  // b leads a by 1 (shift b forward)
  const bLeads = Math.abs(pearson(a.slice(1), b.slice(0, -1)));
  // a leads b by 1 (shift a forward)
  const aLeads = Math.abs(pearson(a.slice(0, -1), b.slice(1)));

  const threshold = 0.05; // needs to be meaningfully better
  if (bLeads > baseCorr + threshold && bLeads > aLeads) return 'tends to lead';
  if (aLeads > baseCorr + threshold && aLeads > bLeads) return 'tends to lag';
  return null;
}

/**
 * Get display name for a symbol
 */
function getDisplayName(symbol: string, type: string): string {
  if (type === 'crypto') return CRYPTO_NAMES[normalizeCryptoBase(symbol)] || symbol;
  return symbol;
}

/* ── Main handler ────────────────────────────────────────────────── */

export async function GET(request: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ success: false, error: 'Please log in' } as Partial<CorrelationResponse>, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawSymbol = searchParams.get('symbol');
  const window = Math.min(Math.max(parseInt(searchParams.get('window') || '30', 10), 7), 90);
  const customCompare = searchParams.get('compare')?.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) || [];

  if (!rawSymbol) {
    return NextResponse.json({ success: false, error: 'Symbol is required' } as Partial<CorrelationResponse>, { status: 400 });
  }

  const symbol = rawSymbol.toUpperCase().trim();
  const type = searchParams.get('type') || detectType(symbol);

  try {
    /* ── 1. Check cache ──────────────────────────────────────────── */
    const compareKey = customCompare.length ? `:${customCompare.sort().join(',')}` : '';
    const cacheKey = `corr:result:${symbol}:${window}:${type}${compareKey}`;
    const cached = await getCached<CorrelationResponse>(cacheKey);
    if (cached?.success) {
      return NextResponse.json(cached);
    }

    /* ── 2. Build comparison set ─────────────────────────────────── */
    const universe = getUniverse(type, symbol);
    // Merge custom compare tickers (deduplicated), exclude target
    const targetBase = normalizeCryptoBase(symbol);
    const allCompare = [...new Set([...universe, ...customCompare])].filter(s => {
      const base = normalizeCryptoBase(s);
      return base !== targetBase && s !== symbol;
    });

    /* ── 3. Fetch daily closes ───────────────────────────────────── */

    // Detect type for each custom symbol (they might be from a different asset class)
    function detectSymbolType(sym: string): string {
      if (universe.includes(sym)) return type;
      return detectType(sym);
    }

    // Fetch target and all comparison symbols in parallel
    const fetchPromises = [
      fetchDailyCloses(symbol, type, window),
      ...allCompare.map(s => fetchDailyCloses(s, detectSymbolType(s), window)),
    ];

    const allCloses = await Promise.all(fetchPromises);
    const targetCloses = allCloses[0];

    if (!targetCloses.length) {
      return NextResponse.json({
        success: false, symbol, window, type,
        correlations: [], divergenceBadge: false,
        regime: 'stable' as const, cachedAt: Date.now(),
        error: 'No price data available for target symbol',
      } satisfies CorrelationResponse, { status: 404 });
    }

    /* ── 4. Compute returns + correlations ───────────────────────── */
    const targetReturns = computeReturns(targetCloses);

    const correlations: CorrelationResult[] = [];

    for (let i = 0; i < allCompare.length; i++) {
      const compSymbol = allCompare[i];
      const compCloses = allCloses[i + 1]; // offset by 1 (target is index 0)

      if (!compCloses.length) continue;

      const compReturns = computeReturns(compCloses);
      const { alignedA, alignedB } = alignReturns(targetReturns, compReturns, window);

      if (alignedA.length < 5) continue;

      const coeff = pearson(alignedA, alignedB);
      const label = classify(coeff);

      // Divergence: compare short-term (7 bars) vs full window
      let diverging = false;
      if (alignedA.length >= 14 && window >= 14) {
        const shortA = alignedA.slice(-7);
        const shortB = alignedB.slice(-7);
        const shortCoeff = pearson(shortA, shortB);
        diverging = Math.abs(coeff - shortCoeff) > 0.25;
      }

      // Lead/lag detection
      const leadLag = detectLeadLag(alignedA, alignedB);

      const compType = detectSymbolType(compSymbol);
      correlations.push({
        symbol: compSymbol,
        name: getDisplayName(compSymbol, compType),
        coefficient: Math.round(coeff * 100) / 100,
        label,
        diverging,
        leadLag: leadLag ? `${compSymbol} ${leadLag}` : null,
      });
    }

    // Sort by absolute correlation descending → top 5 most correlated
    correlations.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));

    /* ── 5. Compute overall divergence badge and regime ──────────── */
    const anyDiverging = correlations.some(c => c.diverging);
    const topCorrs = correlations.slice(0, 5);
    const avgCoeff = topCorrs.length
      ? topCorrs.reduce((s, c) => s + c.coefficient, 0) / topCorrs.length
      : 0;

    let regime: 'stable' | 'breaking' | 'inverting' = 'stable';
    if (anyDiverging && avgCoeff > 0.3) regime = 'breaking';
    if (avgCoeff < -0.2) regime = 'inverting';

    /* ── 6. Cache + respond ──────────────────────────────────────── */
    const response: CorrelationResponse = {
      success: true,
      symbol,
      window,
      type,
      correlations, // full list (UI trims to top N)
      divergenceBadge: anyDiverging,
      regime,
      cachedAt: Date.now(),
    };

    // Cache for 10 minutes
    await setCached(cacheKey, response, 600).catch(() => {});

    return NextResponse.json(response);

  } catch (err) {
    console.error('[correlation] Error:', err);
    return NextResponse.json({
      success: false, symbol, window, type,
      correlations: [], divergenceBadge: false,
      regime: 'stable' as const, cachedAt: Date.now(),
      error: err instanceof Error ? err.message : 'Failed to compute correlations',
    } satisfies CorrelationResponse, { status: 500 });
  }
}
