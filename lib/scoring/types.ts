export type MSPPermissionState = 'ALLOW' | 'WAIT' | 'BLOCK';
export type MSPQuality = 'low' | 'medium' | 'high';
export type MSPDirection = 'bullish' | 'bearish' | 'neutral';

export type MSPMode = 'market_scanner' | 'options_scanner' | 'time_scanner' | 'composite';

export interface MSPDataCoverage {
  provider: 'alpha_vantage' | 'binance' | 'coingecko' | 'other';
  minAvailable?: string;
  maxAvailable?: string;
  appliedStartDate?: string;
  appliedEndDate?: string;
  bars?: number;
  staleSeconds: number;
}

export interface MSPPermission {
  state: MSPPermissionState;
  blockers: string[];
  warnings: string[];
  notes?: string;
}

export interface MSPScores {
  context: number;
  setup: number;
  execution: number;
  baseScore: number;
  gateMultiplier: number;
  finalScore: number;
  confidence: number;
  quality: MSPQuality;
  tfConfluenceScore: number;
  tfAlignment: 1 | 2 | 3 | 4;
  timeWindowFit?: number;
}

export interface MSPContribution {
  key: string;
  label: string;
  layer: 'context' | 'setup' | 'execution';
  weight: number;
  value: number;
  points: number;
}

export interface MSPLevels {
  entryZone?: { min: number; max: number } | null;
  invalidation?: number | null;
  targets?: number[];
}

export type MSPOptionStrategyType =
  | 'CALL'
  | 'PUT'
  | 'BULL_CALL_DEBIT'
  | 'BEAR_PUT_DEBIT'
  | 'BULL_PUT_CREDIT'
  | 'BEAR_CALL_CREDIT';

export interface MSPOptionLeg {
  contractId: string;
  type: 'call' | 'put';
  side: 'long' | 'short';
  strike: number;
  expiry: string;
  bid?: number;
  ask?: number;
  mid?: number;
  last?: number;
  volume?: number;
  openInterest?: number;
  iv?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
}

export interface MSPOptionCandidate {
  strategyType: MSPOptionStrategyType;
  underlying: string;
  spot: number;
  dte: number;
  legs: MSPOptionLeg[];
  debit?: number;
  credit?: number;
  maxGain?: number;
  maxLoss?: number;
  breakeven?: number;
  expectedMovePct?: number;
}

export interface MSPScorePayloadV2 {
  version: 'msp.score.v2.1';
  asOf: string;
  symbol: string;
  assetClass: 'equity' | 'crypto' | 'forex' | 'index' | 'options';
  timeframe: string;
  mode: MSPMode;
  bias: { direction: MSPDirection; strength: number };
  permission: MSPPermission;
  scores: MSPScores;
  features: {
    context: Record<string, number>;
    setup: Record<string, number>;
    execution: Record<string, number>;
  };
  contrib: MSPContribution[];
  levels?: MSPLevels;
  evidence: {
    dataCoverage: MSPDataCoverage;
    optionsCandidate?: MSPOptionCandidate | null;
  };
  explain: { oneLiner: string; bullets: string[] };
}
