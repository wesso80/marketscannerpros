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
import { recordDiamondScan, type DiamondHistoryCandidate, type DiamondHistoryState } from '@/lib/diamondHunterHistory';
import { evaluateDiamondConfirmation } from '@/lib/diamondHunterValidation';

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

let scanCache: { expiresAt: number; payload: DiamondHunterPayload } | null = null;
const tokenInfoCache = new Map<string, { expiresAt: number; value: TokenInfo | null }>();

function tokenAddressFromPool(pool: TrendingPool, included: Map<string, IncludedToken>): string | null {
  const tokenId = pool.relationships?.base_token?.data?.id;
  if (!tokenId) return null;
  const hit = included.get(tokenId);
  if (typeof hit?.attributes?.address === 'string' && hit.attributes.address) return hit.attributes.address;
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
}

function fallbackHistory(candidate: DiamondHistoryCandidate, now: number): DiamondHistoryState {
  const qualifies = candidate.score >= 60 && !candidate.hardReject;
  const diamond = candidate.score >= 80 && !candidate.hardReject;
  const confirmation = evaluateDiamondConfirmation({
    score: candidate.score,
    stage: candidate.stage,
    confidence: candidate.confidence,
    attention: candidate.attention,
    hardReject: candidate.hardReject,
    riskFlags: candidate.riskFlags,
    ageMinutes: candidate.metrics.ageMinutes,
    liquidityUsd: candidate.metrics.liquidityUsd,
    isHoneypot: candidate.security?.isHoneypot,
    qualifyingScanCount: qualifies ? 1 : 0,
    diamondScanCount: diamond ? 1 : 0,
    liquidityChangePct: 0,
  });
  const detected = qualifies ? new Date(now).toISOString() : null;
  return {
    firstSeenAt: new Date(now).toISOString(),
    firstDetectedAt: detected,
    firstTrendingAt: null,
    confirmedAt: null,
    scanCount: 1,
    qualifyingScanCount: qualifies ? 1 : 0,
    diamondScanCount: diamond ? 1 : 0,
    deepCheckCount: candidate.confidence === 'DEEP_CHECKED' ? 1 : 0,
    scoreDelta5m: 0,
    liquidityChangePct: 0,
    detectedMinutesAgo: detected ? 0 : null,
    discoveryLeadMinutes: null,
    confirmation,
  };
}

export interface DiamondHunterPayload {
  candidates: Array<DiamondHistoryCandidate & {
    pairName: string;
    prePenaltyScore: number;
    penalty: number;
    createdAt: string | null;
    reasons: string[];
    components: ReturnType<typeof scoreDiamondPool>['components'];
    scoreDelta: number;
    firstDetectedAt: string | null;
    history: DiamondHistoryState;
  }>;
  stats: {
    poolsScanned: number;
    candidatesShown: number;
    watchOrBetter: number;
    diamondOrBetter: number;
    provisionalDiamonds: number;
    confirmedDiamonds: number;
    deepChecked: number;
    pagesScanned: number;
    refreshSeconds: number;
    historyPersisted: boolean;
  };
  methodology: {
    version: string;
    scoreBands: { watch: number; emerging: number; diamond: number; rareDiamond: number };
    note: string;
  };
  source: string;
  freshnessStatus: string;
  timestamp: string | null;
  meta: ReturnType<typeof buildCoinGeckoResponseMeta>;
}

