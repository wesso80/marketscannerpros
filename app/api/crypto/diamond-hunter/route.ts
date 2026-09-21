import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import {
  buildCoinGeckoResponseMeta,
  getNewPools,
  getTokenInfo,
  getTrendingCoins,
  getTrendingPools,
  type CoinGeckoIncludedResource,
  type TokenInfo,
  type TrendingPool,
} from '@/lib/coingecko';
import { scoreDiamondPool } from '@/lib/diamondHunter';

export const dynamic = 'force-dynamic';

const SCAN_CACHE_TTL_MS = 120_000;
const TOKEN_CACHE_TTL_MS = 15 * 60_000;
const PAGE_COUNT = 3;
const DEEP_CHECK_LIMIT = 4;
const DEEP_CHECK_MIN_SCORE = 68;

const TOKEN_INFO_NETWORKS = new Set([
  'solana', 'eth', 'base', 'bsc', 'optimism', 'arbitrum',
  'polygon_pos', 'ton', 'sui-network', 'robinhood', 'ronin', 'bittensor',
]);

type IncludedToken = CoinGeckoIncludedResource & { attributes: CoinGeckoIncludedResource['attributes'] };

let scanCache: { expiresAt: number; payload: unknown } | null = null;
const tokenInfoCache = new Map<string, { expiresAt: number; value: TokenInfo | null }>();
const previousScores = new Map<string, { score: number; at: number }>();
const firstDetected = new Map<string, string>();

function tokenAddressFromPool(pool: TrendingPool, included: Map<string, IncludedToken>): string | null {
  const tokenId = pool.relationships?.base_token?.data?.id;
  if (!tokenId) return null;
  const hit = included.get(tokenId);
  if (typeof hit?.attributes?.address === 'string' && hit.attributes.address) {
    return hit.attributes.address;
  }
  const network = pool.relationships?.network?.data?.id || '';
  const prefix = network ? `${network}_` : '';
  return prefix && tokenId.startsWith(prefix) ? tokenId.slice(prefix.length) : null;
}

async function getTokenInfoCached(network: string, address: string): Promise<TokenInfo | null> {
  const key = `${network}:${address}`;
  const now = Date.now();
  const cached = tokenInfoCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const value = await getTokenInfo(network, address);
  tokenInfoCache.set(key, { value, expiresAt: now + TOKEN_CACHE_TTL_MS });
  return value;
}

