export type TimePermission = 'ALLOW' | 'WAIT' | 'BLOCK';

export type Direction = 'bullish' | 'bearish' | 'neutral';

export type Regime = 'trend' | 'range' | 'expansion' | 'compression' | 'unknown';

export interface TimeContextInputs {
  symbol: string;
  assetClass: 'crypto' | 'equity' | 'forex';
  primaryTfMinutes: number;
  lookbackBars: number;
  macroBias: Direction;
  htfBias: Direction;
  regime: Regime;
  volState: 'low' | 'normal' | 'high' | 'extreme';
  trendStrength: number;
  breadth?: number;
  liquidityState?: 'normal' | 'thin' | 'dislocated';
  dataIntegrity: {
    provider: string;
    freshnessSec: number;
    coveragePct: number;
    gapsPct: number;
  };
  extremeConditions: Array<
    | 'PRICE_MAGNET'
    | 'VOL_SPIKE'
    | 'NEWS_RISK'
    | 'DISLOCATION'
    | 'LIQUIDITY_THIN'
    | 'HTF_CONFLICT'
  >;
}

export interface DecompositionTFRow {
  tfLabel: string;
  tfMinutes: number;
  closeBias: Direction;
  state: 'forming' | 'confirmed' | 'fading';
  strength: number;
  alignedToPrimary: boolean;
  closeProximityPct?: number;
  /** ISO-8601 UTC timestamp of next bar close (from close schedule) */
  nextCloseAt?: string;
  /** Raw minutes to close */
  minsToClose?: number;
  /** Prior bar 50% level (HL2 of previous candle) */
  mid50Level?: number;
  /** % distance from current price to mid-50 level */
  distanceToMid50?: number;
  /** Pull direction: up = price being pulled toward higher 50%, down = lower */
  pullDirection?: 'up' | 'down' | 'none';
}

export interface TimeSetupInputs {
  primaryDirection: Direction;
  decomposition: DecompositionTFRow[];
  window: {
    status: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
    durationHours?: number;
    timeRemainingMinutes?: number;
    strength: number;
    clusterIntegrity: number;
    directionConsistency: number;
    alignmentCount: number;
    tfCount: number;
  };
  warnings: Array<
    | 'WEAK_HTF_AGREEMENT'
    | 'LOW_CLUSTER_INTEGRITY'
    | 'LOW_ALIGNMENT_COUNT'
    | 'MIXED_DIRECTION'
    | 'WEAK_CLOSE_STRENGTH'
  >;
}

export interface TimeExecutionInputs {
  closeConfirmation: 'CONFIRMED' | 'PENDING' | 'FAILED';
  closeStrength: number;
  entryWindowQuality: number;
  liquidityOK: boolean;
  riskState: 'controlled' | 'elevated' | 'high';
  notes?: string[];
}

export interface TimeConfluenceV2Inputs {
  context: TimeContextInputs;
  setup: TimeSetupInputs;
  execution: TimeExecutionInputs;
}

export interface TimeConfluenceV2Output {
  contextScore: number;
  setupScore: number;
  executionScore: number;
  timeConfluenceScore: number;
  permission: TimePermission;
  gateScore: number;
  direction: Direction;
  reasons: string[];
  debug?: Record<string, unknown>;
}
