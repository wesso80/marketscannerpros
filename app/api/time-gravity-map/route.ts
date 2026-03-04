import { NextRequest, NextResponse } from 'next/server';
import { computeTimeGravityMap } from '@/lib/time/timeGravityMap';
import type { MidpointRecord } from '@/lib/time/midpointDebt';
import { getMidpointService } from '@/lib/midpointService';

/**
 * Time Gravity Map API Endpoint
 * 
 * GET /api/time-gravity-map?symbol=BTCUSD&price=68000
 * 
 * Query Params:
 * - symbol: Trading symbol (required)
 * - price: Current price (required)
 * - maxDistance: Max distance % to fetch midpoints (default: 10)
 * - useDemo: Use demo data instead of database (default: false)
 * - midpoints: JSON array of midpoint records (optional, overrides database)
 * 
 * Response:
 * - TimeGravityMap object with zones, targets, heatmap, etc.
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const symbol = searchParams.get('symbol');
    const priceStr = searchParams.get('price');
    const midpointsStr = searchParams.get('midpoints');
    const maxDistance = parseFloat(searchParams.get('maxDistance') || '10');
    const useDemo = searchParams.get('useDemo') === 'true';
    
    if (!symbol) {
      return NextResponse.json(
        { error: 'Missing required parameter: symbol' },
        { status: 400 }
      );
    }
    
    if (!priceStr) {
      return NextResponse.json(
        { error: 'Missing required parameter: price' },
        { status: 400 }
      );
    }
    
    const currentPrice = parseFloat(priceStr);
    
    if (isNaN(currentPrice) || currentPrice <= 0) {
      return NextResponse.json(
        { error: 'Invalid price value' },
        { status: 400 }
      );
    }
    
    let midpoints: MidpointRecord[] = [];
    
    // Priority 1: Custom midpoints from query param
    if (midpointsStr) {
      try {
        midpoints = JSON.parse(midpointsStr);
      } catch (e) {
        return NextResponse.json(
          { error: 'Invalid midpoints JSON' },
          { status: 400 }
        );
      }
    }
    // Priority 2: Fetch from database
    else if (!useDemo) {
      try {
        const service = getMidpointService();
        midpoints = await service.getUntaggedMidpoints(symbol, currentPrice, {
          maxDistancePercent: maxDistance,
          limit: 100,
        });
      } catch (error) {
        console.error('Failed to fetch midpoints from database:', error);
        // Fall back to demo data if database fails
        midpoints = generateDemoMidpoints(currentPrice);
      }
    }
    // Priority 3: Demo data
    else {
      midpoints = generateDemoMidpoints(currentPrice);
    }
    
    // Compute Time Gravity Map
    const tgm = computeTimeGravityMap(midpoints, currentPrice);
    
    // Determine data source
    let dataSource = 'demo';
    if (midpointsStr) {
      dataSource = 'custom';
    } else if (!useDemo && midpoints.length > 0) {
      dataSource = 'database';
    }
    
    // Return full TGM data
    return NextResponse.json({
      success: true,
      symbol,
      timestamp: new Date().toISOString(),
      dataSource,
      midpointCount: midpoints.length,
      data: tgm,
    });
    
  } catch (error) {
    console.error('Time Gravity Map API Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint for submitting custom midpoint data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { symbol, currentPrice, midpoints } = body;
    
    if (!currentPrice || !midpoints) {
      return NextResponse.json(
        { error: 'Missing required fields: currentPrice, midpoints' },
        { status: 400 }
      );
    }
    
    if (!Array.isArray(midpoints)) {
      return NextResponse.json(
        { error: 'midpoints must be an array' },
        { status: 400 }
      );
    }
    
    // Compute Time Gravity Map
    const tgm = computeTimeGravityMap(midpoints, currentPrice);
    
    return NextResponse.json({
      success: true,
      symbol: symbol || 'UNKNOWN',
      timestamp: new Date().toISOString(),
      data: tgm,
    });
    
  } catch (error) {
    console.error('Time Gravity Map API Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Generate demo midpoints for testing
 */
function generateDemoMidpoints(currentPrice: number): MidpointRecord[] {
  const now = new Date();
  
  const offsets = [
    { tf: '1H', offset: 0.005, hoursAgo: 1 },
    { tf: '4H', offset: 0.007, hoursAgo: 4 },
    { tf: '1D', offset: 0.01, hoursAgo: 24 },
    { tf: '1W', offset: 0.015, hoursAgo: 168 },
    { tf: '1M', offset: 0.02, hoursAgo: 720 },
  ];
  
  const midpoints: MidpointRecord[] = [];
  
  for (const { tf, offset, hoursAgo } of offsets) {
    // Create midpoint above current price
    const midpointAbove = currentPrice * (1 + offset);
    const high = midpointAbove * 1.001;
    const low = midpointAbove * 0.999;
    
    const candleOpenTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    const candleCloseTime = new Date(candleOpenTime.getTime() + hoursAgo * 60 * 60 * 1000);
    
    midpoints.push({
      timeframe: tf,
      midpoint: midpointAbove,
      high,
      low,
      createdAt: candleOpenTime,
      candleOpenTime,
      candleCloseTime,
      tagged: false,
      taggedAt: null,
      distanceFromPrice: ((midpointAbove - currentPrice) / currentPrice) * 100,
      ageMinutes: hoursAgo * 60,
      weight: getTFWeight(tf),
      isAbovePrice: true,
    });
    
    // Create midpoint below current price
    const midpointBelow = currentPrice * (1 - offset);
    const highBelow = midpointBelow * 1.001;
    const lowBelow = midpointBelow * 0.999;
    
    midpoints.push({
      timeframe: tf,
      midpoint: midpointBelow,
      high: highBelow,
      low: lowBelow,
      createdAt: candleOpenTime,
      candleOpenTime,
      candleCloseTime,
      tagged: false,
      taggedAt: null,
      distanceFromPrice: ((midpointBelow - currentPrice) / currentPrice) * 100,
      ageMinutes: hoursAgo * 60,
      weight: getTFWeight(tf),
      isAbovePrice: false,
    });
  }
  
  return midpoints;
}

function getTFWeight(tf: string): number {
  const weights: Record<string, number> = {
    '1H': 2,
    '4H': 3.5,
    '1D': 6,
    '1W': 10,
    '1M': 12,
    '3M': 15,
    '1Y': 18,
    '5Y': 24,
  };
  return weights[tf] || 1;
}
