export type PublicAssessment = 'ALIGNED' | 'NOT_ALIGNED' | 'WATCH';
export type Direction = 'LONG' | 'SHORT' | 'NEUTRAL';
export type Verdict = 'agree' | 'disagree' | 'neutral' | 'unknown';
export type IndicatorState = 'bull' | 'bear' | 'neutral' | 'strength' | 'extended';

/* ── Canonical packet: the single source of truth every Golden Egg surface and the Deep Analyst read ── */
export interface GoldenEggCanonical {
  symbol: string;
  assetClass: 'equity' | 'crypto' | 'forex';
  timeframe: string;
  barInterval: string | null;
  price: number;
  /** Change vs the previous completed bar close (daily/weekly) or previous bar (intraday), in percent. */
  changePct: number;
  priceTs: string;
  lastCompletedBarAt: string | null;
  historyBars: number;
  source: string | null;
  indicators: {
    rsi: number | null; adx: number | null; atr: number | null; atrPct: number | null;
    ema20: number | null; ema50: number | null; ema200: number | null;
    sma20: number | null; sma50: number | null; macdHist: number | null; macd: number | null; macdSignal: number | null; stochK: number | null;
    computedOn: string;
  };
  liquidity: { volume: number | null; avgVolume: number | null; advUsd: number | null; volumeBasis: string | null };
  dataTrust: { level: 'GOOD' | 'DEGRADED' | 'STALE' | 'INSUFFICIENT_DATA'; label: string; reasons: string[]; freshness: string; priceDiscontinuity: { date: string | null; ratio: number } | null };
  scores: { structure: number; flow: number; momentum: number; riskQuality: number; notes: { structure: string[]; risk: string[]; flow: string[]; momentum: string[] } };
  timing: { relation: 'supportive' | 'conflict' | 'neutral' | 'unavailable'; valid: boolean; eligibleForHardGate: boolean; direction: 'bullish' | 'bearish' | 'neutral'; signalStrength: string; confidence: number | null; sessionState: 'open' | 'closed' | 'always_open' | 'unknown'; reasons: string[] };
  extension: { rsiExtended: boolean; stochExtended: boolean; dveExhaustion: number | null; dveSignal: string | null; dveSignalStrength: string | null; label: string };
  derivatives: { fundingRatePercent: number | null; fundingInterval: string; annualizedPct: number | null; openInterestUsd: number; perpVolume24hUsd: number; exchanges: number; crowding: 'unavailable' | 'neutral' | 'long_crowded' | 'short_crowded'; note: string } | null;
  options: {
    expiry: string; daysToExpiry: number; snapshotTs: string; putCallOi: number; avgIvPct: number | null; ivRank: null; expectedMovePct: number | null; maxPain: number | null;
    callWall: { strike: number; relation: string } | null; putWall: { strike: number; relation: string } | null; dealerGamma: string; unusualActivity: string;
    topCall: { strike: number; oi: number; volume: number; iv: number | null; delta: number | null; gamma: number | null; theta: number | null; vega: number | null } | null;
    topPut: { strike: number; oi: number; volume: number; iv: number | null; delta: number | null; gamma: number | null; theta: number | null; vega: number | null } | null;
    totalCallOi: number; totalPutOi: number;
    quality: { level: 'GOOD' | 'DEGRADED' | 'UNUSABLE'; reasons: string[] }; notes: string[];
  } | null;
  fundamentals: {
    name: string | null; sector: string | null; industry: string | null; marketCap: number | null; pe: number | null; forwardPe: number | null; peg: number | null;
    revenueGrowthYoy: number | null; earningsGrowthYoy: number | null; profitMargin: number | null; multipleLabel: string; periodSummary: string;
    analystTarget: number | null; analystCount: number | null; nextEarningsDate: string | null; daysToEarnings: number | null; lastReportedQuarter: string | null; lastEpsBeat: boolean | null;
  } | null;
  network: {
    marketCap: number | null; marketCapRank: number | null; circulatingSupply: number | null; maxSupply: number | null; totalSupply: number | null; fdv: number | null; fdvBasis: string; supplyIssuedPct: number | null;
    spotVolume24h: number | null; volumeToMcap: number | null; ath: number | null; athDate: string | null; distanceFromAthPct: number | null; change7dPct: number | null; change30dPct: number | null;
    categories: string[]; relative: Array<{ benchmark: string; ratio: number; symbolPct: number; benchmarkPct: number; window: string; label: string }>; notes: string[];
  } | null;
  crossMarket: { alignment: 'supportive' | 'neutral' | 'headwind' | 'unknown'; summary: string; items: Array<{ symbol: string; label: string; price: number | null; changePct: number | null; trend: string; detail: string; relation: string }> };
  levels: {
    reference: { price: number | null; basis: 'structural' | 'mechanical'; label: string };
    invalidation: { price: number; basis: 'structural' | 'mechanical'; label: string; distanceAtr: number | null };
    zones: Array<{ price: number; basis: 'structural' | 'mechanical'; label: string; rMultiple: number | null }>;
    illustrativeR: number | null;
  };
  verdict: { assessment: PublicAssessment; direction: Direction; confluence: number; grade: string; primaryDriver: string; primaryBlocker: string | null; setupType: string; setupNote: string };
  confirmation: string[];
  invalidation: string[];
}

