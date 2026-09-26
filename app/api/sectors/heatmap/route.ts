import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';
import { q } from '@/lib/db';
import { oldestTradingDay, parseAlphaVantageEasternTime, parseTradingDay } from '@/lib/analysis/providerAsOf';

// Sector ETF mappings
const SECTOR_ETFS = [
  { symbol: 'XLK', name: 'Technology', color: 'var(--msp-info)' },
  { symbol: 'XLF', name: 'Financials', color: 'var(--msp-bull)' },
  { symbol: 'XLV', name: 'Healthcare', color: '#EC4899' },
  { symbol: 'XLE', name: 'Energy', color: 'var(--msp-warn)' },
  { symbol: 'XLY', name: 'Consumer Discretionary', color: '#8B5CF6' },
  { symbol: 'XLP', name: 'Consumer Staples', color: '#06B6D4' },
  { symbol: 'XLI', name: 'Industrials', color: '#6366F1' },
  { symbol: 'XLB', name: 'Materials', color: 'var(--msp-bull)' },
  { symbol: 'XLU', name: 'Utilities', color: '#F97316' },
  { symbol: 'XLRE', name: 'Real Estate', color: 'var(--msp-bear)' },
  { symbol: 'XLC', name: 'Communication Services', color: '#14B8A6' },
];

// Market cap weighting (approximate) for sizing
const SECTOR_WEIGHTS: Record<string, number> = {
  XLK: 28,   // Technology
  XLF: 13,   // Financials
  XLV: 13,   // Healthcare
  XLY: 10,   // Consumer Discretionary
  XLC: 9,    // Communication Services
  XLI: 8,    // Industrials
  XLP: 6,    // Consumer Staples
  XLE: 4,    // Energy
  XLU: 3,    // Utilities
  XLRE: 3,   // Real Estate
  XLB: 3,    // Materials
};

interface SectorData {
  symbol: string;
  name: string;
  price?: number;
  change?: number;
  /** null when the provider sent no change (shown as n/a, left out of breadth and ranking). */
  changePercent: number | null;
  weight: number;
  color: string;
  daily?: number | null;
  weekly?: number | null;
  monthly?: number | null;
  quarterly?: number | null;
  ytd?: number | null;
  yearly?: number | null;
  /** Quote's trading day from GLOBAL_QUOTE ("07. latest trading day"). */
  tradingDay?: string | null;
  // Technical overlay
  rsi14?: number | null;
  adx14?: number | null;
  ema200_dist?: number | null;
  in_squeeze?: boolean | null;
  mfi14?: number | null;
  obv?: number | null;
  // Rotation & RS
  rs_rank?: number;
  rotation_phase?: string;
}

/** Classify sector rotation phase from multi-period momentum */
function classifyRotation(s: {
  changePercent?: number | null;
  daily?: number | null;
  weekly?: number | null;
  monthly?: number | null;
  quarterly?: number | null;
}): string | undefined {
  const shortRaw = s.weekly ?? s.daily ?? s.changePercent;
  // No move at all: no phase, rather than calling a missing sector "Lagging".
  if (shortRaw == null || !Number.isFinite(shortRaw)) return undefined;
  const short = shortRaw;
  const med = s.monthly ?? short;
  const long = s.quarterly ?? med;

  // Leading: positive across all periods, short-term still strong
  if (short > 0 && med > 0 && long > 0 && short >= med * 0.5) return 'Leading';
  // Weakening: long positive but short-term fading
  if (long > 0 && short < med * 0.5) return 'Weakening';
  // Strengthening: long negative but short improving
  if (long <= 0 && short > med) return 'Strengthening';
  // Lagging: negative across all
  if (short <= 0 && med <= 0 && long <= 0) return 'Lagging';
  // Default
  return short > 0 ? 'Improving' : 'Deteriorating';
}