export async function runDiamondHunterScan(options: { forceRefresh?: boolean } = {}): Promise<DiamondHunterPayload> {
  const now = Date.now();
  if (!options.forceRefresh && scanCache && scanCache.expiresAt > now) return scanCache.payload;
  pruneState(now);

  const [pages, trendingPools, trending] = await Promise.all([
    Promise.all(
      Array.from({ length: PAGE_COUNT }, (_, index) =>
        getNewPools({
          page: index + 1,
          includeCommunityData: true,
          include: ['base_token', 'dex', 'network'],
        }),
      ),
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

  const trendingPoolIds = new Set((trendingPools?.data ?? []).map((pool) => pool.id));
  const trendingCoinIds = new Set((trending?.coins ?? []).map((coin) => coin.item.id));

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
      return entry.score.score >= DEEP_CHECK_MIN_SCORE
        && entry.score.metrics.liquidityUsd >= 25_000
        && TOKEN_INFO_NETWORKS.has(network);
    })
    .slice(0, DEEP_CHECK_LIMIT);

  const deepMap = new Map<string, TokenInfo | null>();
  await Promise.all(deepTargets.map(async (entry) => {
    const network = entry.pool.relationships?.network?.data?.id || '';
    const address = tokenAddressFromPool(entry.pool, included);
    if (!network || !address) return;
    deepMap.set(entry.pool.id, await getTokenInfoCached(network, address));
  }));

  const rawCandidates = preliminary.map((entry) => {
    const pool = entry.pool;
    const attributes = pool.attributes;
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

    const baseName = typeof entry.base?.attributes?.name === 'string' ? entry.base.attributes.name : null;
    const symbol = typeof entry.base?.attributes?.symbol === 'string' ? entry.base.attributes.symbol : null;
    const security = tokenInfo ? {
      gtScore: tokenInfo.attributes.gt_score,
      gtVerified: tokenInfo.attributes.gt_verified,
      isHoneypot: tokenInfo.attributes.is_honeypot,
      mintAuthority: tokenInfo.attributes.mint_authority,
      freezeAuthority: tokenInfo.attributes.freeze_authority,
      categories: tokenInfo.attributes.categories,
    } : null;

    return {
      id: pool.id,
      poolAddress: attributes.address,
      tokenAddress,
      name: baseName || attributes.name?.split(' / ')[0] || attributes.name || 'Unknown',
      symbol: symbol || attributes.name?.split(' / ')[0] || '—',
      pairName: attributes.name,
      network,
      dex,
      priceUsd: Number.parseFloat(attributes.base_token_price_usd || '0') || 0,
      score: result.score,
      prePenaltyScore: result.prePenaltyScore,
      penalty: result.penalty,
      stage: result.stage,
      confidence: result.confidence,
      attention: result.attention,
      createdAt: attributes.pool_created_at ?? null,
      reasons: result.reasons,
      riskFlags: result.riskFlags,
      hardReject: result.hardReject,
      components: result.components,
      metrics: result.metrics,
      security,
    };
  }).sort((a, b) => b.score - a.score);

  const visibleBase = rawCandidates.filter((candidate) => candidate.score >= 45 || candidate.stage !== 'REJECT').slice(0, 30);
  const persistable: DiamondHistoryCandidate[] = visibleBase.map((candidate) => ({
    id: candidate.id,
    network: candidate.network,
    poolAddress: candidate.poolAddress,
    tokenAddress: candidate.tokenAddress,
    symbol: candidate.symbol,
    name: candidate.name,
    priceUsd: candidate.priceUsd,
    score: candidate.score,
    stage: candidate.stage,
    confidence: candidate.confidence,
    attention: candidate.attention,
    hardReject: candidate.hardReject,
    riskFlags: candidate.riskFlags,
    metrics: {
      ageMinutes: candidate.metrics.ageMinutes,
      liquidityUsd: candidate.metrics.liquidityUsd,
      fdvUsd: candidate.metrics.fdvUsd,
      volume5mUsd: candidate.metrics.volume5mUsd,
      buyers5m: candidate.metrics.buyers5m,
      sellers5m: candidate.metrics.sellers5m,
    },
    security: candidate.security ? { isHoneypot: candidate.security.isHoneypot } : null,
    featureData: { components: candidate.components, metrics: candidate.metrics },
  }));

  let historyPersisted = false;
  let history = new Map<string, DiamondHistoryState>();
  try {
    history = await recordDiamondScan(persistable, new Date(now));
    historyPersisted = history.size > 0 || persistable.length === 0;
  } catch (error) {
    console.error('[DiamondHunter] history persistence failed; serving scan without confirmation history:', error);
  }

  const visible = visibleBase.map((candidate) => {
    const historyInput = persistable.find((item) => item.id === candidate.id)!;
    const historyState = history.get(candidate.id) ?? fallbackHistory(historyInput, now);
    return {
      ...candidate,
      scoreDelta: historyState.scoreDelta5m,
      firstDetectedAt: historyState.firstDetectedAt,
      history: historyState,
    };
  });

  const meta = buildCoinGeckoResponseMeta({
    endpointFamily: 'ONCHAIN',
    lastUpdated: new Date(now).toISOString(),
    maxAgeMs: SCAN_CACHE_TTL_MS,
  });

  const payload: DiamondHunterPayload = {
    candidates: visible,
    stats: {
      poolsScanned: poolMap.size,
      candidatesShown: visible.length,
      watchOrBetter: visible.filter((candidate) => candidate.stage !== 'REJECT').length,
      diamondOrBetter: visible.filter((candidate) => candidate.stage === 'DIAMOND' || candidate.stage === 'RARE_DIAMOND').length,
      provisionalDiamonds: visible.filter((candidate) => candidate.history.confirmation.validationStage === 'PROVISIONAL_DIAMOND').length,
      confirmedDiamonds: visible.filter((candidate) => candidate.history.confirmation.validationStage === 'CONFIRMED_DIAMOND').length,
      deepChecked: Array.from(deepMap.values()).filter(Boolean).length,
      pagesScanned: PAGE_COUNT,
      refreshSeconds: SCAN_CACHE_TTL_MS / 1000,
      historyPersisted,
    },
    methodology: {
      version: 'diamond-v2.0',
      scoreBands: { watch: 60, emerging: 70, diamond: 80, rareDiamond: 90 },
      note: 'Research ranking only. Diamond scores identify early candidates; confirmation requires repeated scans, known security status and stable liquidity.',
    },
    source: meta.provider,
    freshnessStatus: meta.freshnessStatus,
    timestamp: meta.lastUpdated,
    meta,
  };

  scanCache = { payload, expiresAt: now + SCAN_CACHE_TTL_MS };
  return payload;
}
