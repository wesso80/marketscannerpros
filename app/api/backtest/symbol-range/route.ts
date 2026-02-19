import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';

type AssetType = 'equity' | 'crypto' | 'forex' | 'commodity';

function buildSymbolCandidates(input: string): string[] {
  const upper = String(input || '').trim().toUpperCase();
  if (!upper) return [];

  const stripped = upper.replace(/USDT$/, '').replace(/USD$/, '');
  const candidates = [upper, stripped, `${stripped}USD`, `${stripped}USDT`]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set(candidates));
}

function normalizeAssetType(value: unknown): AssetType {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'crypto') return 'crypto';
  if (normalized === 'forex') return 'forex';
  if (normalized === 'commodity' || normalized === 'commodities') return 'commodity';
  return 'equity';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = String(searchParams.get('symbol') || '').trim().toUpperCase();

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }

    const candidates = buildSymbolCandidates(symbol);
    if (candidates.length === 0) {
      return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }

    const universeRows = await q<{ symbol: string; asset_type: string }>(
      `SELECT symbol, asset_type
         FROM symbol_universe
        WHERE symbol = ANY($1::text[])
        ORDER BY CASE WHEN symbol = $2 THEN 0 ELSE 1 END
        LIMIT 1`,
      [candidates, symbol]
    );

    const coverageRows = await q<{
      symbol: string;
      min_date: string | null;
      max_date: string | null;
      bars: string | number;
    }>(
      `SELECT symbol,
              MIN(ts)::date::text AS min_date,
              MAX(ts)::date::text AS max_date,
              COUNT(*)::bigint AS bars
         FROM ohlcv_bars
        WHERE symbol = ANY($1::text[])
        GROUP BY symbol
        ORDER BY bars DESC, CASE WHEN symbol = $2 THEN 0 ELSE 1 END
        LIMIT 1`,
      [candidates, symbol]
    );

    const coverage = coverageRows[0] || null;
    const universe = universeRows[0] || null;

    return NextResponse.json({
      success: true,
      symbol,
      candidates,
      resolvedSymbol: coverage?.symbol || universe?.symbol || symbol,
      assetType: normalizeAssetType(universe?.asset_type),
      coverage: coverage
        ? {
            startDate: coverage.min_date,
            endDate: coverage.max_date,
            bars: Number(coverage.bars || 0),
          }
        : null,
    });
  } catch (error) {
    console.error('[api/backtest/symbol-range] error:', error);
    return NextResponse.json({ error: 'Failed to resolve symbol range' }, { status: 500 });
  }
}
