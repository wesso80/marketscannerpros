import type { TokenInfo, TrendingPool } from '@/lib/coingecko';

export type DiamondStage = 'REJECT' | 'WATCH' | 'EMERGING' | 'DIAMOND' | 'RARE_DIAMOND';
export type DiamondConfidence = 'PRELIMINARY' | 'DEEP_CHECKED';
export type DiamondAttention = 'EARLY' | 'POOL_TRENDING' | 'COINGECKO_TRENDING' | 'QUIET';

export interface DiamondScoreContext {
  tokenInfo?: TokenInfo | null;
  isTrendingPool?: boolean;
  isTrendingCoin?: boolean;
  now?: number;
}

export interface DiamondScoreComponent {
  score: number | null;
  max: number;
  label: string;
}

export interface DiamondScoreResult {
  score: number;
  prePenaltyScore: number;
  penalty: number;
  stage: DiamondStage;
  confidence: DiamondConfidence;
  attention: DiamondAttention;
  hardReject: boolean;
  riskFlags: string[];
  reasons: string[];
  components: {
    volumeAcceleration: DiamondScoreComponent;
    buyerAcceleration: DiamondScoreComponent;
    liquidityQuality: DiamondScoreComponent;
    priceStructure: DiamondScoreComponent;
    valuationOpportunity: DiamondScoreComponent;
    holderQuality: DiamondScoreComponent;
    attentionLead: DiamondScoreComponent;
    narrativeQuality: DiamondScoreComponent;
    earlyAge: DiamondScoreComponent;
  };
  metrics: {
    ageMinutes: number | null;
    liquidityUsd: number;
    fdvUsd: number;
    marketCapUsd: number;
    volume5mUsd: number;
    volume15mUsd: number;
    volume1hUsd: number;
    volumeVelocity5m: number;
    buyerVelocity5m: number;
    buyers5m: number;
    sellers5m: number;
    buySellRatio5m: number;
    change5m: number;
    change15m: number;
    change1h: number;
    top10HolderPct: number | null;
    holderCount: number | null;
    gtScore: number | null;
    developerHoldingPct: number | null;
  };
}

function n(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function getAgeMinutes(createdAt: string | undefined, now: number): number | null {
  if (!createdAt) return null;
  const ts = Date.parse(createdAt);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, (now - ts) / 60_000);
}

function activityPointScore(change: number, low: number, high: number, max: number): number {
  if (change <= low) return change < -Math.abs(low) ? 0 : max * 0.2;
  if (change >= high) return max;
  return max * ((change - low) / Math.max(0.0001, high - low));
}

function holderScore(tokenInfo: TokenInfo | null | undefined): number | null {
  const holders = tokenInfo?.attributes?.holders;
  if (!holders) return null;
  const top10 = n(holders.distribution_percentage?.top_10);
  const count = holders.count ?? 0;

  let concentration = 0;
  if (top10 <= 20) concentration = 7;
  else if (top10 <= 30) concentration = 6;
  else if (top10 <= 40) concentration = 5;
  else if (top10 <= 50) concentration = 3.5;
  else if (top10 <= 65) concentration = 2;
  else concentration = 0.5;

  let breadth = 0;
  if (count >= 10_000) breadth = 3;
  else if (count >= 2_500) breadth = 2.5;
  else if (count >= 500) breadth = 2;
  else if (count >= 100) breadth = 1;
  else breadth = 0.25;

  return clamp(concentration + breadth, 0, 10);
}

function narrativeScore(tokenInfo: TokenInfo | null | undefined): number | null {
  if (!tokenInfo) return null;
  const a = tokenInfo.attributes;
  let score = 0;
  if ((a.categories?.length ?? 0) > 0) score += 1.5;
  if (a.twitter_handle || a.telegram_handle || a.discord_url) score += 1;
  if ((a.websites?.length ?? 0) > 0) score += 1;
  if (a.gt_verified) score += 0.5;
  return clamp(score, 0, 4);
}

