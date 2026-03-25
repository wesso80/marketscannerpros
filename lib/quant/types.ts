/**
 * Quant Intelligence Layer — Core Type Definitions
 *
 * @internal — NEVER import into user-facing components.
 * PRIVATE INTERNAL SYSTEM — not public-facing.
 * All types for the 6-layer fusion pipeline:
 *   Regime → Discovery → Fusion → Permission → Escalation → Memory
 */

// ─── Layer 1: Regime ────────────────────────────────────────────────────────

export type MarketPhase =
  | 'TREND_UP'
  | 'TREND_DOWN'
  | 'RANGE_COMPRESSION'
  | 'RANGE_NEUTRAL'
  | 'VOL_EXPANSION'
  | 'VOL_CLIMAX'
  | 'RISK_OFF';

export type RegimeConfidenceBand = 'HIGH' | 'MODERATE' | 'LOW' | 'CONFLICTING';

export interface UnifiedRegimeState {
  phase: MarketPhase;
  confidence: number; // 0-100
  confidenceBand: RegimeConfidenceBand;
  sources: {
    dve: { regime: string; bbwp: number; confidence: number } | null;
    mri: { regime: string; confidence: number } | null;
    flowState: { state: string; confidence: number } | null;
    capitalFlow: { mode: string; bias: string; conviction: number } | null;
  };
  agreement: number; // 0-4 how many sources agree on direction
  timestamp: string;
}

// ─── Layer 2: Discovery ─────────────────────────────────────────────────────

export interface DiscoveryCandidate {
  symbol: string;
  assetType: 'equity' | 'crypto';
  scanTimestamp: string;
  indicators: {
    rsi?: number;
    macd?: { value: number; signal: number; histogram: number };
    adx?: number;
    atr?: number;
    atrPercent?: number;
    stochK?: number;
    stochD?: number;
    cci?: number;
    ema9?: number;
    ema20?: number;
    ema50?: number;
    ema200?: number;
    sma20?: number;
    sma50?: number;
    sma200?: number;
    plusDI?: number;
    minusDI?: number;
    bbUpper?: number;
    bbMiddle?: number;
    bbLower?: number;
    bbWidthPercent?: number;
    inSqueeze?: boolean;
    squeezeStrength?: number;
    vwap?: number;
    volume?: number;
    avgVolume?: number;
    obv?: number;
    mfi?: number;
    aroonUp?: number;
    aroonDown?: number;
    willr?: number;
    natr?: number;
    ad?: number;
    roc?: number;
    bop?: number;
    price?: number;
    change?: number;
  };
  dve?: {
    bbwp: number;
    regime: string;
    signal: string;
    signalStrength: number;
    directionalBias: string;
    directionalScore: number;
  };
  flowState?: {
    state: string;
    confidence: number;
    bias: string;
  };
  capitalFlow?: {
    mode: string;
    bias: string;
    conviction: number;
    gammaState: string;
  };
  optionsData?: {
    regime: string;
    regimeConfidence: number;
    qualityGate: string;
    pcRatio?: number;
    ivRank?: number;
  };
  institutionalGrade?: {
    grade: string;
    score: number;
    recommendation: string;
  };

  // ─── Enhanced enrichment (V2) ──────────────────────────────────────────
  /** Full 5-layer DVE (when available — BBWP, trap, exhaustion, projection) */
  fullDve?: {
    bbwp: number;
    regime: string;
    regimeConfidence: number;
    signal: string;
    signalStrength: number;
    breakoutReadiness: number;  // 0-100
    trapScore: number;          // 0-100 (higher = more trap risk)
    exhaustionLevel: number;    // 0-100
    exhaustionLabel: string;    // LOW | MODERATE | HIGH | EXTREME
    phasePersistence?: {
      continuationScore: number;
      exitScore: number;
      agePercentile: number;
    };
    projectedMovePct?: number;
    projectedHitRate?: number;
    flags: string[];
  };
  /** Time Confluence snapshot */
  timeConfluence?: {
    confluenceScore: number;     // 0-100
    activeTFCount: number;
    decompressionCount: number;
    hotZoneActive: boolean;
    nowImpact: string;           // low | medium | high | extreme
    minutesToNextMajor: number;
  };
  /** Market Pressure Engine reading */
  pressure?: {
    composite: number;           // 0-100
    direction: string;           // LONG | SHORT | NEUTRAL
    alignment: number;           // 0-1
    label: string;               // HIGH_PRESSURE | BUILDING | LOW_PRESSURE | NO_PRESSURE
    components: {
      time: number;
      volatility: number;
      liquidity: number;
      options: number;
    };
  };
  /** Catalyst proximity (earnings, SEC filings) — equity only */
  catalystProximity?: {
    hasEarnings: boolean;
    daysToEarnings: number | null;
    catalystType?: string;
    severity?: string;
  };
}

// ─── Layer 3: Fusion ────────────────────────────────────────────────────────

export interface FusionDimension {
  name: string;
  raw: number;       // Raw value from source
  normalized: number; // 0-100 normalized
  weight: number;     // Regime-adaptive weight
  weighted: number;   // normalized × weight
  source: string;     // Which engine provided this
}

export interface FusionScore {
  symbol: string;
  composite: number;          // 0-100 final fusion score
  dimensions: FusionDimension[];
  regime: MarketPhase;
  regimeConfidence: number;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  directionConfidence: number;
  asymmetry: number;          // Risk:Reward ratio estimate
  freshness: number;          // Data recency penalty (0-100)
  timestamp: string;
}

// ─── Layer 4: Permission ────────────────────────────────────────────────────

