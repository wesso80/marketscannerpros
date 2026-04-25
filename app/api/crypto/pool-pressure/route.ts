import { NextRequest, NextResponse } from 'next/server';
import { getPoolWithVolumeBreakdown } from '@/lib/coingecko';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const network = searchParams.get('network');
  const address = searchParams.get('address');

  if (!network || !address) {
    return NextResponse.json({ error: 'network and address are required' }, { status: 400 });
  }

  try {
    const pool = await getPoolWithVolumeBreakdown(network, address);
    const attrs = pool?.attributes;
    if (!attrs) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }

    const vb = attrs.volume_breakdown || {};
    const timeframes = ['m5', 'm15', 'm30', 'h1', 'h6', 'h24'] as const;
    const [baseTokenSymbolRaw, quoteTokenSymbolRaw] = (attrs.name || '').split('/');

    const breakdown = timeframes.map(tf => ({
      timeframe: tf,
      buyVolumeUsd: parseFloat(vb[tf]?.buys ?? '0'),
      sellVolumeUsd: parseFloat(vb[tf]?.sells ?? '0'),
      netVolumeUsd: parseFloat(vb[tf]?.buys ?? '0') - parseFloat(vb[tf]?.sells ?? '0'),
    }));

    return NextResponse.json({
      poolName: attrs.name,
      baseTokenSymbol: (baseTokenSymbolRaw || '').trim(),
      quoteTokenSymbol: (quoteTokenSymbolRaw || '').trim(),
      address,
      network,
      breakdown,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch pool pressure data' }, { status: 500 });
  }
}