/* ── Deep Analysis types (from /api/deep-analysis) ───────────────────── */
export interface DeepAnalysisData {
  symbol: string;
  assetType: string;
  price: {
    price: number;
    change: number;
    changePercent: number;
    high24h: number;
    low24h: number;
    volume: number;
  } | null;
  indicators: {
    rsi: number | null;
    macd: number | null;
    macdSignal: number | null;
    macdHist: number | null;
    sma20: number | null;
    sma50: number | null;
    bbUpper: number | null;
    bbMiddle: number | null;
    bbLower: number | null;
    adx: number | null;
    stochK?: number | null;
    stochD?: number | null;
    atr?: number | null;
    volumeRatio?: number | null;
    priceVsSma20?: number | null;
  } | null;
  company: {
    name: string;
    description: string;
    sector: string;
    industry: string;
    marketCap: string;
    peRatio: number | null;
    forwardPE: number | null;
    eps: number | null;
    dividendYield: number | null;
    week52High: number | null;
    week52Low: number | null;
    targetPrice: number | null;
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  } | null;
  news: Array<{
    title: string;
    summary: string;
    source: string;
    sentiment: string;
    sentimentScore: number;
    url: string;
    publishedAt?: string;
  }> | null;
  earnings: {
    nextEarningsDate: string | null;
    lastReportedEPS: number | null;
    lastEstimatedEPS: number | null;
    lastSurprise: number | null;
    lastSurprisePercent: number | null;
    lastBeat: boolean | null;
    beatRate: number | null;
  } | null;
  optionsData: {
    expiryDate: string;
    highestOICall: { strike: number; openInterest: number; volume: number; iv: number; delta: number | null; gamma: number | null; theta: number | null } | null;
    highestOIPut: { strike: number; openInterest: number; volume: number; iv: number; delta: number | null; gamma: number | null; theta: number | null } | null;
    totalCallOI: number;
    totalPutOI: number;
    putCallRatio: number;
    maxPain: number;
    avgIV: number;
    ivRank: number;
    sentiment: string;
    unusualActivity: string | string[];
  } | null;
  signals: {
    signal: string;
    score: number;
    reasons: string[];
    bullishCount: number;
    bearishCount: number;
  } | null;
  aiAnalysis: string | null;
  cryptoData?: {
    fearGreed: { value: number; classification: string };
    marketData?: { marketCapRank: number; marketCap: number; totalVolume: number } | null;
  } | null;
}

