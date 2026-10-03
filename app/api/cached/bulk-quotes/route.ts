/**
 * Cached Bulk Quotes API
 * Returns quotes for multiple symbols from cache/DB
 * NO external API calls
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCachedMulti, CACHE_KEYS, CACHE_TTL, setCachedMulti } from '@/lib/redis';
import { q } from '@/lib/db';
import { serializePublicQuote } from '@/lib/market-data/publicQuote';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get('symbols') || '';
  
  if (!symbolsParam) {
    return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
  }

  const symbols = symbolsParam
    .split(',')
    .map(s => s.toUpperCase().trim())
    .filter(s => s.length > 0)
    .slice(0, 100); // Max 100 symbols

  if (symbols.length === 0) {
    return NextResponse.json({ error: 'No valid symbols provided' }, { status: 400 });
  }

  // 1. Try Redis cache first for all symbols
  const cacheKeys = symbols.map(s => CACHE_KEYS.quote(s));
  const cachedValues = await getCachedMulti<any>(cacheKeys);

  const results: Record<string, any> = {};
  const missingSymbols: string[] = [];

  for (let i = 0; i < symbols.length; i++) {
    if (cachedValues[i]) {
      results[symbols[i]] = { ...serializePublicQuote(cachedValues[i]), source: 'cache' };
    } else {
      missingSymbols.push(symbols[i]);
    }
  }

  // 2. Fetch missing from database
  if (missingSymbols.length > 0) {
    try {
      const placeholders = missingSymbols.map((_, i) => `$${i + 1}`).join(',');
      const rows = await q<any>(`
        SELECT q.*, u.asset_type AS asset_class
        FROM quotes_latest q LEFT JOIN symbol_universe u ON u.symbol = q.symbol
        WHERE q.symbol IN (${placeholders})
      `, missingSymbols);

      const toCache: { key: string; value: any; ttl: number }[] = [];

      for (const row of rows) {
        const quote = serializePublicQuote(row);

        results[row.symbol] = { ...quote, source: 'database' };
        toCache.push({
          key: CACHE_KEYS.quote(row.symbol),
          value: quote,
          ttl: CACHE_TTL.quote,
        });
      }

      // Cache the DB results for next time
      if (toCache.length > 0) {
        await setCachedMulti(toCache);
      }

    } catch (err: any) {
      console.error('[api/cached/bulk-quotes] DB error:', err?.message || err);
      // Continue with cached results even if DB fails
    }
  }

  return NextResponse.json({
    quotes: results,
    requested: symbols.length,
    found: Object.keys(results).length,
    missing: symbols.filter(s => !results[s]),
    status: Object.fromEntries(symbols.map(s => [s, !results[s] ? "unavailable" : results[s].stale ? "stale" : "fresh"])),
  });
}
