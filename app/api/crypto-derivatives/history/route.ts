import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

/**
 * GET /api/crypto-derivatives/history?symbol=BTC&days=30
 *
 * Returns historical derivatives snapshots for a given coin.
 * Data comes from the derivatives_snapshots table populated by the
 * smart-check cron job every run.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const symbol = (req.nextUrl.searchParams.get('symbol') || 'BTC').toUpperCase();
  const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') || '30', 10) || 30, 90);

  const rows = await q<{
    captured_at: string;
    funding_rate_pct: number;
    annualised_pct: number;
    sentiment: string;
    total_oi: number;
    total_volume_24h: number;
    exchange_count: number;
    price: number;
    change_24h: number;
  }>(
    `SELECT captured_at, funding_rate_pct, annualised_pct, sentiment,
            total_oi, total_volume_24h, exchange_count, price, change_24h
     FROM derivatives_snapshots
     WHERE symbol = $1 AND captured_at > NOW() - make_interval(days => $2)
     ORDER BY captured_at ASC`,
    [symbol, days]
  );

  return NextResponse.json({
    symbol,
    days,
    snapshots: rows.map(r => ({
      time: r.captured_at,
      fundingPct: Number(r.funding_rate_pct),
      annualisedPct: Number(r.annualised_pct),
      sentiment: r.sentiment,
      oi: Number(r.total_oi),
      volume: Number(r.total_volume_24h),
      exchanges: r.exchange_count,
      price: Number(r.price),
      change24h: Number(r.change_24h),
    })),
    count: rows.length,
  });
}
