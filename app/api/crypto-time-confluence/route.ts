import { NextRequest, NextResponse } from 'next/server';
import {
  computeCryptoTimeConfluence,
  getUpcomingHighPriorityCycles,
  shouldAlertSymbol,
  CONFLUENCE_ALERT_THRESHOLD,
} from '@/lib/time/cryptoTimeConfluence';

/**
 * GET /api/crypto-time-confluence
 * 
 * Returns the current crypto time confluence analysis
 * 
 * Query params:
 * - symbol: (optional) Crypto symbol to check for alerts
 * - minScore: (optional) Minimum confluence score for alerts (default: 6)
 * - upcomingOnly: (optional) Return only upcoming high-priority cycles
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const minScore = parseInt(searchParams.get('minScore') || String(CONFLUENCE_ALERT_THRESHOLD));
    const upcomingOnly = searchParams.get('upcomingOnly') === 'true';

    // Calculate current confluence
    const confluence = computeCryptoTimeConfluence();

    // If only upcoming cycles requested
    if (upcomingOnly) {
      const upcoming = getUpcomingHighPriorityCycles();
      return NextResponse.json({
        success: true,
        timestamp: confluence.timestampUTC,
        upcomingHighPriority: upcoming.map(cycle => ({
          cycle: cycle.cycle,
          cycleDays: cycle.cycleDays,
          score: cycle.score,
          nextClose: cycle.nextClose.toISOString(),
          hoursToClose: cycle.hoursToClose,
        })),
      });
    }

    // Check if symbol should receive an alert
    let shouldAlert = false;
    if (symbol) {
      shouldAlert = shouldAlertSymbol(symbol, confluence, {
        minScore,
        requireHighPriority: true,
      });
    }

    // Format response
    const response = {
      success: true,
      timestamp: confluence.timestampUTC,
      nextDailyClose: confluence.nextDailyClose.toISOString(),
      hoursToNextDaily: Number(confluence.hoursToNextDaily.toFixed(2)),
      confluenceScore: confluence.confluenceScore,
      confluenceLevel: confluence.confluenceLevel,
      isHighConfluence: confluence.isHighConfluence,
      description: confluence.description,
      alert: confluence.alert,
      activeCycles: confluence.activeCycles.map(cycle => ({
        cycle: cycle.cycle,
        cycleDays: cycle.cycleDays,
        score: cycle.score,
        nextClose: cycle.nextClose.toISOString(),
        hoursToClose: Number(cycle.hoursToClose.toFixed(2)),
        isHighPriority: cycle.isHighPriority,
      })),
      cycleBreakdown: confluence.cycleBreakdown,
      // Symbol-specific alert
      ...(symbol && {
        symbol,
        shouldAlert,
        alertThreshold: minScore,
      }),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[crypto-time-confluence] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to calculate crypto time confluence',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/crypto-time-confluence
 * 
 * Batch check multiple symbols for time confluence alerts
 * 
 * Body:
 * {
 *   symbols: string[],
 *   minScore?: number,
 *   requireHighPriority?: boolean
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbols = [], minScore = CONFLUENCE_ALERT_THRESHOLD, requireHighPriority = true } = body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request',
          message: 'symbols array is required',
        },
        { status: 400 }
      );
    }

    // Calculate confluence once
    const confluence = computeCryptoTimeConfluence();

    // Check each symbol
    const results = symbols.map(symbol => ({
      symbol,
      shouldAlert: shouldAlertSymbol(symbol, confluence, {
        minScore,
        requireHighPriority,
      }),
      confluenceScore: confluence.confluenceScore,
      confluenceLevel: confluence.confluenceLevel,
      activeCycles: confluence.activeCycles.filter(c => c.score > 0).map(c => c.cycle),
    }));

    // Filter to only symbols that should alert
    const alerts = results.filter(r => r.shouldAlert);

    return NextResponse.json({
      success: true,
      timestamp: confluence.timestampUTC,
      totalSymbols: symbols.length,
      alertCount: alerts.length,
      alerts,
      confluence: {
        score: confluence.confluenceScore,
        level: confluence.confluenceLevel,
        description: confluence.description,
        alert: confluence.alert,
      },
    });
  } catch (error) {
    console.error('[crypto-time-confluence] POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process batch confluence check',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
