import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasProTraderAccess } from '@/lib/proTraderAccess';
import {
  computeCrossMarketConfluence,
  getCrossMarketSummary,
} from '@/lib/time/crossMarketConfluence';
import { computeCryptoTimeConfluence } from '@/lib/time/cryptoTimeConfluence';
import { computeEquityTimeConfluence } from '@/lib/time/equityTimeConfluence';

/**
 * GET /api/cross-market-confluence
 * 
 * Returns cross-market time confluence analysis across:
 * - Crypto cycles (UTC anchor)
 * - Equity cycles (trading day anchor)
 * - Options expiry (OPEX)
 * - Economic calendar events
 * 
 * Query params:
 * - market: 'all' | 'crypto' | 'equity' (default: 'all')
 * - summary: 'true' | 'false' (default: 'false') - Return compact summary
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasProTraderAccess(session.tier)) {
      return NextResponse.json({ success: false, error: 'Pro Trader subscription required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const market = searchParams.get('market') || 'all';
    const summaryOnly = searchParams.get('summary') === 'true';

    // Summary mode - quick response
    if (summaryOnly) {
      const summary = getCrossMarketSummary();
      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        summary,
      });
    }

    // Single market mode
    if (market === 'crypto') {
      const crypto = computeCryptoTimeConfluence();
      return NextResponse.json({
        success: true,
        market: 'crypto',
        timestamp: crypto.timestampUTC,
        confluenceScore: crypto.confluenceScore,
        confluenceLevel: crypto.confluenceLevel,
        isHighConfluence: crypto.isHighConfluence,
        description: crypto.description,
        alert: crypto.alert,
        activeCycles: crypto.activeCycles.map(c => ({
          cycle: c.cycle,
          score: c.score,
          hoursToClose: Number(c.hoursToClose.toFixed(2)),
          isHighPriority: c.isHighPriority,
        })),
      });
    }

    if (market === 'equity') {
      const equity = computeEquityTimeConfluence();
      return NextResponse.json({
        success: true,
        market: 'equity',
        timestamp: equity.timestampET,
        tradingDayIndex: equity.tradingDayIndex,
        confluenceScore: equity.confluenceScore,
        confluenceLevel: equity.confluenceLevel,
        isHighConfluence: equity.isHighConfluence,
        description: equity.description,
        alert: equity.alert,
        activeCycles: equity.activeCycles.map(c => ({
          cycle: c.cycle,
          score: c.score,
          hoursToClose: Number(c.hoursToClose.toFixed(2)),
          tradingDaysToClose: c.tradingDaysToClose,
          isHighPriority: c.isHighPriority,
        })),
      });
    }

    // Cross-market mode (default)
    const crossMarket = computeCrossMarketConfluence();

    return NextResponse.json({
      success: true,
      market: 'all',
      timestamp: crossMarket.timestampUTC,
      totalConfluenceScore: crossMarket.totalConfluenceScore,
      confluenceLevel: crossMarket.confluenceLevel,
      isExtremeConfluence: crossMarket.isExtremeConfluence,
      description: crossMarket.description,
      alert: crossMarket.alert,
      
      // Market breakdown
      breakdown: {
        crypto: crossMarket.cryptoContribution,
        equity: crossMarket.equityContribution,
        options: crossMarket.optionsContribution,
        economic: crossMarket.economicContribution,
      },
      
      // Individual market scores
      crypto: {
        score: crossMarket.crypto.confluenceScore,
        level: crossMarket.crypto.confluenceLevel,
        activeCycles: crossMarket.crypto.activeCycles.length,
      },
      equity: {
        score: crossMarket.equity.confluenceScore,
        level: crossMarket.equity.confluenceLevel,
        activeCycles: crossMarket.equity.activeCycles.length,
        tradingDayIndex: crossMarket.equity.tradingDayIndex,
      },
      
      // Options expiry
      optionsExpiry: {
        date: crossMarket.nextOptionsExpiry.date.toISOString(),
        type: crossMarket.nextOptionsExpiry.type,
        label: crossMarket.nextOptionsExpiry.label,
        hoursAway: Number(crossMarket.nextOptionsExpiry.hoursAway.toFixed(2)),
        score: crossMarket.nextOptionsExpiry.score,
      },
      
      // Active events
      activeEvents: crossMarket.activeEvents.map(e => ({
        type: e.type,
        label: e.label,
        score: e.score,
        hoursAway: Number(e.hoursAway.toFixed(2)),
        isHighPriority: e.isHighPriority,
        details: e.details,
      })),
    });
  } catch (error) {
    console.error('[cross-market-confluence] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to calculate cross-market confluence',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
