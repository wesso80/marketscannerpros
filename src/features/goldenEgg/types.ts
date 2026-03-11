export type Permission = 'TRADE' | 'NO_TRADE' | 'WATCH';
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
    unusualActivity: string[];
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
    permission: Permission;
    direction: Direction;
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
    execution: {
      entryTrigger: string;
      entry: { type: 'market' | 'limit' | 'stop'; price?: number };
      stop: { price: number; logic: string };
      targets: Array<{ price: number; rMultiple?: number; note?: string }>;
      rr: { expectedR: number; minR: number };
      sizingHint?: { riskPct: number; riskUsd?: number; sizeUnits?: number };
    };
  };
  layer3: {
    structure: {
      verdict: Verdict;
      trend: { htf: string; mtf: string; ltf: string };
      volatility: { regime: 'compression' | 'expansion' | 'neutral'; atr?: number };
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
  };
}
