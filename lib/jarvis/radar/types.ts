/**
 * Private Jarvis — Overnight Opportunity Radar types.
 * Research-only. No signals, no execution.
 */

export type AssetClass = 'equity' | 'etf' | 'crypto';

export type Flag =
  | 'NEW_BREAKOUT' | 'NEW_BREAKDOWN' | 'NEW_TREND_RECLAIM' | 'NEW_TREND_LOSS'
  | 'NEW_RELATIVE_STRENGTH' | 'NEW_RELATIVE_WEAKNESS' | 'NEW_VOLUME_EXPANSION' | 'NEW_VOLATILITY_EXPANSION'
  | 'NEW_MOMENTUM_ACCELERATION' | 'NEW_MOMENTUM_DIVERGENCE' | 'NEW_SECTOR_ROTATION' | 'NEW_CRYPTO_ROTATION'
  | 'NEW_CATALYST' | 'NEW_DERIVATIVES_ACTIVITY' | 'NEW_SQUEEZE_RELEASE' | 'NEW_HIGH' | 'NEW_LOW'
  | 'GAP_UP' | 'GAP_DOWN' | 'RSI_REGIME_UP' | 'RSI_REGIME_DOWN' | 'MACD_FLIP_UP' | 'MACD_FLIP_DOWN';

export type ResearchStatus = 'HIGH_RESEARCH_PRIORITY' | 'INVESTIGATE' | 'WATCH' | 'LOW_QUALITY_MOVE' | 'DETERIORATING' | 'IGNORE';

export type RejectionReason = 'PARABOLIC' | 'TOO_EXTENDED' | 'THIN_LIQUIDITY' | 'NO_VOLUME_CONFIRMATION' | 'DOWNTREND_RALLY' | 'NO_CATALYST' | 'WEAK_RELATIVE_STRENGTH' | 'SECTOR_NOT_CONFIRMING' | 'DATA_QUALITY' | 'STALE_PRINT' | 'CROWDED_DERIVATIVES' | 'BETA_ONLY' | 'NO_PRIOR_LEADERSHIP';

export type OpportunityType =
  | 'EARLY_BREAKOUT' | 'BREAKOUT_CONFIRMATION' | 'TREND_RECLAIM' | 'MOMENTUM_CONTINUATION' | 'RELATIVE_STRENGTH_LEADER'
  | 'SECTOR_ROTATION' | 'CRYPTO_ROTATION' | 'VOLATILITY_EXPANSION' | 'CATALYST_MOVE' | 'REVERSAL_WATCH'
  | 'OVERSOLD_RECOVERY' | 'SQUEEZE_RELEASE' | 'DETERIORATING_LEADER' | 'FAILED_BREAKOUT' | 'BREAKDOWN';

export interface Bar { date: string; open: number; high: number; low: number; close: number; volume: number }

/** One asset's structural state at a point in time (used for today vs yesterday change detection). */
export interface StructState {
  close: number;
  ema20: number | null; ema50: number | null; ema200: number | null;
  aboveE20: boolean | null; aboveE50: boolean | null; aboveE200: boolean | null; e20AboveE50: boolean | null;
  hi20: number | null; lo20: number | null; hi50: number | null; lo50: number | null; // exclude current bar
  atHi20: boolean; atLo20: boolean; atHi50: boolean; atLo50: boolean;
  rsi: number | null; macdHist: number | null; adx: number | null;
  atr14: number | null; atr5: number | null; atr20: number | null;
  bbWidthPct: number | null; bbWidthPctile: number | null; // percentile over trailing 120 bars
  ret5: number | null; ret20: number | null;
  vol: number; avgVol20: number | null; avgVol5: number | null;
}

export interface Features {
  symbol: string;
  name: string | null;
  assetClass: AssetClass;
  lastDate: string;
  barCount: number;
  dataQuality: { ohlc: 'full' | 'close_only'; volume: 'live' | 'unavailable'; fresh: boolean; notes: string[] };
  price: number;
  ret1: number; ret3: number | null; ret5: number | null; ret20: number | null;
  gapPct: number | null; rangePct: number | null; rangeVsAtr: number | null; closePosInRange: number | null;
  atrPct: number | null; moveAtr: number | null; atrExpansion: number | null; rv10: number | null; rv60: number | null;
  distToHi20Pct: number | null; distToHi50Pct: number | null; extensionAtr: number | null; ret5Atr: number | null;
  volRatio: number | null; volPctile60: number | null; accumRatio: number | null; dollarVol20: number | null;
  rsi: number | null; rsiPrev5: number | null; adx: number | null; adxPrev5: number | null;
  macdHist: number | null; macdHistPrev: number | null; rocAccel: number | null;
  squeeze: boolean; squeezeRelease: boolean; consolidationTight: boolean; range20VsAtr: number | null;
  rsBench5: number | null; rsBench20: number | null; rsBench5Prev: number | null; rsBenchDelta: number | null; benchmark: string;
  sector: string | null; sectorEtf: string | null; rsSector5: number | null;
  now: StructState; prev: StructState;
  flags: Flag[];
  direction: 'up' | 'down' | 'flat';
  // crypto extras (CoinGecko)
  crypto?: {
    marketCap: number | null; rank: number | null; volume24h: number | null; turnover: number | null; turnoverVsMedian: number | null;
    ret1h: number | null; ret7d: number | null; ret30d: number | null; athChangePct: number | null;
    hi7d: number | null; lo7d: number | null; posIn7dRange: number | null; rv7dHourly: number | null;
    fundingMedianPct: number | null; fundingVenues: number; openInterestUsd: number | null; oiVenues: number;
    fundingChange: number | null; oiChangePct: number | null; categories: string[];
  };
  catalysts: CatalystHit[];
  earningsDate: string | null; earningsInDays: number | null;
  crcs: { final: number; eligibility: string; deltaVsPrevDay: number | null } | null;
}

