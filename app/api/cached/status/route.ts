/**
 * Worker Status API
 * Monitor the health and status of background workers
 */

import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { getRedis } from '@/lib/redis';

export async function GET(req: NextRequest) {
  try {
    // 1. Get recent worker runs
    const recentRuns = await q<any>(`
      SELECT worker_name, started_at, finished_at, symbols_processed, 
             api_calls_made, errors_count, status, error_message
      FROM worker_runs
      ORDER BY started_at DESC
      LIMIT 10
    `);

    // 2. Get symbol stats
    const symbolStats = await q<any>(`
      SELECT 
        COUNT(*) FILTER (WHERE enabled = TRUE) as active_symbols,
        COUNT(*) FILTER (WHERE enabled = FALSE) as disabled_symbols,
        COUNT(*) FILTER (WHERE asset_type = 'equity') as equities,
        COUNT(*) FILTER (WHERE asset_type = 'crypto') as crypto,
        COUNT(*) FILTER (WHERE asset_type = 'forex') as forex,
        COUNT(*) FILTER (WHERE tier = 1) as tier1,
        COUNT(*) FILTER (WHERE tier = 2) as tier2,
        COUNT(*) FILTER (WHERE tier = 3) as tier3,
        MIN(last_fetched_at) as oldest_fetch,
        MAX(last_fetched_at) as newest_fetch
      FROM symbol_universe
    `);

    // 3. Get quote freshness
    const quoteFreshness = await q<any>(`
      SELECT 
        COUNT(*) as total_quotes,
        COUNT(*) FILTER (WHERE fetched_at > NOW() - INTERVAL '1 minute') as fresh_1min,
        COUNT(*) FILTER (WHERE fetched_at > NOW() - INTERVAL '5 minutes') as fresh_5min,
        COUNT(*) FILTER (WHERE fetched_at > NOW() - INTERVAL '15 minutes') as fresh_15min,
        MIN(fetched_at) as oldest_quote,
        MAX(fetched_at) as newest_quote
      FROM quotes_latest
    `);

    // 4. Get indicator freshness
    const indicatorFreshness = await q<any>(`
      SELECT 
        COUNT(*) as total_indicators,
        COUNT(*) FILTER (WHERE computed_at > NOW() - INTERVAL '1 minute') as fresh_1min,
        COUNT(*) FILTER (WHERE computed_at > NOW() - INTERVAL '5 minutes') as fresh_5min,
        COUNT(*) FILTER (WHERE in_squeeze = TRUE) as in_squeeze
      FROM indicators_latest
    `);

    // 5. Check Redis connectivity
    let redisStatus = 'not_configured';
    try {
      const r = getRedis();
      if (r) {
        await r.ping();
        redisStatus = 'connected';
      }
    } catch (err) {
      redisStatus = 'error';
    }

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      redis: redisStatus,
      recentRuns: recentRuns,
      symbols: symbolStats[0] || {},
      quotes: quoteFreshness[0] || {},
      indicators: indicatorFreshness[0] || {},
    });

  } catch (err: any) {
    console.error('[api/cached/status] error:', err?.message || err);
    return NextResponse.json({ 
      status: 'error',
      error: err?.message || 'Unknown error',
    }, { status: 500 });
  }
}
