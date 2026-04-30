// ═══════════════════════════════════════════════════════════════════════════
// Directional Volatility Engine (DVE) — Type Definitions
// 5-layer architecture: Volatility State → Directional Bias →
//   Phase Persistence → Signal Triggering → Outcome Projection
// ═══════════════════════════════════════════════════════════════════════════

// ── INPUT TYPES ──────────────────────────────────────────────────────────

export interface DVEPriceInput {
  closes: number[];
  opens?: number[];
  highs?: number[];
  lows?: number[];
  currentPrice: number;
  changePct: number;
  volume?: number;
  avgVolume?: number;
}

export interface DVEIndicatorInput {
  macd?: number | null;
  macdHist?: number | null;
  macdSignal?: number | null;
  adx?: number | null;
  atr?: number | null;
  sma20?: number | null;
  sma50?: number | null;
  bbUpper?: number | null;
  bbMiddle?: number | null;
  bbLower?: number | null;
  stochK?: number | null;
  stochD?: number | null;
  stochMomentum?: number | null;
  stochKSlope?: number | null;
  stochDSlope?: number | null;
  inSqueeze?: boolean;
  squeezeStrength?: number;
}

export interface DVEOptionsInput {
  putCallRatio?: number;
  ivRank?: number;
  dealerGamma?: string;
  maxPain?: number;
  highestOICallStrike?: number | null;
  highestOIPutStrike?: number | null;
  unusualActivity?: string;
  sentiment?: string;
}

export interface DVETimeInput {
  activeTFCount?: number;
  hotZoneActive?: boolean;
  confluenceScore?: number;
}

export interface DVELiquidityInput {
  fundingRatePercent?: number;
  oiTotalUsd?: number;
  fundingSentiment?: string;
}

export interface DVEInput {
  price: DVEPriceInput;
  indicators?: DVEIndicatorInput;
  options?: DVEOptionsInput;
  time?: DVETimeInput;
  liquidity?: DVELiquidityInput;
  mpeComposite?: number;
}

// ── LAYER 1: LINEAR VOLATILITY STATE ─────────────────────────────────────

export type VolRegime =
  | 'compression'
  | 'neutral'
  | 'expansion'
  | 'climax'
  | 'transition';

export type RateDirection =
  | 'accelerating'
  | 'decelerating'
  | 'flat';

export interface VolatilityState {
  bbwp: number;
  bbwpSma5: number;
  regime: VolRegime;
  regimeConfidence: number;
  rateOfChange: number;
  rateSmoothed: number;
  acceleration: number;
  rateDirection: RateDirection;
  inSqueeze: boolean;
  squeezeStrength: number;
  atr?: number;
  extremeAlert?: 'low' | 'high' | null;
}

// ── LAYER 2: DIRECTIONAL BIAS ────────────────────────────────────────────

export type DirectionalBias = 'bullish' | 'bearish' | 'neutral';

export interface DirectionalPressure {
  /** Net directional score in the range -100..+100. Positive = bullish, negative = bearish. */
  score: number;
  bias: DirectionalBias;
  /** Confidence in the bias direction, 0-100. */
  confidence: number;
  /** Individual component scores. Each component is bounded by its own DIRECTION_WEIGHTS max (see engine constants). */
  components: {
    stochasticMomentum: number;
    trendStructure: number;
    optionsFlow: number;
    volumeExpansion: number;
    dealerGamma: number;
    fundingRate: number;
    marketBreadth: number;
  };
  componentDetails: string[];
}

// ── LAYER 3: PHASE PERSISTENCE ───────────────────────────────────────────

export interface ZoneDurationStats {
  currentBars: number;
  averageBars: number;
  medianBars: number;
  maxBars: number;
  agePercentile: number;
  episodeCount: number;
}

export interface PhasePersistence {
  contraction: {
    active: boolean;
    continuationProbability: number;
    exitProbability: number;
    stats: ZoneDurationStats;
  };
  expansion: {
    active: boolean;
    continuationProbability: number;
    exitProbability: number;
    stats: ZoneDurationStats;
  };
}

// ── LAYER 4: SIGNAL TRIGGERING + INVALIDATION ────────────────────────────

export type DVESignalType =
  | 'compression_release_up'
  | 'compression_release_down'
  | 'expansion_continuation_up'
  | 'expansion_continuation_down'
  | 'none';

export type DVESignalState =
  | 'idle'
  | 'armed'
  | 'fired'
  | 'invalidated';

export interface DVESignal {
  type: DVESignalType;
  state: DVESignalState;
  active: boolean;
  strength: number;
  triggerBarPrice?: number;
  triggerBarOpen?: number;
  triggerBarHigh?: number;
  triggerBarLow?: number;
  triggerReason: string[];
}

export interface DVEInvalidation {
  priceInvalidation?: number;
  phaseInvalidation?: number;
  smoothedPhaseInvalidation?: number;
  invalidated: boolean;
  invalidationMode: 'extreme' | 'open';
  ruleSet: string[];
}

// ── LAYER 5: OUTCOME PROJECTION ─────────────────────────────────────────

export interface SignalProjection {
  signalType: DVESignalType;
  expectedMovePct: number;
  medianMovePct: number;
  maxHistoricalMovePct: number;
  averageBarsToMove: number;
  hitRate: number;
  sampleSize: number;
  dispersionPct: number;
  projectionQuality: 'unavailable' | 'low' | 'medium' | 'high';
  projectionQualityScore: number;
  projectionWarning: string;
}

// ── SUPPORTING ───────────────────────────────────────────────────────────

export interface BreakoutReadiness {
  score: number;
  label: string;
  components: {
    volCompression: number;
    timeAlignment: number;
    gammaWall: number;
    adxRising: number;
  };
  componentDetails: string[];
}

export interface VolatilityTrap {
  detected: boolean;
  candidate: boolean;
  score: number;
  components: string[];
  compressionLevel: number;
  gammaLockDetected: boolean;
  timeClusterApproaching: boolean;
}

export interface ExhaustionRisk {
  /** 0-100 risk score. Label thresholds are the canonical consumer contract. */
  level: number;
  label: string;
  signals: string[];
}

export interface StateTransition {
  from: VolRegime;
  to: VolRegime;
  probability: number;
  trigger: string;
}

// ── COMPOSITE OUTPUT ─────────────────────────────────────────────────────

export interface DVEReading {
  symbol: string;
  timestamp: number;
  volatility: VolatilityState;
  direction: DirectionalPressure;
  directionalVolatility: {
    magnitude: number;
    bias: 'up' | 'down' | 'unknown';
    confidence: number;
  };
  phasePersistence: PhasePersistence;
  signal: DVESignal;
  invalidation: DVEInvalidation;
  projection: SignalProjection;
  breakout: BreakoutReadiness;
  trap: VolatilityTrap;
  exhaustion: ExhaustionRisk;
  transition: StateTransition;
  dataQuality: DVEDataQuality;
  flags: DVEFlag[];
  label: string;
  summary: string;
}

export interface DVEDataQuality {
  score: number;
  missing: string[];
  warnings: string[];
}

export type DVEFlag =
  | 'BREAKOUT_WATCH'
  | 'EXPANSION_UP'
  | 'EXPANSION_DOWN'
  | 'TRAP_CANDIDATE'
  | 'TRAP_DETECTED'
  | 'CLIMAX_WARNING'
  | 'COMPRESSION_EXTREME'
  | 'CONTRACTION_EXIT_RISK'
  | 'EXPANSION_EXIT_RISK'
  | 'SIGNAL_UP'
  | 'SIGNAL_DOWN';
