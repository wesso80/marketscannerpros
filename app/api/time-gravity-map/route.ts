import { NextRequest, NextResponse } from 'next/server';
import { computeTimeGravityMap, type ComputeTGMOptions } from '@/lib/time/timeGravityMap';
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
 * New behaviour:
 * - Tags midpoints that the current price has touched or overshot BEFORE
 *   computing the gravity map, so stale targets are cleared every request.
 * - Returns `targetStatus` and `taggingStats` for reactive UI.
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
    // Priority 2: Fetch from database (with pre-tagging)
    else {
      try {
        const service = getMidpointService();

        // ── PRE-TAG: mark midpoints the current price has touched ──────
        // Use a 0.5% buffer around current price for the "current bar" range
        const tagBuffer = currentPrice * 0.005;
        const touchTagged = await service.checkAndTagMidpoints(
          symbol,
          currentPrice + tagBuffer,
          currentPrice - tagBuffer
        );

        // ── OVERSHOOT TAG: mark midpoints price has blown past ─────────
        const overshootTagged = await service.tagOvershootMidpoints(
          symbol,
          currentPrice,
          0.005  // 0.5% overshoot threshold
        );

        if (touchTagged > 0 || overshootTagged > 0) {
          console.log(
            `[TGM API] Pre-tagged ${touchTagged} touch + ${overshootTagged} overshoot midpoints for ${symbol}`
          );
        }

        // ── NOW fetch only the remaining untagged midpoints ────────────
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

    // No midpoints found — could mean all were tagged (target hit!)
    // Still compute TGM so the state machine returns TARGET_HIT / OVERSHOT
    // instead of a static "no data" error.
    
    // Compute Time Gravity Map with the engine's own in-memory tagging
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
      targetStatus: tgm.targetStatus,
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