function pruneState(now: number) {
  for (const [key, value] of tokenInfoCache) {
    if (value.expiresAt <= now) tokenInfoCache.delete(key);
  }
  for (const [key, value] of previousScores) {
    if (now - value.at > 6 * 60 * 60_000) previousScores.delete(key);
  }
  if (firstDetected.size > 2_000) firstDetected.clear();
}

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  if (scanCache && scanCache.expiresAt > now) {
    return NextResponse.json(scanCache.payload, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    });
  }

  pruneState(now);

  try {
    const [pages, trendingPools, trending] = await Promise.all([
      Promise.all(
        Array.from({ length: PAGE_COUNT }, (_, index) =>
          getNewPools({
            page: index + 1,
            includeCommunityData: true,
            include: ['base_token', 'dex', 'network'],
          })
        )
      ),
      getTrendingPools(),
      getTrendingCoins(),
    ]);

    const poolMap = new Map<string, TrendingPool>();
    const included = new Map<string, IncludedToken>();
    for (const page of pages) {
      for (const pool of page?.data ?? []) poolMap.set(pool.id, pool);
      for (const resource of page?.included ?? []) included.set(resource.id, resource as IncludedToken);
    }

    const trendingPoolIds = new Set((trendingPools?.data ?? []).map((p) => p.id));
    const trendingCoinIds = new Set((trending?.coins ?? []).map((c) => c.item.id));

    const preliminary = Array.from(poolMap.values()).map((pool) => {
      const baseId = pool.relationships?.base_token?.data?.id;
      const base = baseId ? included.get(baseId) : undefined;
      const coinId = typeof base?.attributes?.coingecko_coin_id === 'string'
        ? base.attributes.coingecko_coin_id
        : null;
      const score = scoreDiamondPool(pool, {
        isTrendingPool: trendingPoolIds.has(pool.id),
        isTrendingCoin: coinId ? trendingCoinIds.has(coinId) : false,
        now,
      });
      return { pool, base, coinId, score };
    });

    preliminary.sort((a, b) => b.score.score - a.score.score);

    const deepTargets = preliminary
      .filter((entry) => {
        const network = entry.pool.relationships?.network?.data?.id || '';
        return entry.score.score >= DEEP_CHECK_MIN_SCORE &&
          entry.score.metrics.liquidityUsd >= 25_000 &&
          TOKEN_INFO_NETWORKS.has(network);
      })
      .slice(0, DEEP_CHECK_LIMIT);

    const deepMap = new Map<string, TokenInfo | null>();
    await Promise.all(deepTargets.map(async (entry) => {
      const network = entry.pool.relationships?.network?.data?.id || '';
      const address = tokenAddressFromPool(entry.pool, included);
      if (!network || !address) return;
      const info = await getTokenInfoCached(network, address);
      deepMap.set(entry.pool.id, info);
    }));

    const candidates = preliminary.map((entry) => {
      const pool = entry.pool;
      const a = pool.attributes;
      const network = pool.relationships?.network?.data?.id || 'unknown';
      const dex = pool.relationships?.dex?.data?.id || 'unknown';
      const tokenAddress = tokenAddressFromPool(pool, included);
      const tokenInfo = deepMap.get(pool.id) ?? null;
      const result = tokenInfo
        ? scoreDiamondPool(pool, {
            tokenInfo,
            isTrendingPool: trendingPoolIds.has(pool.id),
            isTrendingCoin: entry.coinId ? trendingCoinIds.has(entry.coinId) : false,
            now,
          })
        : entry.score;

      const prior = previousScores.get(pool.id);
      const elapsed5m = prior ? Math.max((now - prior.at) / 300_000, 0.2) : null;
      const scoreDelta = prior && elapsed5m != null
        ? Math.round(((result.score - prior.score) / elapsed5m) * 10) / 10
        : 0;
      previousScores.set(pool.id, { score: result.score, at: now });

      if (result.score >= 60 && !firstDetected.has(pool.id)) {
        firstDetected.set(pool.id, new Date(now).toISOString());
      }

      const baseName = typeof entry.base?.attributes?.name === 'string' ? entry.base.attributes.name : null;
      const symbol = typeof entry.base?.attributes?.symbol === 'string' ? entry.base.attributes.symbol : null;

      return {
        id: pool.id,
        poolAddress: a.address,
        tokenAddress,
        name: baseName || a.name?.split(' / ')[0] || a.name || 'Unknown',
        symbol: symbol || a.name?.split(' / ')[0] || '—',
        pairName: a.name,
        network,
        dex,
        priceUsd: Number.parseFloat(a.base_token_price_usd || '0') || 0,
        score: result.score,
        prePenaltyScore: result.prePenaltyScore,
        penalty: result.penalty,
        stage: result.stage,
        confidence: result.confidence,
        attention: result.attention,
        scoreDelta,
        firstDetectedAt: firstDetected.get(pool.id) ?? null,
        createdAt: a.pool_created_at ?? null,
        reasons: result.reasons,
        riskFlags: result.riskFlags,
        hardReject: result.hardReject,
        components: result.components,
        metrics: result.metrics,
        security: tokenInfo ? {
          gtScore: tokenInfo.attributes.gt_score,
          gtVerified: tokenInfo.attributes.gt_verified,
          isHoneypot: tokenInfo.attributes.is_honeypot,
          mintAuthority: tokenInfo.attributes.mint_authority,
          freezeAuthority: tokenInfo.attributes.freeze_authority,
          categories: tokenInfo.attributes.categories,
        } : null,
      };
    }).sort((a, b) => b.score - a.score);

    const visible = candidates.filter((c) => c.score >= 45 || c.stage !== 'REJECT').slice(0, 30);
    const meta = buildCoinGeckoResponseMeta({
      endpointFamily: 'ONCHAIN',
      lastUpdated: new Date(now).toISOString(),
      maxAgeMs: SCAN_CACHE_TTL_MS,
    });

    const payload = {
      candidates: visible,
      stats: {
        poolsScanned: poolMap.size,
        candidatesShown: visible.length,
        watchOrBetter: visible.filter((c) => c.stage !== 'REJECT').length,
        diamondOrBetter: visible.filter((c) => c.stage === 'DIAMOND' || c.stage === 'RARE_DIAMOND').length,
        deepChecked: Array.from(deepMap.values()).filter(Boolean).length,
        pagesScanned: PAGE_COUNT,
        refreshSeconds: SCAN_CACHE_TTL_MS / 1000,
      },
      methodology: {
        version: 'diamond-v1.0',
        scoreBands: {
          watch: 60,
          emerging: 70,
          diamond: 80,
          rareDiamond: 90,
        },
        note: 'Research ranking only. A high score is not a buy signal and does not remove contract, liquidity, manipulation or execution risk.',
      },
      source: meta.provider,
      freshnessStatus: meta.freshnessStatus,
      timestamp: meta.lastUpdated,
      meta,
    };

    scanCache = { payload, expiresAt: now + SCAN_CACHE_TTL_MS };

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    });
  } catch (error) {
    console.error('[DiamondHunter] scan failed:', error);
    return NextResponse.json({ error: 'Diamond Hunter scan failed' }, { status: 502 });
  }
}
