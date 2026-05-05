/**
 * MSP Brain Layer — Phase 2 contracts
 *
 * Four-layer architecture sitting above existing engines:
 *   L1  brain_events        — raw event capture with provenance
 *   L2  brain_features      — frozen feature snapshots (snapshot_hash integrity)
 *   L3  brain_outcomes      — labels resolved AFTER as_of_ts (no look-ahead)
 *   L4  brain_edge_scores   — sample-size aware edge with Wilson CI + shrinkage
 *
 * Hard rules:
 *   1. Workspace isolation — every row carries workspace_id.
 *   2. No look-ahead — outcomes never read data before as_of_ts.
 *   3. No silent fills — missing data increases penalties, never fabricates.
 *   4. Win rate alone never produces high confidence — sample size required.
 *   5. Admin-only events MUST NOT be returned to public surfaces.
 */

// ─── Layer 1 — Events ────────────────────────────────────────────────────────

export type BrainEventType =
  // Scanner / analysis surface
  | 'scanner.result_generated'
  | 'golden_egg.analysis_generated'
  | 'dve.output_generated'
  | 'options.confluence_generated'
  | 'time.confluence_cluster_generated'
  // Alerts
  | 'alert.fired'
  | 'alert.failed'
  // User actions
  | 'user.saved_setup'
  | 'user.journaled_setup'
  // Backtest
  | 'backtest.completed'
  // Setup lifecycle (from outcome labeller / forward tests)
  | 'setup.reached_key_level'
  | 'setup.hit_invalidation'
  | 'setup.expired'
  // ARCA / AI surface
  | 'arca.conditional_verdict'
  | 'arca.downgraded_stale'
  | 'arca.downgraded_simulated'
  // Provider health
  | 'provider.failed'
  | 'provider.degraded';

export type DataFreshness =
  | 'real-time'
  | 'delayed'
  | 'stale'
  | 'simulated'
  | 'unknown';

export type AssetClass = 'equities' | 'crypto' | 'futures' | 'fx' | 'options' | 'unknown';

export interface BrainEventInput {
  workspaceId: string;
  symbol?: string | null;
  assetClass?: AssetClass | null;
  timeframe?: string | null;
  eventType: BrainEventType;
  ts?: Date;
  // provenance
  source: string;
  dataFreshness: DataFreshness;
  inputSnapshotHash?: string;
  scoreSnapshot?: Record<string, unknown>;
  modelVersion?: string;
  promptVersion?: string;
  ruleVersion?: string;
  // visibility
  adminOnly?: boolean;
  publicSafe?: boolean;
  // cross-refs
  signalId?: number | null;
  aiSignalLogId?: number | null;
  journalEntryId?: number | null;
  decisionPacketId?: string | null;
  meta?: Record<string, unknown>;
}

export interface BrainEvent extends Required<Omit<BrainEventInput,
  'symbol' | 'assetClass' | 'timeframe' | 'inputSnapshotHash' | 'promptVersion' |
  'signalId' | 'aiSignalLogId' | 'journalEntryId' | 'decisionPacketId'
>> {
  eventId: string;
  symbol: string | null;
  assetClass: AssetClass | null;
  timeframe: string | null;
  inputSnapshotHash: string | null;
  promptVersion: string | null;
  signalId: number | null;
  aiSignalLogId: number | null;
  journalEntryId: number | null;
  decisionPacketId: string | null;
}

// ─── Layer 2 — Features ──────────────────────────────────────────────────────

export interface MarketStructureFeatures {
  trend_state?: 'up' | 'down' | 'range' | 'transition';
  ema_stack?: 'bull' | 'bear' | 'mixed';
  vwap_relation?: 'above' | 'below' | 'at';
  support_distance_pct?: number;
  resistance_distance_pct?: number;
  range_compression?: number;       // 0..1 — higher = tighter range
  breakout_state?: 'pending' | 'in_progress' | 'failed' | 'confirmed' | 'none';
  failed_breakout_state?: boolean;
  liquidity_sweep_state?: 'high' | 'low' | 'none';
}

export interface VolatilityFeatures {
  atr_percentile?: number;          // 0..100
  bbwp_percentile?: number;         // 0..100
  compression_age_bars?: number;
  expansion_state?: 'pre' | 'in' | 'post' | 'none';
  dve_regime?: string;
  breakout_readiness?: number;      // 0..1
  trap_risk?: number;               // 0..1
  exhaustion_risk?: number;         // 0..1
}

export interface VolumeLiquidityFeatures {
  rel_volume?: number;
  volume_expansion?: boolean;
  volume_divergence?: boolean;
  liquidity_pocket?: 'thin' | 'normal' | 'deep';
  spread_bps?: number | null;
  depth_constrained?: boolean | null;
}

export interface OptionsFeatures {
  iv_rank?: number | null;
  iv_percentile?: number | null;
  oi_concentration?: number | null;
  vol_oi_anomaly?: number | null;
  gamma_wall?: number | null;
  gamma_flip?: number | null;
  max_pain_distance_pct?: number | null;
  unusual_activity_score?: number | null;
  options_data_missing: boolean;     // REQUIRED — never silently filled
}

export interface DerivativesFeatures {
  funding_rate?: number | null;
  oi_change_pct?: number | null;
  liquidation_cluster_strength?: number | null;
  spot_deriv_divergence?: number | null;
  derivatives_data_missing: boolean; // REQUIRED
}