/** Enrich sectors with technical indicators, RS ranking, and rotation phase */
async function enrichSectors(sectors: SectorData[]): Promise<SectorData[]> {
  try {
    const symbols = sectors.map(s => s.symbol);
    const placeholders = symbols.map((_, i) => `$${i + 1}`).join(',');

    // Fetch technicals from indicators_latest (daily timeframe)
    const rows = await q(
      `SELECT symbol, rsi14, adx14, ema200, in_squeeze,
              COALESCE(warmup_json->>'mfi14', NULL) AS mfi14,
              obv
       FROM indicators_latest
       WHERE symbol IN (${placeholders}) AND timeframe = 'daily'`,
      symbols
    );

    const techMap = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      techMap.set(r.symbol, r);
    }

    // Fetch SPY benchmark for overall market context + current ETF prices
    const priceRows = await q(
      `SELECT symbol, price, change_percent FROM quotes_latest WHERE symbol IN (${placeholders})`,
      symbols
    );
    const priceMap = new Map<string, { price: number; changePct: number }>();
    for (const r of priceRows) {
      priceMap.set(r.symbol, {
        price: parseFloat(r.price) || 0,
        changePct: parseFloat(r.change_percent) || 0,
      });
    }

    // Enrich each sector
    for (const s of sectors) {
      const tech = techMap.get(s.symbol);
      if (tech) {
        s.rsi14 = tech.rsi14 != null ? parseFloat(String(tech.rsi14)) : null;
        s.adx14 = tech.adx14 != null ? parseFloat(String(tech.adx14)) : null;
        s.in_squeeze = tech.in_squeeze === true || tech.in_squeeze === 't';
        s.mfi14 = tech.mfi14 != null ? parseFloat(String(tech.mfi14)) : null;
        s.obv = tech.obv != null ? parseInt(String(tech.obv), 10) : null;

        // EMA200 distance %
        const ema200 = tech.ema200 != null ? parseFloat(String(tech.ema200)) : null;
        const price = priceMap.get(s.symbol)?.price ?? s.price;
        if (ema200 && ema200 > 0 && price && price > 0) {
          s.ema200_dist = Math.round(((price - ema200) / ema200) * 10000) / 100;
        }
      }

      // Rotation phase
      s.rotation_phase = classifyRotation(s);
    }

    // RS ranking: rank by real-time changePercent (1 = strongest). Sectors without a
    // change get no rank instead of being ranked as 0%.
    const sorted = sectors
      .filter((s) => s.changePercent != null && Number.isFinite(s.changePercent))
      .sort((a, b) => (b.changePercent as number) - (a.changePercent as number));
    sorted.forEach((s, i) => {
      const match = sectors.find(x => x.symbol === s.symbol);
      if (match) match.rs_rank = i + 1;
    });
  } catch (err) {
    console.error('Sector enrichment error (non-fatal):', err);
  }
  return sectors;
}

