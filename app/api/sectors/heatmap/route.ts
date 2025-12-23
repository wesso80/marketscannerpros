import { NextRequest, NextResponse } from 'next/server';

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
  price: number;
  change: number;
  changePercent: number;
  weight: number;
  color: string;
}

// GET /api/sectors/heatmap - Get sector performance data
export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    
    // Try Alpha Vantage sector performance first
    if (apiKey) {
      try {
        const res = await fetch(
          `https://www.alphavantage.co/query?function=SECTOR&apikey=${apiKey}`
        );
        const data = await res.json();
        
        if (data['Rank A: Real-Time Performance']) {
          // Parse sector performance data
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
          
          const sectorData = sectors.map((sector, idx) => {
            const etf = SECTOR_ETFS.find(e => e.name === sector.name) || SECTOR_ETFS[idx];
            const parsePercent = (str: string) => parseFloat(str?.replace('%', '') || '0');
            
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
      } catch (err) {
        console.error('Alpha Vantage sector API error:', err);
      }
      
      // Fallback: Fetch individual ETF quotes
      const sectorPromises = SECTOR_ETFS.map(async (etf) => {
        try {
          const res = await fetch(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${etf.symbol}&apikey=${apiKey}`
          );
          const data = await res.json();
          
          if (data['Global Quote']) {
            const quote = data['Global Quote'];
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
        } catch {
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
    }
    
    // Fallback: Return mock data for demo
    const mockSectors = SECTOR_ETFS.map(etf => ({
      symbol: etf.symbol,
      name: etf.name,
      price: 100 + Math.random() * 100,
      change: (Math.random() - 0.5) * 5,
      changePercent: (Math.random() - 0.5) * 4,
      weight: SECTOR_WEIGHTS[etf.symbol] || 5,
      color: etf.color,
    }));
    
    return NextResponse.json({
      sectors: mockSectors,
      timestamp: new Date().toISOString(),
      source: 'mock'
    });
    
  } catch (error) {
    console.error('Error fetching sector data:', error);
    return NextResponse.json({ error: 'Failed to fetch sector data' }, { status: 500 });
  }
}
