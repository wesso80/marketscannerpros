/**
 * Cached Scanner Results API
 * Returns pre-computed scanner results from cache/DB
 * Results are computed by the background worker, all users see the same data
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCached, CACHE_KEYS, CACHE_TTL, setCached } from '@/lib/redis';
import { q } from '@/lib/db';
import { scannerComplianceMetadata, scannerDataQualityMetadata } from '@/lib/scanner/compliance';
import { buildMarketDataProviderStatus } from '@/lib/scanner/providerStatus';

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
      compliance: scannerComplianceMetadata(),
      dataQuality: scannerDataQualityMetadata({
        source: 'redis_cache',
        computedAt: cached.computedAt ?? cached.computed_at ?? null,
        stale: false,
        coverageScore: typeof cached.matchesFound === 'number' && typeof cached.totalSymbols === 'number' && cached.totalSymbols > 0
          ? Math.round((cached.matchesFound / cached.totalSymbols) * 100)
          : null,
        providerStatus: buildMarketDataProviderStatus({ source: 'redis_cache', provider: 'redis_cache' }),
      }),
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
        compliance: scannerComplianceMetadata(),
        dataQuality: scannerDataQualityMetadata({
          source: 'none',
          stale: true,
          coverageScore: 0,
          warnings: ['No cached scanner data is currently available.'],
          providerStatus: buildMarketDataProviderStatus({
            source: 'none',
            provider: 'scanner_worker_cache',
            stale: true,
            degraded: true,
            warnings: ['No cached scanner data is currently available.'],
          }),
        }),
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
      compliance: scannerComplianceMetadata(),
      dataQuality: scannerDataQualityMetadata({
        source: 'database',
        computedAt: data.computed_at,
        stale: false,
        coverageScore: data.total_symbols > 0 ? Math.round((data.matches_found / data.total_symbols) * 100) : 0,
        providerStatus: buildMarketDataProviderStatus({ source: 'database', provider: 'scanner_results_cache' }),
      }),
      source: 'database',
    };

    // Cache the result
    await setCached(cacheKey, response, CACHE_TTL.scannerResult);

    return NextResponse.json(response);

  } catch (err: any) {
    console.error('[api/cached/scanner] DB error:', err?.message || err);
    return NextResponse.json({
      error: 'Database error',
      compliance: scannerComplianceMetadata(),
      dataQuality: scannerDataQualityMetadata({
        source: 'error',
        stale: true,
        coverageScore: 0,
        warnings: ['Unable to load cached scanner data.'],
        providerStatus: buildMarketDataProviderStatus({
          source: 'error',
          provider: 'scanner_results_cache',
          stale: true,
          degraded: true,
          warnings: ['Unable to load cached scanner data.'],
        }),
      }),
    }, { status: 500 });
  }
}
