/**
 * Cached Scanner Results API
 * Returns pre-computed scanner results from cache/DB
 * Results are computed by the background worker, all users see the same data
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCached, CACHE_KEYS, CACHE_TTL, setCached } from '@/lib/redis';
import { q } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scanner = searchParams.get('scanner') || 'squeeze';
  const universe = searchParams.get('universe') || 'default';
  const timeframe = searchParams.get('timeframe') || 'daily';

  // 1. Try Redis cache first
  const cacheKey = CACHE_KEYS.scannerResult(scanner, universe);
  const cached = await getCached<any>(cacheKey);
  
  if (cached) {
    return NextResponse.json({
      scanner,
      universe,
      timeframe,
      ...cached,
      source: 'cache',
    });
  }

  // 2. Fallback to database
  try {
    const rows = await q<any>(`
      SELECT scanner_name, universe, timeframe, results, 
             total_symbols, matches_found, computed_at
      FROM scanner_results_cache 
      WHERE scanner_name = $1 AND universe = $2 AND timeframe = $3
    `, [scanner, universe, timeframe]);

    if (rows.length === 0) {
      // No cached results - return empty but with fresh scan option
      return NextResponse.json({ 
        scanner,
        universe,
        timeframe,
        results: [],
        totalSymbols: 0,
        matchesFound: 0,
        computedAt: null,
        hint: 'No cached results. Worker will compute on next cycle.',
        source: 'none',
      });
    }

    const data = rows[0];
    const response = {
      scanner: data.scanner_name,
      universe: data.universe,
      timeframe: data.timeframe,
      results: data.results || [],
      totalSymbols: data.total_symbols,
      matchesFound: data.matches_found,
      computedAt: data.computed_at,
      source: 'database',
    };

    // Cache the result
    await setCached(cacheKey, response, CACHE_TTL.scannerResult);

    return NextResponse.json(response);

  } catch (err: any) {
    console.error('[api/cached/scanner] DB error:', err?.message || err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
