import { NextRequest, NextResponse } from 'next/server';
import { buildCoinGeckoResponseMeta } from '@/lib/coingecko';
import { getSessionFromCookie } from '@/lib/auth';
import { getOiEvidence } from '@/lib/crypto/oiHistory';

export async function GET(_req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const evidence = await getOiEvidence();
    const change = evidence.change24h;
    const marketSignal = change == null ? 'unavailable' : change > 2 ? 'expanding' : change < -2 ? 'contracting' : 'stable';
    const meta = buildCoinGeckoResponseMeta({ endpointFamily: 'DERIVATIVES', lastUpdated: evidence.observedAt, maxAgeMs: 900_000 });
    return NextResponse.json({
      summary: {
        totalOpenInterest: evidence.totalOpenInterest,
        totalOpenInterestFormatted: formatUSD(evidence.totalOpenInterest),
        change24h: change, avgChange24h: change, marketSignal,
        comparisonReason: evidence.comparisonReason, coverage: evidence.coverage,
      },
      coins: evidence.coins.map(coin => ({
        symbol: coin.symbol, openInterest: coin.value, openInterestValue: coin.value,
        openInterestFormatted: formatUSD(coin.value), change24h: coin.change24h,
        signal: coin.change24h == null ? 'unavailable' : coin.change24h > 3 ? 'expanding' : coin.change24h < -3 ? 'contracting' : 'stable',
        exchanges: coin.exchanges, observedAt: new Date(coin.observedAt).toISOString(),
        comparisonAt: coin.comparisonAt == null ? null : new Date(coin.comparisonAt).toISOString(),
      })).sort((a, b) => b.openInterestValue - a.openInterestValue),
      source: meta.provider, timestamp: meta.lastUpdated, freshnessStatus: meta.freshnessStatus,
      method: evidence.method, meta,
    });
  } catch {
    return NextResponse.json({ error: 'Fresh open-interest observations unavailable' }, { status: 503 });
  }
}

function formatUSD(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