export interface TimeContextFeatures {
  session_phase?: 'pre' | 'open' | 'mid' | 'close' | 'after' | 'overnight';
  candle_close_cluster?: boolean;
  time_confluence_score?: number;
  decompression_window?: boolean;
  midpoint_debt?: number | null;
  daily_close_cluster?: boolean;
  weekly_close_cluster?: boolean;
  monthly_close_cluster?: boolean;
}

export interface MacroContextFeatures {
  risk_state?: 'risk_on' | 'risk_off' | 'mixed';
  vix?: number | null;
  dxy?: number | null;
  rates_context?: string | null;
  earnings_risk?: boolean;
  news_risk?: boolean;
  econ_calendar_risk?: boolean;
}

export interface AiEvidenceFeatures {
  confluence_score?: number;
  evidence_quality_score?: number;
  data_freshness_score?: number;
  missing_data_count: number;
  stale_data_count: number;
  arca_verdict?: 'AUTHORIZED' | 'CONDITIONAL' | 'BLOCKED' | null;
  arca_downgrade_reason?: string | null;
}

export interface BrainFeatureSnapshot {
  featureId: string;
  eventId: string;
  workspaceId: string;
  symbol: string;
  assetClass: AssetClass;
  timeframe: string;
  asOfTs: Date;
  ingestedAt: Date;
  snapshotHash: string;
  featureSchemaVersion: string;
  marketStructure: MarketStructureFeatures;
  volatility: VolatilityFeatures;
  volumeLiquidity: VolumeLiquidityFeatures;
  options: OptionsFeatures;
  derivatives: DerivativesFeatures;
  timeContext: TimeContextFeatures;
  macroContext: MacroContextFeatures;
  aiEvidence: AiEvidenceFeatures;
  missingDataCount: number;
  staleDataCount: number;
  simulatedFieldCount: number;
}

// ─── Layer 3 — Outcomes ──────────────────────────────────────────────────────

export type OutcomeHorizon = '1h' | '4h' | '1d' | '3d' | '1w' | 'custom';

export const HORIZON_SECONDS: Record<OutcomeHorizon, number> = {
  '1h': 3600,
  '4h': 14_400,
  '1d': 86_400,
  '3d': 259_200,
  '1w': 604_800,
  custom: 0,
};

export type OutcomeClass =
  | 'failed_before_confirmation'
  | 'confirmed_then_failed'
  | 'confirmed_followed_through'
  | 'no_resolution'
  | 'insufficient_data';

export interface PriceBar {
  ts: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface OutcomeContext {
  asOfTs: Date;
  entryPrice: number;            // price at as_of_ts (frozen)
  direction: 'long' | 'short';
  invalidationLevel?: number | null;
  keyLevels?: number[];
  reactionZone?: { low: number; high: number } | null;
  rUnit?: number | null;          // dollars/percent per 1R for r-multiple math
  confirmationLevel?: number | null;  // price that "confirms" the setup
}

export interface BrainOutcomeRecord {
  outcomeId: string;
  eventId: string;
  workspaceId: string;
  symbol: string;
  horizon: OutcomeHorizon;
  horizonSeconds: number;
  asOfTs: Date;
  resolvedAtTs: Date;
  dataThroughTs: Date;
  mfePct: number | null;
  maePct: number | null;
  mfeR: number | null;
  maeR: number | null;
  timeToMoveSecs: number | null;
  invalidationTouched: boolean | null;
  keyLevelTouched: boolean | null;
  reactionZoneTouched: boolean | null;
  volExpansionOccurred: boolean | null;
  outcomeClass: OutcomeClass;
  resolutionReason: string | null;
  barsConsumed: number;
  dataSource: string | null;
  dataQuality: 'clean' | 'partial' | 'gap' | 'unknown';
}

// ─── Layer 4 — Edge ──────────────────────────────────────────────────────────

export type EdgeTier =
  | 'insufficient_sample'
  | 'noise'
  | 'weak'
  | 'emerging'
  | 'strong'
  | 'elite';

export type ConfidenceLabel = 'low' | 'medium' | 'high';

export interface EdgeScore {
  edgeId: string;
  workspaceId: string;
  setupKey: string;
  regime: string | null;
  assetClass: AssetClass | null;
  timeframe: string | null;
  horizon: OutcomeHorizon;
  computedAt: Date;
  windowStart: Date;
  windowEnd: Date;
  sampleSize: number;
  wins: number;
  losses: number;
  neutrals: number;
  winRate: number | null;
  avgMfePct: number | null;
  avgMaePct: number | null;
  mfeMaeRatio: number | null;
  expectancyProxy: number | null;
  volAdjExpectancy: number | null;
  regimeAdjExpectancy: number | null;
  wilsonLower95: number | null;
  wilsonUpper95: number | null;
  shrinkageEstimate: number | null;
  sampleSizePenalty: number;
  recencyWeight: number;
  overfittingPenalty: number;
  staleDataPenalty: number;
  missingDataPenalty: number;
  drawdownSensitivity: number | null;
  falsePositiveRate: number | null;
  trapRate: number | null;
  confirmationFailureRate: number | null;
  edgeScore: number;
  edgeTier: EdgeTier;
  confidenceLabel: ConfidenceLabel;
  confidenceReason: string;
  scoringModelVersion: string;
  inputsHash: string;
}

// ─── Versioning ──────────────────────────────────────────────────────────────

export const BRAIN_FEATURE_SCHEMA_VERSION = 'v1';
export const BRAIN_SCORING_MODEL_VERSION = 'edge-v1.0';
export const BRAIN_RULE_VERSION_DEFAULT = 'v1';