export function scoreDiamondPool(pool: TrendingPool, context: DiamondScoreContext = {}): DiamondScoreResult {
  const a = pool.attributes;
  const now = context.now ?? Date.now();
  const ageMinutes = getAgeMinutes(a.pool_created_at, now);

  const volume5m = n(a.volume_usd?.m5);
  const volume15m = n(a.volume_usd?.m15);
  const volume1h = n(a.volume_usd?.h1);
  const expected5mVolume = Math.max(volume1h / 12, 1);
  const expected15mVolume = Math.max(volume1h / 4, 1);
  const velocity5 = volume5m / expected5mVolume;
  const velocity15 = volume15m / expected15mVolume;
  const volumeScore = clamp((Math.min(velocity5, 3) / 3) * 12 + (Math.min(velocity15, 2.5) / 2.5) * 8, 0, 20);

  const tx5 = a.transactions?.m5;
  const tx1h = a.transactions?.h1;
  const buyers5 = tx5?.buyers ?? tx5?.buys ?? 0;
  const sellers5 = tx5?.sellers ?? tx5?.sells ?? 0;
  const buyers1h = tx1h?.buyers ?? tx1h?.buys ?? 0;
  const expected5mBuyers = Math.max(buyers1h / 12, 1);
  const buyerVelocity = buyers5 / expected5mBuyers;
  const buySellRatio = buyers5 / Math.max(sellers5, 1);
  const buyerScore = clamp((Math.min(buyerVelocity, 3) / 3) * 12 + (Math.min(buySellRatio, 3) / 3) * 6, 0, 18);

  const liquidity = n(a.reserve_in_usd);
  const fdv = n(a.fdv_usd);
  const marketCap = n(a.market_cap_usd);
  let liquidityAbsolute = 0;
  if (liquidity >= 1_000_000) liquidityAbsolute = 10;
  else if (liquidity >= 500_000) liquidityAbsolute = 9;
  else if (liquidity >= 250_000) liquidityAbsolute = 8;
  else if (liquidity >= 100_000) liquidityAbsolute = 6.5;
  else if (liquidity >= 50_000) liquidityAbsolute = 5;
  else if (liquidity >= 25_000) liquidityAbsolute = 3;
  else if (liquidity >= 10_000) liquidityAbsolute = 1;

  const liquidityToFdv = fdv > 0 ? liquidity / fdv : 0;
  let capitalBacking = 0;
  if (liquidityToFdv >= 0.2) capitalBacking = 5;
  else if (liquidityToFdv >= 0.1) capitalBacking = 4;
  else if (liquidityToFdv >= 0.05) capitalBacking = 3;
  else if (liquidityToFdv >= 0.02) capitalBacking = 1.5;
  const liquidityScore = clamp(liquidityAbsolute + capitalBacking, 0, 15);

  const change5 = n(a.price_change_percentage?.m5);
  const change15 = n(a.price_change_percentage?.m15);
  const change1h = n(a.price_change_percentage?.h1);
  let priceScore =
    activityPointScore(change5, 0, 8, 4) +
    activityPointScore(change15, 1, 20, 4) +
    activityPointScore(change1h, 3, 45, 4);
  if (change5 > 25 || change15 > 60 || change1h > 120) priceScore *= 0.55;
  if (change5 < -8 || change15 < -15) priceScore *= 0.35;
  priceScore = clamp(priceScore, 0, 12);

  let valuationScore = 3;
  if (fdv > 0) {
    if (fdv < 50_000) valuationScore = 0.5;
    else if (fdv < 100_000) valuationScore = 3;
    else if (fdv <= 20_000_000) valuationScore = 10;
    else if (fdv <= 50_000_000) valuationScore = 7;
    else if (fdv <= 100_000_000) valuationScore = 4;
    else valuationScore = 1.5;
  }

  const activityHigh = volumeScore >= 13 && buyerScore >= 11;
  let attention: DiamondAttention = 'QUIET';
  let attentionScore = 4;
  if (context.isTrendingCoin) {
    attention = 'COINGECKO_TRENDING';
    attentionScore = 2;
  } else if (context.isTrendingPool) {
    attention = 'POOL_TRENDING';
    attentionScore = 6;
  } else if (activityHigh) {
    attention = 'EARLY';
    attentionScore = 8;
  }

  let ageScore = 1;
  if (ageMinutes == null) ageScore = 1;
  else if (ageMinutes < 5) ageScore = 1;
  else if (ageMinutes <= 360) ageScore = 3;
  else if (ageMinutes <= 1440) ageScore = 2;
  else ageScore = 0;

  const hScore = holderScore(context.tokenInfo);
  const infoScore = narrativeScore(context.tokenInfo);

  const components = {
    volumeAcceleration: { score: rounded(volumeScore), max: 20, label: 'Volume acceleration' },
    buyerAcceleration: { score: rounded(buyerScore), max: 18, label: 'Buyer acceleration' },
    liquidityQuality: { score: rounded(liquidityScore), max: 15, label: 'Liquidity quality' },
    priceStructure: { score: rounded(priceScore), max: 12, label: 'Price structure' },
    valuationOpportunity: { score: rounded(valuationScore), max: 10, label: 'Valuation opportunity' },
    holderQuality: { score: hScore == null ? null : rounded(hScore), max: 10, label: 'Holder quality' },
    attentionLead: { score: rounded(attentionScore), max: 8, label: 'Attention lead' },
    narrativeQuality: { score: infoScore == null ? null : rounded(infoScore), max: 4, label: 'Information / narrative quality' },
    earlyAge: { score: rounded(ageScore), max: 3, label: 'Early discovery' },
  } satisfies Record<string, DiamondScoreComponent>;

  const available = Object.values(components).filter((c) => c.score != null);
  const availableMax = available.reduce((sum, c) => sum + c.max, 0);
  const earned = available.reduce((sum, c) => sum + (c.score ?? 0), 0);
  const prePenaltyScore = availableMax > 0 ? (earned / availableMax) * 100 : 0;

  const riskFlags: string[] = [];
  const reasons: string[] = [];
  let penalty = 0;
  let hardReject = false;

  if (liquidity < 10_000) {
    penalty += 25;
    riskFlags.push('Liquidity below $10K');
    hardReject = true;
  } else if (liquidity < 25_000) {
    penalty += 15;
    riskFlags.push('Thin liquidity below $25K');
  } else if (liquidity < 50_000) {
    penalty += 8;
    riskFlags.push('Liquidity below $50K');
  }

  if (fdv > 0 && liquidity > 0) {
    const fdvToLiquidity = fdv / liquidity;
    if (fdvToLiquidity > 100) {
      penalty += 15;
      riskFlags.push('FDV/liquidity ratio above 100x');
    } else if (fdvToLiquidity > 50) {
      penalty += 10;
      riskFlags.push('FDV/liquidity ratio above 50x');
    } else if (fdvToLiquidity > 25) {
      penalty += 5;
      riskFlags.push('FDV/liquidity ratio above 25x');
    }
  }

  const suspiciousReports = a.community_sus_report ?? 0;
  if (suspiciousReports >= 5) {
    penalty += 25;
    riskFlags.push('Multiple suspicious community reports');
    hardReject = true;
  } else if (suspiciousReports >= 1) {
    penalty += 10;
    riskFlags.push('Community suspicious report');
  }

  if (change1h > 150 || change15 > 80) {
    penalty += 10;
    riskFlags.push('Already vertically extended');
  }
  if (sellers5 > buyers5 * 2 && sellers5 >= 8) {
    penalty += 8;
    riskFlags.push('5m seller imbalance');
  }

  const tokenInfo = context.tokenInfo;
  if (tokenInfo) {
    const t = tokenInfo.attributes;
    const honeypot = t.is_honeypot;
    if (honeypot === true) {
      penalty += 60;
      riskFlags.push('Honeypot flag');
      hardReject = true;
    } else if (honeypot === 'unknown' || honeypot == null) {
      penalty += 4;
      riskFlags.push('Honeypot status unknown');
    }
    if (t.mint_authority && t.mint_authority.toLowerCase() !== 'no') {
      penalty += 12;
      riskFlags.push('Mint authority active/unclear');
    }
    if (t.freeze_authority && t.freeze_authority.toLowerCase() !== 'no') {
      penalty += 12;
      riskFlags.push('Freeze authority active/unclear');
    }
    const top10 = t.holders ? n(t.holders.distribution_percentage?.top_10) : null;
    if (top10 != null) {
      if (top10 > 75) {
        penalty += 15;
        riskFlags.push('Top 10 holders exceed 75%');
      } else if (top10 > 60) {
        penalty += 10;
        riskFlags.push('Top 10 holders exceed 60%');
      }
    }
    const devHolding = t.developer_holding_percentage == null ? null : n(t.developer_holding_percentage);
    if (devHolding != null) {
      if (devHolding > 20) {
        penalty += 25;
        riskFlags.push('Developer holding above 20%');
        hardReject = true;
      } else if (devHolding > 10) {
        penalty += 15;
        riskFlags.push('Developer holding above 10%');
      } else if (devHolding > 5) {
        penalty += 8;
        riskFlags.push('Developer holding above 5%');
      }
    }
    if (t.gt_score != null && t.gt_score < 30) {
      penalty += 10;
      riskFlags.push('Low GeckoTerminal trust score');
    }
  }

  if (volumeScore >= 15) reasons.push('5m/15m volume is accelerating versus the 1h baseline');
  if (buyerScore >= 13) reasons.push('Unique buyer velocity and buy/sell imbalance are strong');
  if (liquidityScore >= 10) reasons.push('Liquidity is substantial relative to valuation');
  if (attention === 'EARLY') reasons.push('Activity is strong before CoinGecko trending confirmation');
  if (priceScore >= 9) reasons.push('Momentum is positive without extreme vertical extension');
  if (hScore != null && hScore >= 7) reasons.push('Holder distribution/breadth passes the deep check');

  const score = clamp(Math.round(prePenaltyScore - penalty), 0, 100);
  let stage: DiamondStage = 'REJECT';
  if (!hardReject) {
    if (score >= 90) stage = 'RARE_DIAMOND';
    else if (score >= 80) stage = 'DIAMOND';
    else if (score >= 70) stage = 'EMERGING';
    else if (score >= 60) stage = 'WATCH';
  }

  const t = tokenInfo?.attributes;
  return {
    score,
    prePenaltyScore: rounded(prePenaltyScore),
    penalty,
    stage,
    confidence: tokenInfo ? 'DEEP_CHECKED' : 'PRELIMINARY',
    attention,
    hardReject,
    riskFlags,
    reasons,
    components,
    metrics: {
      ageMinutes: ageMinutes == null ? null : rounded(ageMinutes),
      liquidityUsd: liquidity,
      fdvUsd: fdv,
      marketCapUsd: marketCap,
      volume5mUsd: volume5m,
      volume15mUsd: volume15m,
      volume1hUsd: volume1h,
      volumeVelocity5m: rounded(velocity5),
      buyerVelocity5m: rounded(buyerVelocity),
      buyers5m: buyers5,
      sellers5m: sellers5,
      buySellRatio5m: rounded(buySellRatio),
      change5m: change5,
      change15m: change15,
      change1h,
      top10HolderPct: t?.holders ? rounded(n(t.holders.distribution_percentage?.top_10)) : null,
      holderCount: t?.holders?.count ?? null,
      gtScore: t?.gt_score ?? null,
      developerHoldingPct: t?.developer_holding_percentage == null ? null : rounded(n(t.developer_holding_percentage)),
    },
  };
}
