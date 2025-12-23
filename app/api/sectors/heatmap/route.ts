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

// GET /api/sectors/heatmap - Get sector performance data
export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    
    // Try Alpha Vantage sector performance endpoint
    if (apiKey) {
      try {
        const res = await fetch(
          `https://www.alphavantage.co/query?function=SECTOR&apikey=${apiKey}`,
          { next: { revalidate: 300 } } // Cache for 5 minutes
        );
        const data = await res.json();
        
        // Check for rate limit or error
        if (data['Information'] || data['Note']) {
          console.log('Alpha Vantage rate limited, using fallback');
        } else if (data['Rank A: Real-Time Performance']) {
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
      } catch (err) {
        console.error('Alpha Vantage sector API error:', err);
      }
    }
    
    // Fallback: Return realistic mock data based on typical market movements
    // This ensures the heatmap always displays
    const mockSectors = SECTOR_ETFS.map(etf => {
      // Generate semi-realistic changes based on sector characteristics
      const baseChange = (Math.random() - 0.48) * 3; // Slight upward bias
      const volatilityFactor = etf.symbol === 'XLK' || etf.symbol === 'XLY' ? 1.5 : 
                               etf.symbol === 'XLU' || etf.symbol === 'XLP' ? 0.6 : 1;
      
      return {
        symbol: etf.symbol,
        name: etf.name,
        changePercent: baseChange * volatilityFactor,
        daily: baseChange * volatilityFactor,
        weekly: baseChange * volatilityFactor * 2.5,
        monthly: baseChange * volatilityFactor * 5,
        quarterly: (Math.random() - 0.4) * 15,
        ytd: (Math.random() - 0.3) * 25,
        yearly: (Math.random() - 0.3) * 30,
        weight: SECTOR_WEIGHTS[etf.symbol] || 5,
        color: etf.color,
      };
    });
    
    return NextResponse.json({
      sectors: mockSectors,
      timestamp: new Date().toISOString(),
      source: 'demo'
    });
    
  } catch (error) {
    console.error('Error fetching sector data:', error);
    
    // Even on error, return demo data so UI always works
    const fallbackSectors = SECTOR_ETFS.map(etf => ({
      symbol: etf.symbol,
      name: etf.name,
      changePercent: (Math.random() - 0.5) * 4,
      weight: SECTOR_WEIGHTS[etf.symbol] || 5,
      color: etf.color,
    }));
    
    return NextResponse.json({
      sectors: fallbackSectors,
      timestamp: new Date().toISOString(),
      source: 'fallback'
    });
  }
}
