import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';

// Cache for 5 minutes
let cache: { data: MarketStatusResponse | null; timestamp: number } = { data: null, timestamp: 0 };
const CACHE_DURATION = 5 * 60 * 1000;

interface MarketInfo {
  market_type: string;
  region: string;
  primary_exchanges: string;
  local_open: string;
  local_close: string;
  current_status: string;
  notes: string;
}

interface MarketStatusResponse {
  endpoint: string;
  markets: MarketInfo[];
}

export async function GET(req: NextRequest) {
  // Auth guard: AV license requires authenticated users only
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in to access market data' }, { status: 401 });
  }

  try {
    const now = Date.now();
    
    // Return cached data if fresh
    if (cache.data && (now - cache.timestamp) < CACHE_DURATION) {
      return NextResponse.json(formatResponse(cache.data));
    }
    
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }
    
    await avTakeToken();
    const response = await fetch(
      `https://www.alphavantage.co/query?function=MARKET_STATUS&apikey=${apiKey}`
    );
    
    if (!response.ok) {
      throw new Error(`Alpha Vantage API error: ${response.status}`);
    }
    
    const data: MarketStatusResponse = await response.json();
    
    // Cache the response
    cache = { data, timestamp: now };
    
    return NextResponse.json(formatResponse(data));
  } catch (error) {
    console.error('Market status error:', error);
    return NextResponse.json({ error: 'Failed to fetch market status' }, { status: 500 });
  }
}

function formatResponse(data: MarketStatusResponse) {
  const markets = data.markets || [];
  
  // Find key markets
  const usEquity = markets.find(m => m.market_type === 'Equity' && m.region === 'United States');
  const usOptions = markets.find(m => m.market_type === 'Equity' && m.region === 'United States' && m.primary_exchanges?.includes('Options'));
  const forex = markets.find(m => m.market_type === 'Forex');
  const crypto = markets.find(m => m.market_type === 'Cryptocurrency');
  const london = markets.find(m => m.region === 'United Kingdom');
  const tokyo = markets.find(m => m.region === 'Japan');
  const shanghai = markets.find(m => m.region === 'Mainland China');
  const hongKong = markets.find(m => m.region === 'Hong Kong');
  const germany = markets.find(m => m.region === 'Germany');
  
  // Determine session for US market
  const usStatus = usEquity?.current_status || 'closed';
  const usNotes = usEquity?.notes || '';
  
  let session: 'pre-market' | 'regular' | 'after-hours' | 'closed' = 'closed';
  let sessionDisplay = 'Closed';
  
  if (usStatus === 'open') {
    session = 'regular';
    sessionDisplay = 'Regular Session';
  } else if (usNotes.toLowerCase().includes('pre-market') || usNotes.toLowerCase().includes('premarket')) {
    session = 'pre-market';
    sessionDisplay = 'Pre-Market';
  } else if (usNotes.toLowerCase().includes('after') || usNotes.toLowerCase().includes('extended')) {
    session = 'after-hours';
    sessionDisplay = 'After-Hours';
  }
  
  // Calculate time until next open/close
  const now = new Date();
  const estOffset = -5; // EST offset (simplified, doesn't account for DST)
  const estHour = (now.getUTCHours() + estOffset + 24) % 24;
  const estMinute = now.getUTCMinutes();
  const dayOfWeek = now.getUTCDay();
  
  let nextEvent = '';
  let minutesUntil = 0;
  
  if (session === 'regular') {
    // Market closes at 4pm EST
    const closeHour = 16;
    minutesUntil = (closeHour - estHour) * 60 - estMinute;
    if (minutesUntil > 0) {
      nextEvent = `Closes in ${formatTime(minutesUntil)}`;
    }
  } else if (session === 'pre-market') {
    // Regular session starts at 9:30am EST
    const openHour = 9;
    const openMinute = 30;
    minutesUntil = (openHour - estHour) * 60 + (openMinute - estMinute);
    if (minutesUntil > 0) {
      nextEvent = `Opens in ${formatTime(minutesUntil)}`;
    }
  } else if (session === 'closed') {
    // Calculate next open
    if (dayOfWeek === 0) { // Sunday
      nextEvent = 'Opens Mon 9:30 AM ET';
    } else if (dayOfWeek === 6) { // Saturday
      nextEvent = 'Opens Mon 9:30 AM ET';
    } else if (estHour >= 20) { // After 8pm
      nextEvent = 'Opens tomorrow 9:30 AM ET';
    } else if (estHour < 4) { // Before 4am
      nextEvent = 'Pre-market opens 4:00 AM ET';
    }
  }
  
  return {
    timestamp: new Date().toISOString(),
    us: {
      status: usStatus,
      session,
      sessionDisplay,
      nextEvent,
      localOpen: usEquity?.local_open || '09:30',
      localClose: usEquity?.local_close || '16:00',
      notes: usNotes,
    },
    global: {
      forex: {
        status: forex?.current_status || 'open', // Forex is 24/5
        notes: forex?.notes || '',
      },
      crypto: {
        status: 'open', // Crypto is 24/7
        notes: 'Markets open 24/7',
      },
      europe: {
        london: { status: london?.current_status || 'closed', localOpen: london?.local_open, localClose: london?.local_close },
        germany: { status: germany?.current_status || 'closed', localOpen: germany?.local_open, localClose: germany?.local_close },
      },
      asia: {
        tokyo: { status: tokyo?.current_status || 'closed', localOpen: tokyo?.local_open, localClose: tokyo?.local_close },
        shanghai: { status: shanghai?.current_status || 'closed', localOpen: shanghai?.local_open, localClose: shanghai?.local_close },
        hongKong: { status: hongKong?.current_status || 'closed', localOpen: hongKong?.local_open, localClose: hongKong?.local_close },
      },
    },
    allMarkets: markets.map(m => ({
      type: m.market_type,
      region: m.region,
      exchanges: m.primary_exchanges,
      status: m.current_status,
      localOpen: m.local_open,
      localClose: m.local_close,
      notes: m.notes,
    })),
  };
}

function formatTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
