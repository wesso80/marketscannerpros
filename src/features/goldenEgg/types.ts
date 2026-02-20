export type Permission = 'TRADE' | 'NO_TRADE' | 'WATCH';
export type Direction = 'LONG' | 'SHORT' | 'NEUTRAL';
export type Verdict = 'agree' | 'disagree' | 'neutral' | 'unknown';

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
