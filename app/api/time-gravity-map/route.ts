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
    else {
      try {
        const service = getMidpointService();
        midpoints = await service.getUntaggedMidpoints(symbol, currentPrice, {
          maxDistancePercent: maxDistance,
          limit: 100,
        });
      } catch (error) {
        console.error('Failed to fetch midpoints from database:', error);
        return NextResponse.json(
          {
            success: false,
            error: 'Database connection failed. Ensure midpoints table exists and is populated.',
            hint: 'Run: npm run migrate:midpoints && npm run backfill:midpoints',
          },
          { status: 503 }
        );
      }
    }

    // No midpoints found — tell the client clearly
    if (midpoints.length === 0) {
      return NextResponse.json({
        success: false,
        error: `No midpoints found for ${symbol} within ${maxDistance}% of $${currentPrice}`,
        hint: 'Run backfill: npm run backfill:midpoints (crypto) or npm run backfill:equities',
        symbol,
        midpointCount: 0,
      }, { status: 404 });
    }
    
    // Compute Time Gravity Map
    const tgm = computeTimeGravityMap(midpoints, currentPrice);
    
    // Determine data source
    const dataSource = midpointsStr ? 'custom' : 'database';
    
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

// Demo data removed — production uses real midpoints from database only.
