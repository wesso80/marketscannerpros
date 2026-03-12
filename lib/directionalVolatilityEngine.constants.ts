// ═══════════════════════════════════════════════════════════════════════════
// Directional Volatility Engine (DVE) — Constants
// All magic numbers centralized and named. Values match ABT VHM v2/v3 Pine.
// ═══════════════════════════════════════════════════════════════════════════

export const BBWP = {
  BB_LENGTH: 13,
  LOOKBACK: 252,
  SMA_PERIOD: 5,
  STD_MULTIPLIER: 2,
} as const;

export const VOL_REGIME = {
  COMPRESSION_THRESHOLD: 15,
  NEUTRAL_UPPER: 70,
  EXPANSION_THRESHOLD: 70,
  CLIMAX_THRESHOLD: 90,
  EXTREME_LOW: 2,
  EXTREME_HIGH: 98,
} as const;

export const VHM = {
  SMOOTH_PERIOD: 5,
} as const;

export const STOCHASTIC = {
  K_PERIOD: 14,
  D_PERIOD: 3,
  SMOOTH: 3,
  BIAS_THRESHOLD: 15,
  MIDLINE: 50,
  RECENT_BARS: 10,
} as const;

export const DIRECTION_WEIGHTS = {
  stochasticMomentum: { max: 15, components: {
    kd_spread: 4,
    k_slope: 3,
    d_slope: 3,
    midline_bonus: 5,
  }},
  trendStructure: { max: 20, components: { smaAlignment: 10, adx: 10 } },
  optionsFlow: { max: 20, components: { putCall: 8, unusual: 7, ivRank: 5 } },
  volumeExpansion: { max: 10 },
  dealerGamma: { max: 15 },
  fundingRate: { max: 10 },
  marketBreadth: { max: 10 },
} as const;

export const BREAKOUT_WEIGHTS = {
  volCompression: 40,
  timeAlignment: 30,
  gammaWall: 20,
  adxRising: 10,
} as const;

export const TRAP = {
  CANDIDATE_SCORE: 60,
  MIN_SCORE: 70,
  COMPRESSION_WEIGHT: 40,
  GAMMA_LOCK_WEIGHT: 30,
  TIME_CLUSTER_WEIGHT: 30,
  GAMMA_PROXIMITY_PCT: 1.5,
} as const;

export const EXHAUSTION = {
  BBWP_TRIGGER: 85,
  STOCH_EXTREME_BULL: 80,
  STOCH_EXTREME_BEAR: 20,
  ADX_DECLINING_THRESHOLD: 35,
  BBWP_DECEL_THRESHOLD: -0.5,
} as const;

export const SIGNAL_STRENGTH = {
  BBWP_CROSS_WEIGHT: 30,
  SMA5_CONFIRM_WEIGHT: 20,
  STOCH_ALIGN_WEIGHT: 25,
  DIRECTION_ALIGN_WEIGHT: 25,
} as const;

export const PROJECTION = {
  FORWARD_BARS: 20,
  MIN_SAMPLE_SIZE: 5,
} as const;

export const MIN_DATA = {
  CLOSES_FOR_BBWP: 14,
  CLOSES_FOR_PERCENTILE: 50,
  CLOSES_FOR_DWELL: 100,
} as const;

export const INVALIDATION = {
  MODE: 'extreme' as const,
} as const;
