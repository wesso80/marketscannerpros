import { NextRequest, NextResponse } from 'next/server';
import { buildCoinGeckoResponseMeta, getMarketData, symbolToId } from '@/lib/coingecko';
import { getOiEvidence } from '@/lib/crypto/oiHistory';

export async function GET(_req: NextRequest) {
  try {
    const evidence = await getOiEvidence();
    const ids = evidence.coins.map(c => symbolToId(c.symbol)).filter((id): id is string => !!id);
    const markets = await getMarketData({ ids, per_page: 25 });
    const prices = new Map((markets ?? []).map(c => [c.symbol.toUpperCase(), c.current_price]));
    const coins = evidence.coins.map(c => ({
      symbol: c.symbol, openInterest: c.value, price: prices.get(c.symbol) ?? null,
      change24h: c.change24h, observedAt: new Date(c.observedAt).toISOString(),
      comparisonAt: c.comparisonAt == null ? null : new Date(c.comparisonAt).toISOString(),
    })).sort((a, b) => b.openInterest - a.openInterest);
    const btc = coins.find(c => c.symbol === 'BTC') ?? null;
    const eth = coins.find(c => c.symbol === 'ETH') ?? null;
    const total = evidence.totalOpenInterest;
    const dominance = (value: number) => total > 0 ? Number((value / total * 100).toFixed(1)) : null;
    const meta = buildCoinGeckoResponseMeta({ endpointFamily: 'DERIVATIVES', lastUpdated: evidence.observedAt, maxAgeMs: 900_000 });
    return NextResponse.json({
      total: {
        openInterest: total, formatted: formatUSD(total), change24h: evidence.change24h,
        btcDominance: dominance(btc?.openInterest ?? 0), ethDominance: dominance(eth?.openInterest ?? 0),
        altDominance: dominance(total - (btc?.openInterest ?? 0) - (eth?.openInterest ?? 0)),
      },
      btc: btc ? { ...btc, formatted: formatUSD(btc.openInterest) } : null,
      eth: eth ? { ...eth, formatted: formatUSD(eth.openInterest) } : null,
      coins, comparisonReason: evidence.comparisonReason, coverage: evidence.coverage,
      method: evidence.method, timestamp: meta.lastUpdated, source: meta.provider,
      freshnessStatus: meta.freshnessStatus, meta,
    });
  } catch {
    return NextResponse.json({ error: 'Fresh open-interest observations unavailable' }, { status: 503 });
  }
}

function formatUSD(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toFixed(0)}`;
}