export type PermissionLevel =
  | 'BLOCK'
  | 'MONITOR'
  | 'READY'
  | 'GO'
  | 'PRIORITY_GO';

export interface HardGate {
  name: string;
  passed: boolean;
  reason: string;
}

export interface SoftGate {
  name: string;
  score: number; // 0-100
  threshold: number;
  passed: boolean;
  reason: string;
}

export interface PermissionResult {
  symbol: string;
  level: PermissionLevel;
  hardGates: HardGate[];
  softGates: SoftGate[];
  hardGatesPassed: number;
  hardGatesTotal: number;
  softGateScore: number;
  fusionScore: number;
  overrideReason?: string;
  timestamp: string;
}

// ─── Layer 5: Escalation ────────────────────────────────────────────────────

export type AlertTier =
  | 'WATCHLIST'   // Score 50-64: worth monitoring
  | 'INTERESTING' // Score 65-74: notable confluence
  | 'ACTIONABLE'  // Score 75-84: strong multi-engine agreement
  | 'PRIORITY';   // Score 85+: all systems aligned, rare

export interface InternalAlert {
  id: string;
  symbol: string;
  tier: AlertTier;
  permission: PermissionLevel;
  fusionScore: number;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  regime: MarketPhase;
  topDimensions: Array<{ name: string; score: number }>;
  thesis: string;
  invalidation: string;
  createdAt: string;
  expiresAt: string;
  cooldownUntil?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'INVALIDATED' | 'TRACKED';
}

// ─── Layer 6: Memory / Outcome ──────────────────────────────────────────────

export type OutcomeLabel = 'WIN' | 'LOSS' | 'FLAT' | 'EXPIRED' | 'PENDING';

export interface SignalLifecycle {
  alertId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  fusionScoreAtEntry: number;
  regimeAtEntry: MarketPhase;
  priceAtSignal: number;
  priceAtPeak?: number;
  priceAtTrough?: number;
  priceAtClose?: number;
  outcome: OutcomeLabel;
  rMultiple?: number;
  holdBars?: number;
  mfe?: number; // Maximum Favorable Excursion %
  mae?: number; // Maximum Adverse Excursion %
  dimensionScoresAtEntry: Record<string, number>;
  closedAt?: string;
  notes?: string;
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

export interface PipelineResult {
  regime: UnifiedRegimeState;
  candidates: DiscoveryCandidate[];
  scored: FusionScore[];
  permitted: PermissionResult[];
  alerts: InternalAlert[];
  meta: {
    scanDurationMs: number;
    symbolsScanned: number;
    symbolsPassed: number;
    alertsGenerated: number;
    timeframe: ScanTimeframe;
    timestamp: string;
  };
}

// ─── Operator Config ────────────────────────────────────────────────────────

export type ScanTimeframe = 'daily' | '1h' | '15min';

export interface QuantConfig {
  operatorEmails: string[];
  fusionThreshold: number;      // Minimum fusion score to pass (default 60)
  priorityThreshold: number;    // Minimum for PRIORITY tier (default 85)
  cooldownMinutes: number;      // Per-symbol cooldown (default 240)
  maxAlertsPerScan: number;     // Cap alerts per pipeline run (default 10)
  enabledAssetTypes: ('equity' | 'crypto')[];
  timeframe: ScanTimeframe;     // Bar timeframe: daily (default), 1h, or 15min
  regimeWeightProfiles: Record<MarketPhase, Record<string, number>>;
}

export const DEFAULT_QUANT_CONFIG: QuantConfig = {
  operatorEmails: [],
  fusionThreshold: 60,
  priorityThreshold: 85,
  cooldownMinutes: 240,
  maxAlertsPerScan: 10,
  enabledAssetTypes: ['equity', 'crypto'],
  timeframe: 'daily',
  regimeWeightProfiles: {
    TREND_UP: {
      regime: 0.08, structure: 0.13, volatility: 0.10, timing: 0.10,
      momentum: 0.18, asymmetry: 0.13, participation: 0.08, freshness: 0.08, pressure: 0.12,
    },
    TREND_DOWN: {
      regime: 0.08, structure: 0.13, volatility: 0.10, timing: 0.10,
      momentum: 0.18, asymmetry: 0.13, participation: 0.08, freshness: 0.08, pressure: 0.12,
    },
    RANGE_COMPRESSION: {
      regime: 0.12, structure: 0.08, volatility: 0.22, timing: 0.12,
      momentum: 0.05, asymmetry: 0.08, participation: 0.08, freshness: 0.08, pressure: 0.17,
    },
    RANGE_NEUTRAL: {
      regime: 0.08, structure: 0.12, volatility: 0.10, timing: 0.12,
      momentum: 0.10, asymmetry: 0.13, participation: 0.12, freshness: 0.08, pressure: 0.15,
    },
    VOL_EXPANSION: {
      regime: 0.12, structure: 0.08, volatility: 0.18, timing: 0.10,
      momentum: 0.13, asymmetry: 0.10, participation: 0.08, freshness: 0.08, pressure: 0.13,
    },
    VOL_CLIMAX: {
      regime: 0.18, structure: 0.05, volatility: 0.22, timing: 0.08,
      momentum: 0.05, asymmetry: 0.12, participation: 0.08, freshness: 0.08, pressure: 0.14,
    },
    RISK_OFF: {
      regime: 0.22, structure: 0.05, volatility: 0.18, timing: 0.08,
      momentum: 0.05, asymmetry: 0.12, participation: 0.08, freshness: 0.08, pressure: 0.14,
    },
  },
};