export interface CatalystHit { type: 'NEWS' | 'SEC_FILING' | 'EARNINGS' | 'MACRO'; when: string; headline: string; severity: string | null; source: string | null }

export interface Scored {
  f: Features;
  score: number;
  setupScore: number;
  status: ResearchStatus;
  opportunityType: OpportunityType | null;
  reasons: string[];
  confirming: string[];
  conflicting: string[];
  components: Record<string, number>;
  bigMove: boolean;
  rejection: RejectionReason[];
}

export interface DeepDive {
  symbol: string;
  overview: { sector: string | null; industry: string | null; marketCap: number | null; beta: number | null; high52w: number | null; low52w: number | null; distFrom52wHighPct: number | null } | null;
  news: { count48h: number; namedCount48h: number; avgSentiment: number | null; topHeadline: string | null; topSource: string | null; publishedAt: string | null } | null;
  options: { putCallRatio: number; ivRank: number; unusualActivity: string; sentiment: string; dealerGamma: string } | null;
  cryptoVolume: { avgVol30d: number; volRatio: number; volPctile30: number } | null;
  indicatorsDb: { ema200: number | null; adx14: number | null; rsi14: number | null; inSqueeze: boolean | null; computedAt: string } | null;
  notes: string[];
}

export interface FinalCandidate {
  rank: number;
  symbol: string; name: string | null; assetClass: AssetClass;
  status: ResearchStatus; opportunityType: OpportunityType | null; score: number; direction: 'up' | 'down' | 'flat';
  stage: string; ret1: number; ret5: number | null;
  whatChanged: string; whyFlagged: string; whyMayContinue: string; confirming: string[]; conflicting: string[];
  sectorTheme: string; catalyst: string; volume: string; volatility: string; relativeStrength: string; structure: string; momentum: string;
  whatToWatchNext: string; whatWouldReduceInterest: string; whatWouldInvalidate: string; earlyOrExtended: string; dataQuality: string;
  velocity: string[];
  deep: DeepDive;
}

export interface RotationRow { ticker: string; label: string; ret1: number | null; ret5: number | null; ret20: number | null; rs5: number | null; rs20: number | null; rs5Prev: number | null; rank5: number; rank20: number; rank20Prev: number; note: string | null }

export interface Rotation {
  sectors: RotationRow[];
  strongYesterday: string[]; strongToday: string[]; newlyStrengthened: string[]; lostLeadership: string[];
  crossAsset: { pair: string; reading: string; value: number | null }[];
  crypto: { btc24h: number | null; eth24h: number | null; altMedian24h: number | null; btc7d: number | null; eth7d: number | null; altMedian7d: number | null; leader24h: string; leader7d: string; breadth24h: number | null; breadth7d: number | null; categoriesUp: { name: string; change24h: number; marketCap: number }[]; categoriesDown: { name: string; change24h: number; marketCap: number }[] };
  breadth: { equities: { up: number; total: number; aboveE20: number; aboveE50: number; volSurge: number; newHi20: number; newLo20: number }; crypto: { up24h: number; up7d: number; total: number; aboveE20: number; aboveE50: number } };
}

export interface MorningReport {
  generatedAt: string;
  sessionDate: string;
  sessionBasis: { equities: string; crypto: string };
  environment: string;
  thirtySeconds: { whatMoved: string; rotation: string; bestNewStrength: string[]; bestEarlySetups: string[]; ignore: string[]; watchToday: string[]; macro: string | null };
  counts: { universe: number; equities: number; crypto: number; other: number; stage1Listed: number; stage1Quoted: number; stage1Liquid: number; meaningfulMovers: number; unusual: number; newStrength: number; newWeakness: number; initialCandidates: number; deepDives: number; finalShortlist: number; rejected: number; settingUp: number };
  whatMoved: { equities: string[]; crypto: string[]; sectors: string[]; commodities: string[]; fx: string[]; rates: string[] };
  biggestChanges: Scored[];
  newStrength: Scored[];
  newWeakness: Scored[];
  unusual: Scored[];
  rotation: Rotation;
  themes: Array<{ name: string; assetClass: string; members: number; pctUp: number; medianRet1: number; verdict: string; confirmation: string; early: string[]; extended: string[]; leaders: string[] }>;
  shortlist: FinalCandidate[];
  rejected: { symbol: string; assetClass: AssetClass; ret1: number; reasons: RejectionReason[]; detail: string[] }[];
  settingUp: Array<{ symbol: string; assetClass: AssetClass; stage: string; score: number; ret1: number; ret5: number | null; bbWidthPctile: number | null; rsBenchDelta: number | null; accumRatio: number | null; distToHi20Pct: number | null; adx: number | null; signals: string[]; penalties: string[]; triggerLevel: number | null; themeBoost: string | null }>;
  lifecycle: { changes: Array<{ symbol: string; from: string | null; to: string; note: string }>; active: Array<{ symbol: string; status: string; sessionsSeen: number; note: string }> };
  watchToday: string[];
  dataGaps: string[];
  providers: { name: string; status: string; detail: string }[];
  apiUsage: { alphaVantage: number; coingecko: number; dbQueries: number; errors: number; runtimeMs: number; sustainableMaxEquities: string };
  macroNext24h: { time: string; country: string; event: string; impact: string }[];
  snapshot: Record<string, { funding: number | null; oi: number | null; score: number; status: ResearchStatus; premove: number; stage: string; rsRank: number | null; volRatio: number | null; price: number }>;
}
