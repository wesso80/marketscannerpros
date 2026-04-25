import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getTokenInfo } from '@/lib/coingecko';

/**
 * GET /api/crypto/token-info?network=eth&address=0x...
 *
 * Returns GT Score, honeypot status, mint/freeze authority, holder data.
 * Uses CoinGecko /onchain/networks/{network}/tokens/{address}/info endpoint.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const network = searchParams.get('network');
  const address = searchParams.get('address');

  if (!network || !address) {
    return NextResponse.json(
      { error: 'network and address params are required' },
      { status: 400 }
    );
  }

  const tokenInfo = await getTokenInfo(network, address);
  if (!tokenInfo) {
    return NextResponse.json({ error: 'Failed to fetch token info' }, { status: 502 });
  }

  const attrs = tokenInfo.attributes;

  return NextResponse.json({
    address: attrs.address,
    name: attrs.name,
    symbol: attrs.symbol,
    image: attrs.image_url,
    coingeckoId: attrs.coingecko_coin_id,
    gtScore: attrs.gt_score,
    gtScoreDetails: attrs.gt_score_details,
    gtVerified: attrs.gt_verified,
    isHoneypot: attrs.is_honeypot,
    mintAuthority: attrs.mint_authority,
    freezeAuthority: attrs.freeze_authority,
    holders: attrs.holders,
    categories: attrs.categories,
    socials: {
      website: attrs.websites?.[0] ?? null,
      twitter: attrs.twitter_handle,
      telegram: attrs.telegram_handle,
      discord: attrs.discord_url,
    },
  });
}
