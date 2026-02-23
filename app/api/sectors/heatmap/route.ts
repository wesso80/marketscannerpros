import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';

// Sector ETF mappings
const SECTOR_ETFS = [
  { symbol: 'XLK', name: 'Technology', color: '#3B82F6' },
  { symbol: 'XLF', name: 'Financials', color: '#10B981' },
  { symbol: 'XLV', name: 'Healthcare', color: '#EC4899' },
  { symbol: 'XLE', name: 'Energy', color: '#F59E0B' },
  { symbol: 'XLY', name: 'Consumer Discretionary', color: '#8B5CF6' },
  { symbol: 'XLP', name: 'Consumer Staples', color: '#06B6D4' },
  { symbol: 'XLI', name: 'Industrials', color: '#6366F1' },
  { symbol: 'XLB', name: 'Materials', color: '#84CC16' },
  { symbol: 'XLU', name: 'Utilities', color: '#F97316' },
  { symbol: 'XLRE', name: 'Real Estate', color: '#EF4444' },
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
  changePercent: number;
  weight: number;
  color: string;
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
        
        const parsePercent = (str: string) => {
          if (!str) return 0;
          return parseFloat(str.replace('%', '')) || 0;
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
        
        return NextResponse.json({
          sectors: sectorData,
          timestamp: new Date().toISOString(),
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
        const res = await fetch(
          `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${etf.symbol}&entitlement=delayed&apikey=${apiKey}`
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
            changePercent: parseFloat(quote['10. change percent']?.replace('%', '') || '0'),
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
      return NextResponse.json({
        sectors: validSectors,
        timestamp: new Date().toISOString(),
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
