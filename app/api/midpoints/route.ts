import { NextRequest, NextResponse } from 'next/server';
import { getMidpointService } from '@/lib/midpointService';
import { getCandleProcessor, type OHLCVBar } from '@/lib/candleProcessor';

/**
 * Midpoint Management API
 * 
 * Endpoints for managing timeframe midpoints
 */

/**
 * GET /api/midpoints?symbol=BTCUSD&currentPrice=68000
 * 
 * Fetch untagged midpoints for a symbol
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const symbol = searchParams.get('symbol');
    const priceStr = searchParams.get('currentPrice');
    const maxDistance = parseFloat(searchParams.get('maxDistance') || '10');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    
    if (!symbol) {
      return NextResponse.json(
        { error: 'Missing required parameter: symbol' },
        { status: 400 }
      );
    }
    
    if (!priceStr) {
      return NextResponse.json(
        { error: 'Missing required parameter: currentPrice' },
        { status: 400 }
      );
    }
    
    const currentPrice = parseFloat(priceStr);
    
    if (isNaN(currentPrice) || currentPrice <= 0) {
      return NextResponse.json(
        { error: 'Invalid currentPrice value' },
        { status: 400 }
      );
    }
    
    const service = getMidpointService();
    
    // Get untagged midpoints
    const midpoints = await service.getUntaggedMidpoints(symbol, currentPrice, {
      maxDistancePercent: maxDistance,
      limit,
    });
    
    // Get stats
    const stats = await service.getMidpointStats(symbol);
    
    return NextResponse.json({
      success: true,
      symbol,
      currentPrice,
      timestamp: new Date().toISOString(),
      data: {
        midpoints,
        count: midpoints.length,
        stats,
      },
    });
    
  } catch (error) {
    console.error('Midpoints API Error:', error);
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
 * POST /api/midpoints
 * 
 * Store new candle and calculate midpoint
 * 
 * Body:
 * {
 *   symbol: string,
 *   timeframe: string,
 *   candle: { time, open, high, low, close, volume },
 *   assetType: 'crypto' | 'stock' | 'forex'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { symbol, timeframe, candle, assetType = 'crypto' } = body;
    
    if (!symbol || !timeframe || !candle) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, timeframe, candle' },
        { status: 400 }
      );
    }
    
    // Validate candle data
    if (!candle.time || !candle.high || !candle.low) {
      return NextResponse.json(
        { error: 'Invalid candle data: time, high, low are required' },
        { status: 400 }
      );
    }
    
    const processor = getCandleProcessor();
    
    const bar: OHLCVBar = {
      time: new Date(candle.time),
      open: candle.open || candle.close || 0,
      high: candle.high,
      low: candle.low,
      close: candle.close || candle.open || 0,
      volume: candle.volume,
    };
    
    const success = await processor.processCandle(symbol, timeframe, bar, assetType);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to process candle' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      symbol,
      timeframe,
      timestamp: new Date().toISOString(),
      message: 'Midpoint stored successfully',
    });
    
  } catch (error) {
    console.error('Midpoints API Error:', error);
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
 * PUT /api/midpoints/tag
 * 
 * Update tagging status for midpoints based on current price
 * 
 * Body:
 * {
 *   symbol: string,
 *   currentHigh: number,
 *   currentLow: number
 * }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { symbol, currentHigh, currentLow } = body;
    
    if (!symbol || !currentHigh || !currentLow) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, currentHigh, currentLow' },
        { status: 400 }
      );
    }
    
    const processor = getCandleProcessor();
    const taggedCount = await processor.updateTaggingStatus(symbol, currentHigh, currentLow);
    
    return NextResponse.json({
      success: true,
      symbol,
      taggedCount,
      timestamp: new Date().toISOString(),
      message: `Tagged ${taggedCount} midpoint(s)`,
    });
    
  } catch (error) {
    console.error('Midpoints API Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
