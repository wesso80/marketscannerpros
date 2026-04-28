export type PublicAssessment = 'ALIGNED' | 'NOT_ALIGNED' | 'WATCH';
export type Direction = 'LONG' | 'SHORT' | 'NEUTRAL';
export type Verdict = 'agree' | 'disagree' | 'neutral' | 'unknown';

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
    scoreBreakdown: Array<{ key: string; weight: number; value: number; note?: string }>;
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
      indicators: Array<{ name: string; value: string; state: 'bull' | 'bear' | 'neutral' }>;
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
    };
  };
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