// GET /api/sectors/heatmap - Get sector performance data
export async function GET(req: NextRequest) {
  // Auth guard: AV license requires authenticated users only
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in to access market data' }, { status: 401 });
  }

  try {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }
    
    // Try Alpha Vantage sector performance endpoint first
    try {
      await avTakeToken();
      const res = await fetch(
        `https://www.alphavantage.co/query?function=SECTOR&apikey=${apiKey}`
      );
      const data = await res.json();
      
      if (data['Rank A: Real-Time Performance']) {
        const realtime = data['Rank A: Real-Time Performance'];
        const daily = data['Rank B: 1 Day Performance'] || {};
        const weekly = data['Rank C: 5 Day Performance'] || {};
        const monthly = data['Rank D: 1 Month Performance'] || {};
        const quarterly = data['Rank E: 3 Month Performance'] || {};
        const ytd = data['Rank F: Year-to-Date (YTD) Performance'] || {};
        const yearly = data['Rank G: 1 Year Performance'] || {};
        
        const sectors = [
          { name: 'Technology', key: 'Information Technology' },
          { name: 'Financials', key: 'Financials' },
          { name: 'Healthcare', key: 'Health Care' },
          { name: 'Energy', key: 'Energy' },
          { name: 'Consumer Discretionary', key: 'Consumer Discretionary' },
          { name: 'Consumer Staples', key: 'Consumer Staples' },
          { name: 'Industrials', key: 'Industrials' },
          { name: 'Materials', key: 'Materials' },
          { name: 'Utilities', key: 'Utilities' },
          { name: 'Real Estate', key: 'Real Estate' },
          { name: 'Communication Services', key: 'Communication Services' },
        ];
        
        // Missing or unparseable values stay null (n/a), not 0%.
        const parsePercent = (str: string): number | null => {
          if (!str) return null;
          const n = parseFloat(String(str).replace('%', ''));
          return Number.isFinite(n) ? n : null;
        };
        
        const sectorData = sectors.map((sector, idx) => {
          const etf = SECTOR_ETFS.find(e => e.name === sector.name) || SECTOR_ETFS[idx];
          
          return {
            symbol: etf.symbol,
            name: sector.name,
            changePercent: parsePercent(realtime[sector.key]),
            daily: parsePercent(daily[sector.key]),
            weekly: parsePercent(weekly[sector.key]),
            monthly: parsePercent(monthly[sector.key]),
            quarterly: parsePercent(quarterly[sector.key]),
            ytd: parsePercent(ytd[sector.key]),
            yearly: parsePercent(yearly[sector.key]),
            weight: SECTOR_WEIGHTS[etf.symbol] || 5,
            color: etf.color,
          };
        });
        
        const enriched = await enrichSectors(sectorData);
        const fetchedAt = new Date().toISOString();
        return NextResponse.json({
          sectors: enriched,
          // `timestamp` stays the response time; `asOf` is the provider's own time (null if not sent).
          timestamp: fetchedAt,
          fetchedAt,
          asOf: parseAlphaVantageEasternTime(data['Meta Data']?.['Last Refreshed']),
          asOfTradingDay: null,
          source: 'alpha_vantage_sector'
        });
      }
      
      // Log if rate limited (shouldn't happen with premium)
      if (data['Information'] || data['Note']) {
        console.log('Alpha Vantage response:', data['Information'] || data['Note']);
      }
    } catch (err) {
      console.error('Alpha Vantage SECTOR endpoint error:', err);
    }
    
    // Fallback: Fetch individual ETF quotes (premium tier can handle this)
    console.log('Using ETF quotes fallback...');
    const sectorPromises = SECTOR_ETFS.map(async (etf) => {
      try {
        await avTakeToken();
        const res = await fetch(
          `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${etf.symbol}&entitlement=realtime&apikey=${apiKey}`
        );
        const data = await res.json();
        
        // Handle both realtime and delayed response formats
        const globalQuote = data['Global Quote'] || data['Global Quote - DATA DELAYED BY 15 MINUTES'];
        if (globalQuote && globalQuote['05. price']) {
          const quote = globalQuote;
          return {
            symbol: etf.symbol,
            name: etf.name,
            price: parseFloat(quote['05. price'] || '0'),
            change: parseFloat(quote['09. change'] || '0'),
            // A missing change percent is n/a, not a flat 0.00% day.
            changePercent: (() => {
              const n = parseFloat(String(quote['10. change percent'] ?? '').replace('%', ''));
              return Number.isFinite(n) ? n : null;
            })(),
            tradingDay: parseTradingDay(quote['07. latest trading day']),
            weight: SECTOR_WEIGHTS[etf.symbol] || 5,
            color: etf.color,
          };
        }
        return null;
      } catch (err) {
        console.error(`Error fetching ${etf.symbol}:`, err);
        return null;
      }
    });
    
    const results = await Promise.all(sectorPromises);
    const validSectors = results.filter(Boolean) as SectorData[];
    
    if (validSectors.length > 0) {
      const enriched = await enrichSectors(validSectors);
      const fetchedAt = new Date().toISOString();
      return NextResponse.json({
        sectors: enriched,
        timestamp: fetchedAt,
        fetchedAt,
        // GLOBAL_QUOTE gives a trading day but no time. Use the oldest quote's day.
        asOf: null,
        asOfTradingDay: oldestTradingDay(validSectors.map((s) => s.tradingDay)),
        source: 'alpha_vantage_etf'
      });
    }
    
    // This shouldn't happen with premium, but just in case
    return NextResponse.json({ 
      error: 'No sector data available',
      message: 'Alpha Vantage API returned no data'
    }, { status: 503 });
    
  } catch (error) {
    console.error('Error fetching sector data:', error);
    return NextResponse.json({ error: 'Failed to fetch sector data' }, { status: 500 });
  }
}
