import { NextRequest, NextResponse } from 'next/server';

/**
 * Economic Calendar API
 * 
 * Returns upcoming economic events that move markets:
 * - FOMC meetings & rate decisions
 * - CPI/PPI inflation data
 * - Jobs reports (NFP, unemployment)
 * - GDP releases
 * - Other high-impact events
 * 
 * GET /api/economic-calendar
 * Query params:
 *   - days: number of days ahead (default: 30)
 *   - impact: 'high' | 'medium' | 'all' (default: 'all')
 */

// Economic events database (manually curated for accuracy)
// These are the key market-moving events traders care about
const ECONOMIC_EVENTS_2025: EconomicEvent[] = [
  // January 2025
  { date: '2025-01-03', time: '08:30', event: 'ISM Manufacturing PMI', country: 'US', impact: 'high', category: 'manufacturing' },
  { date: '2025-01-10', time: '08:30', event: 'Non-Farm Payrolls (Dec)', country: 'US', impact: 'high', category: 'employment', forecast: '150K', previous: '227K' },
  { date: '2025-01-10', time: '08:30', event: 'Unemployment Rate (Dec)', country: 'US', impact: 'high', category: 'employment', forecast: '4.2%', previous: '4.2%' },
  { date: '2025-01-15', time: '08:30', event: 'CPI (YoY) (Dec)', country: 'US', impact: 'high', category: 'inflation', forecast: '2.8%', previous: '2.7%' },
  { date: '2025-01-15', time: '08:30', event: 'Core CPI (YoY) (Dec)', country: 'US', impact: 'high', category: 'inflation', forecast: '3.3%', previous: '3.3%' },
  { date: '2025-01-16', time: '08:30', event: 'Retail Sales (Dec)', country: 'US', impact: 'medium', category: 'consumer' },
  { date: '2025-01-29', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank', forecast: '4.50%', previous: '4.50%' },
  { date: '2025-01-30', time: '08:30', event: 'GDP (Q4 Advance)', country: 'US', impact: 'high', category: 'gdp' },
  
  // February 2025
  { date: '2025-02-07', time: '08:30', event: 'Non-Farm Payrolls (Jan)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2025-02-07', time: '08:30', event: 'Unemployment Rate (Jan)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2025-02-12', time: '08:30', event: 'CPI (YoY) (Jan)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2025-02-12', time: '08:30', event: 'Core CPI (YoY) (Jan)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2025-02-14', time: '08:30', event: 'Retail Sales (Jan)', country: 'US', impact: 'medium', category: 'consumer' },
  { date: '2025-02-27', time: '08:30', event: 'GDP (Q4 Second Estimate)', country: 'US', impact: 'medium', category: 'gdp' },
  
  // March 2025
  { date: '2025-03-07', time: '08:30', event: 'Non-Farm Payrolls (Feb)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2025-03-12', time: '08:30', event: 'CPI (YoY) (Feb)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2025-03-19', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
  { date: '2025-03-27', time: '08:30', event: 'GDP (Q4 Final)', country: 'US', impact: 'medium', category: 'gdp' },
  
  // April 2025
  { date: '2025-04-04', time: '08:30', event: 'Non-Farm Payrolls (Mar)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2025-04-10', time: '08:30', event: 'CPI (YoY) (Mar)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2025-04-30', time: '08:30', event: 'GDP (Q1 Advance)', country: 'US', impact: 'high', category: 'gdp' },
  
  // May 2025
  { date: '2025-05-02', time: '08:30', event: 'Non-Farm Payrolls (Apr)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2025-05-07', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
  { date: '2025-05-13', time: '08:30', event: 'CPI (YoY) (Apr)', country: 'US', impact: 'high', category: 'inflation' },
  
  // June 2025
  { date: '2025-06-06', time: '08:30', event: 'Non-Farm Payrolls (May)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2025-06-11', time: '08:30', event: 'CPI (YoY) (May)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2025-06-18', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
  { date: '2025-06-26', time: '08:30', event: 'GDP (Q1 Final)', country: 'US', impact: 'medium', category: 'gdp' },
  
  // July 2025
  { date: '2025-07-03', time: '08:30', event: 'Non-Farm Payrolls (Jun)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2025-07-11', time: '08:30', event: 'CPI (YoY) (Jun)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2025-07-30', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
  { date: '2025-07-30', time: '08:30', event: 'GDP (Q2 Advance)', country: 'US', impact: 'high', category: 'gdp' },
  
  // August 2025
  { date: '2025-08-01', time: '08:30', event: 'Non-Farm Payrolls (Jul)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2025-08-13', time: '08:30', event: 'CPI (YoY) (Jul)', country: 'US', impact: 'high', category: 'inflation' },
  
  // September 2025
  { date: '2025-09-05', time: '08:30', event: 'Non-Farm Payrolls (Aug)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2025-09-10', time: '08:30', event: 'CPI (YoY) (Aug)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2025-09-17', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
  { date: '2025-09-25', time: '08:30', event: 'GDP (Q2 Final)', country: 'US', impact: 'medium', category: 'gdp' },
  
  // October 2025
  { date: '2025-10-03', time: '08:30', event: 'Non-Farm Payrolls (Sep)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2025-10-10', time: '08:30', event: 'CPI (YoY) (Sep)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2025-10-30', time: '08:30', event: 'GDP (Q3 Advance)', country: 'US', impact: 'high', category: 'gdp' },
  
  // November 2025
  { date: '2025-11-05', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
  { date: '2025-11-07', time: '08:30', event: 'Non-Farm Payrolls (Oct)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2025-11-13', time: '08:30', event: 'CPI (YoY) (Oct)', country: 'US', impact: 'high', category: 'inflation' },
  
  // December 2025
  { date: '2025-12-05', time: '08:30', event: 'Non-Farm Payrolls (Nov)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2025-12-10', time: '08:30', event: 'CPI (YoY) (Nov)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2025-12-17', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
  { date: '2025-12-23', time: '08:30', event: 'GDP (Q3 Final)', country: 'US', impact: 'medium', category: 'gdp' },
  
  // ========== 2026 ==========
  
  // January 2026
  { date: '2026-01-02', time: '08:30', event: 'ISM Manufacturing PMI', country: 'US', impact: 'high', category: 'manufacturing' },
  { date: '2026-01-10', time: '08:30', event: 'Non-Farm Payrolls (Dec)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2026-01-10', time: '08:30', event: 'Unemployment Rate (Dec)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2026-01-14', time: '08:30', event: 'CPI (YoY) (Dec)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2026-01-14', time: '08:30', event: 'Core CPI (YoY) (Dec)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2026-01-16', time: '08:30', event: 'Retail Sales (Dec)', country: 'US', impact: 'medium', category: 'consumer' },
  { date: '2026-01-28', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
  { date: '2026-01-29', time: '08:30', event: 'GDP (Q4 Advance)', country: 'US', impact: 'high', category: 'gdp' },
  
  // February 2026
  { date: '2026-02-06', time: '08:30', event: 'Non-Farm Payrolls (Jan)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2026-02-06', time: '08:30', event: 'Unemployment Rate (Jan)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2026-02-11', time: '08:30', event: 'CPI (YoY) (Jan)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2026-02-11', time: '08:30', event: 'Core CPI (YoY) (Jan)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2026-02-13', time: '08:30', event: 'Retail Sales (Jan)', country: 'US', impact: 'medium', category: 'consumer' },
  { date: '2026-02-26', time: '08:30', event: 'GDP (Q4 Second Estimate)', country: 'US', impact: 'medium', category: 'gdp' },
  
  // March 2026
  { date: '2026-03-06', time: '08:30', event: 'Non-Farm Payrolls (Feb)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2026-03-11', time: '08:30', event: 'CPI (YoY) (Feb)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2026-03-18', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
  { date: '2026-03-26', time: '08:30', event: 'GDP (Q4 Final)', country: 'US', impact: 'medium', category: 'gdp' },
  
  // April 2026
  { date: '2026-04-03', time: '08:30', event: 'Non-Farm Payrolls (Mar)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2026-04-10', time: '08:30', event: 'CPI (YoY) (Mar)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2026-04-29', time: '08:30', event: 'GDP (Q1 Advance)', country: 'US', impact: 'high', category: 'gdp' },
  
  // May 2026
  { date: '2026-05-01', time: '08:30', event: 'Non-Farm Payrolls (Apr)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2026-05-06', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
  { date: '2026-05-12', time: '08:30', event: 'CPI (YoY) (Apr)', country: 'US', impact: 'high', category: 'inflation' },
  
  // June 2026
  { date: '2026-06-05', time: '08:30', event: 'Non-Farm Payrolls (May)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2026-06-10', time: '08:30', event: 'CPI (YoY) (May)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2026-06-17', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
  { date: '2026-06-25', time: '08:30', event: 'GDP (Q1 Final)', country: 'US', impact: 'medium', category: 'gdp' },
  
  // July 2026
  { date: '2026-07-02', time: '08:30', event: 'Non-Farm Payrolls (Jun)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2026-07-14', time: '08:30', event: 'CPI (YoY) (Jun)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2026-07-29', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
  { date: '2026-07-30', time: '08:30', event: 'GDP (Q2 Advance)', country: 'US', impact: 'high', category: 'gdp' },
  
  // August 2026
  { date: '2026-08-07', time: '08:30', event: 'Non-Farm Payrolls (Jul)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2026-08-12', time: '08:30', event: 'CPI (YoY) (Jul)', country: 'US', impact: 'high', category: 'inflation' },
  
  // September 2026
  { date: '2026-09-04', time: '08:30', event: 'Non-Farm Payrolls (Aug)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2026-09-11', time: '08:30', event: 'CPI (YoY) (Aug)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2026-09-16', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
  { date: '2026-09-24', time: '08:30', event: 'GDP (Q2 Final)', country: 'US', impact: 'medium', category: 'gdp' },
  
  // October 2026
  { date: '2026-10-02', time: '08:30', event: 'Non-Farm Payrolls (Sep)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2026-10-13', time: '08:30', event: 'CPI (YoY) (Sep)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2026-10-29', time: '08:30', event: 'GDP (Q3 Advance)', country: 'US', impact: 'high', category: 'gdp' },
  
  // November 2026
  { date: '2026-11-04', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
  { date: '2026-11-06', time: '08:30', event: 'Non-Farm Payrolls (Oct)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2026-11-12', time: '08:30', event: 'CPI (YoY) (Oct)', country: 'US', impact: 'high', category: 'inflation' },
  
  // December 2026
  { date: '2026-12-04', time: '08:30', event: 'Non-Farm Payrolls (Nov)', country: 'US', impact: 'high', category: 'employment' },
  { date: '2026-12-10', time: '08:30', event: 'CPI (YoY) (Nov)', country: 'US', impact: 'high', category: 'inflation' },
  { date: '2026-12-16', time: '14:00', event: 'FOMC Rate Decision', country: 'US', impact: 'high', category: 'central_bank' },
  { date: '2026-12-23', time: '08:30', event: 'GDP (Q3 Final)', country: 'US', impact: 'medium', category: 'gdp' },
];

interface EconomicEvent {
  date: string;
  time: string;
  event: string;
  country: string;
  impact: 'high' | 'medium' | 'low';
  category: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get('days') || '30');
    const impact = url.searchParams.get('impact') || 'all';
    
    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    
    // Filter events within date range
    let events = ECONOMIC_EVENTS_2025.filter(event => {
      const eventDate = new Date(event.date);
      return eventDate >= now && eventDate <= endDate;
    });
    
    // Filter by impact if specified
    if (impact !== 'all') {
      events = events.filter(event => event.impact === impact);
    }
    
    // Sort by date
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Group by date for easier display
    const groupedByDate: Record<string, EconomicEvent[]> = {};
    for (const event of events) {
      if (!groupedByDate[event.date]) {
        groupedByDate[event.date] = [];
      }
      groupedByDate[event.date].push(event);
    }
    
    // Find next major event
    const nextMajor = events.find(e => e.impact === 'high');
    
    // Calculate days until next major event
    const daysUntilMajor = nextMajor 
      ? Math.ceil((new Date(nextMajor.date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : null;
    
    return NextResponse.json({
      events,
      grouped: groupedByDate,
      count: events.length,
      nextMajorEvent: nextMajor || null,
      daysUntilMajor,
      dateRange: {
        from: now.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
      },
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Economic calendar error:', error);
    return NextResponse.json({ error: 'Failed to fetch economic calendar' }, { status: 500 });
  }
}
