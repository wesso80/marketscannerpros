import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { applyTenantOverlay, getLatestCrcsRows, getTenantProfile, type AssetClass } from '@/lib/upe';

function parseAssetClass(value: string | null): AssetClass {
  return value === 'crypto' ? 'crypto' : 'equity';
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const assetClass = parseAssetClass(searchParams.get('asset_class'));
    const requestedUserId = searchParams.get('user_id');
    const limit = Number(searchParams.get('limit') || 100);

    if (requestedUserId && requestedUserId !== session.workspaceId) {
      return NextResponse.json({ error: 'Forbidden user scope' }, { status: 403 });
    }

    const userId = session.workspaceId;

    const [rows, profile] = await Promise.all([
      getLatestCrcsRows(assetClass, limit),
      getTenantProfile(userId),
    ]);

    const data = rows.map((row) => {
      const overlay = applyTenantOverlay(row, profile);
      return {
        ...row,
        ...overlay,
      };
    });

    return NextResponse.json({
      assetClass,
      profile: {
        userId,
        preset: profile.preset,
        volTolerance: profile.volTolerance,
        sizingModifier: profile.sizingModifier,
      },
      count: data.length,
      rows: data,
    });
  } catch (error) {
    console.error('[upe/crcs/latest] failed', error);
    return NextResponse.json({ error: 'Failed to load CRCS snapshots' }, { status: 500 });
  }
}