export interface GoldenEggPayload {
  meta: {
    symbol: string;
    assetClass: 'equity' | 'crypto' | 'forex';
    price: number;
    asOfTs: string;
    timeframe: string;
  };
  layer1: {
    assessment: PublicAssessment;
    direction: Direction;
    confluenceScore: number;
    confidence: number;
    grade: 'A' | 'B' | 'C' | 'D';
    primaryDriver: string;
    primaryBlocker?: string;
    flipConditions: Array<{ id: string; text: string; severity: 'must' | 'should' | 'nice' }>;
    scoreBreakdown: Array<{ key: string; weight: number; value: number; note?: string; available?: boolean; applicable?: boolean; imputedNeutral?: boolean; effectiveWeight?: number; points?: number }>;
    scoreCalculation?: {version: string; coverage: number; rawTotal: number; missingComponents?: string[]; trustCap: number; capAdjustment: number; finalScore: number};
    cta: { primary: 'OPEN_SCANNER' | 'SET_ALERT' | 'ADD_WATCHLIST'; secondary?: 'OPEN_OPTIONS' | 'OPEN_TIME' };
  };
  layer2: {
    setup: {
      setupType: 'trend' | 'breakout' | 'mean_reversion' | 'reversal' | 'squeeze' | 'range';
      thesis: string;
      timeframeAlignment: { score: number; max: number; details: string[] };
      keyLevels: Array<{ label: string; price: number; kind: 'support' | 'resistance' | 'pivot' | 'value' }>;
      invalidation: string;
    };
    scenario: {
      referenceTrigger: string;
      referenceLevel: { type: 'reference' | 'confirmation'; price?: number };
      invalidationLevel: { price: number; logic: string };
      reactionZones: Array<{ price: number; rMultiple?: number; note?: string }>;
      hypotheticalRr: { expectedR: number; minR: number };
      hypotheticalRisk?: { riskPct: number; riskUsd?: number; sizeUnits?: number };
    };
  };
  layer3: {
    structure: {
      verdict: Verdict;
      trend: { htf: string; mtf: string; ltf: string };
      volatility: {
        regime: 'compression' | 'neutral' | 'transition' | 'expansion' | 'climax';
        atr?: number;
        // DVE Layer 1: Volatility State
        bbwp?: number;
        bbwpSma5?: number;
        rateOfChange?: number;
        // DVE Layer 2: Directional Bias
        directionalBias?: 'bullish' | 'bearish' | 'neutral';
        directionalConfidence?: number;
        // DVE Layer 3: Phase Persistence
        contractionContinuation?: number;
        expansionContinuation?: number;
        phaseAge?: number;
        phaseAgePercentile?: number;
        // DVE Layer 4: Signal
        signalType?: string;
        signalStrength?: number;
        // DVE Supporting
        breakoutScore?: number;
        breakoutComponents?: { volCompression: number; timeAlignment: number; gammaWall: number; adxRising: number };
        breakoutComponentDetails?: string[];
        trapDetected?: boolean;
        trapScore?: number;
        exhaustionRisk?: number;
      };
      liquidity: { overhead?: string; below?: string; note?: string };
    };
    options?: {
      enabled: boolean;
      verdict: Verdict;
      highlights: Array<{ label: string; value: string }>;
      notes?: string[];
    };
    momentum: {
      verdict: Verdict;
      indicators: Array<{ name: string; value: string; state: IndicatorState }>;
    };
    internals?: {
      enabled: boolean;
      verdict: Verdict;
      items: Array<{ name: string; value: string; state: 'bull' | 'bear' | 'neutral' }>;
    };
    narrative?: {
      enabled: boolean;
      summary: string;
      bullets: string[];
      risks: string[];
    };
    timeConfluence?: {
      enabled: boolean;
      verdict: Verdict;
      confidence: number;
      direction: 'bullish' | 'bearish' | 'neutral';
      signalStrength: 'strong' | 'moderate' | 'weak' | 'no_signal';
      banners: string[];
      scoreBreakdown: {
        directionScore: number;
        clusterScore: number;
        decompressionScore: number;
        activeTFs: number;
        hasHigherTF: boolean;
      };
      decompression: {
        activeCount: number;
        clusteredCount: number;
        clusteringRatio: number;
        netPullDirection: 'bullish' | 'bearish' | 'neutral';
        reasoning: string;
        pulls: Array<{ tf: string; minsToClose: number; mid50Level: number; pullDirection: 'up' | 'down' | 'none'; pullStrength: number; distanceToMid50: number }>;
      };
      candleCloseConfluence: {
        confluenceScore: number;
        confluenceRating: string;
        closingNowCount: number;
        closingNowTFs: string[];
        closingSoonCount: number;
        peakConfluenceIn: number;
        bestEntryWindow: { startMins: number; endMins: number; reason: string };
        isMonthEnd: boolean;
        isWeekEnd: boolean;
      };
      mid50Levels: Array<{ tf: string; level: number; distance: number; isDecompressing: boolean }>;
      prediction: {
        direction: 'bullish' | 'bearish' | 'neutral';
        confidence: number;
        reasoning: string;
        targetLevel: number;
        expectedMoveTime: string;
      };
      closeSchedule: Array<{
        tf: string;
        tfMinutes: number;
        nextCloseAt: string;
        minsToClose: number;
        weight: number;
        mid50Level: number | null;
        distanceToMid50: number | null;
        pullDirection: 'up' | 'down' | 'none' | null;
        category: 'intraday' | 'daily' | 'weekly' | 'monthly';
      }>;
      decompressionTarget: {
        price: number;
        direction: 'up' | 'down' | 'flat';
        totalWeight: number;
        contributingTFs: string[];
      } | null;
      sessionState?: 'open' | 'closed' | 'always_open';
      displayNote?: string;
      /** Whether this read was allowed to gate the verdict, and why. */
      gating?: { relation: string; valid: boolean; eligibleForHardGate: boolean; reasons: string[] };
    };
  };
  /** Canonical facts (Part C). Present on every live packet. */
  canonical?: GoldenEggCanonical;
  doctrine?: {
    id: string;
    label: string;
    confidence: number;
    regime: string;
    reasons: string[];
    playbook: {
      description: string;
      direction: string;
      category: string;
      entryCriteria: string[];
      riskModel: { stopDescription: string; targetDescription: string; defaultRR: number };
      failureSignals: string[];
    };
  } | null;
}
