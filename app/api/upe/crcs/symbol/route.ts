import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { applyTenantOverlay, getLatestCrcsBySymbol, getTenantProfile, type AssetClass } from '@/lib/upe';

function parseAssetClass(value: string | null): AssetClass | undefined {
  if (value === 'equity' || value === 'crypto') return value;
  return undefined;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get('symbol') || '').trim().toUpperCase();
    const assetClass = parseAssetClass(searchParams.get('asset_class'));
    const requestedUserId = searchParams.get('user_id');

    if (!symbol) {
      return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
    }

    if (requestedUserId && requestedUserId !== session.workspaceId) {
      return NextResponse.json({ error: 'Forbidden user scope' }, { status: 403 });
    }

    const userId = session.workspaceId;
    const [row, profile] = await Promise.all([
      getLatestCrcsBySymbol(symbol, assetClass),
      getTenantProfile(userId),
    ]);

    if (!row) {
      return NextResponse.json({ error: 'No CRCS snapshot found for symbol' }, { status: 404 });
    }

    const overlay = applyTenantOverlay(row, profile);

    return NextResponse.json({
      symbol,
      row: {
        ...row,
        ...overlay,
      },
      profile: {
        userId,
        preset: profile.preset,
        volTolerance: profile.volTolerance,
        sizingModifier: profile.sizingModifier,
      },
    });
  } catch (error) {
    console.error('[upe/crcs/symbol] failed', error);
    return NextResponse.json({ error: 'Failed to load symbol CRCS snapshot' }, { status: 500 });
  }
}
