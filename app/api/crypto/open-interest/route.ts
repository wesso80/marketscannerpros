import { NextRequest, NextResponse } from 'next/server';
import { buildCoinGeckoResponseMeta } from '@/lib/coingecko';
import { getSessionFromCookie } from '@/lib/auth';
import { getOiEvidence } from '@/lib/crypto/oiHistory';
import {
  FIXED_BASKET_CHANGE_LABEL,
  SHOWN_DERIVATIVE_COINS,
  getOpenInterestTotals,
  headlineOpenInterest,
  type OpenInterestTotal,
} from '@/lib/crypto/openInterestTotal';

export async function GET(_req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let evidence: Awaited<ReturnType<typeof getOiEvidence>> | null = null;
  try {
    evidence = await getOiEvidence();
  } catch {
    evidence = null;
  }
  const symbols = evidence?.coins?.length ? evidence.coins.map((coin) => coin.symbol) : [...SHOWN_DERIVATIVE_COINS];
  const totals = await getOpenInterestTotals(symbols);
  const headline = headlineOpenInterest(totals);
  if (!evidence && headline.totalUsd == null) {
    return NextResponse.json({ error: 'Fresh open-interest observations unavailable' }, { status: 503 });
  }
  const bySymbol = new Map((totals ?? []).map((row) => [row.symbol, row]));
  const change = evidence?.change24h ?? null;
  const marketSignal = change == null ? 'unavailable' : change > 2 ? 'expanding' : change < -2 ? 'contracting' : 'stable';
  const meta = buildCoinGeckoResponseMeta({
    endpointFamily: 'DERIVATIVES',
    lastUpdated: headline.observedAt ?? evidence?.observedAt ?? null,
    maxAgeMs: 900_000,
  });
  const basketCoins = evidence?.coins ?? symbols.map((symbol) => ({
    symbol,
    change24h: null as number | null,
    comparisonAt: null as number | null,
  }));
  return NextResponse.json({
    summary: {
      totalOpenInterest: headline.totalUsd,
      totalOpenInterestFormatted: formatUSD(headline.totalUsd),
      sourceLabel: headline.sourceLabel,
      exchanges: headline.exchanges,
      change24h: change,
      avgChange24h: change,
      change24hLabel: FIXED_BASKET_CHANGE_LABEL,
      marketSignal,
      comparisonReason: evidence?.comparisonReason ?? null,
      coverage: evidence?.coverage ?? null,
      baselineReadyAt: evidence?.baselineReadyAt ?? null,
    },
    coins: basketCoins.map((coin) => {
      const total: OpenInterestTotal | undefined = bySymbol.get(coin.symbol);
      const openInterest = total?.totalUsd ?? null;
      return {
        symbol: coin.symbol,
        openInterest,
        openInterestValue: openInterest,
        openInterestFormatted: formatUSD(openInterest),
        sourceLabel: total?.sourceLabel ?? headline.sourceLabel,
        change24h: coin.change24h,
        change24hLabel: FIXED_BASKET_CHANGE_LABEL,
        signal: coin.change24h == null ? 'unavailable' : coin.change24h > 3 ? 'expanding' : coin.change24h < -3 ? 'contracting' : 'stable',
        exchanges: total?.exchanges ?? 0,
        observedAt: total?.observedAt ?? null,
        comparisonAt: coin.comparisonAt == null ? null : new Date(coin.comparisonAt).toISOString(),
      };
    }).sort((a, b) => sortValue(b.openInterestValue) - sortValue(a.openInterestValue)),
    source: meta.provider,
    timestamp: meta.lastUpdated,
    freshnessStatus: meta.freshnessStatus,
    method: evidence?.method ?? null,
    meta,
  });
}

function sortValue(value: number | null): number {
  return value != null && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function formatUSD(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
