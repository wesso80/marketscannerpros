/**
 * MSP Operator Engine — Core Type Definitions
 * Private adaptive trading operating system.
 * @internal — NEVER import into user-facing components.
 */

/* ────────────────────────── Enums ────────────────────────── */

export type Market = 'EQUITIES' | 'CRYPTO' | 'OPTIONS' | 'FUTURES' | 'FOREX';

export type Session =
  | 'RTH' | 'EXTENDED' | 'FULL' | 'ASIA' | 'LONDON' | 'NEW_YORK' | 'UNKNOWN';

export type Direction = 'LONG' | 'SHORT';

export type Permission = 'ALLOW' | 'ALLOW_REDUCED' | 'WAIT' | 'BLOCK';

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';

export type TimeInForce = 'DAY' | 'GTC' | 'IOC' | 'FOK';

export type OrderIntent = 'ENTER' | 'REDUCE' | 'EXIT' | 'CANCEL' | 'REPLACE';

export type Regime =
  | 'TREND_EXPANSION'
  | 'TREND_CONTINUATION'
  | 'TREND_EXHAUSTION'
  | 'ROTATIONAL_RANGE'
  | 'COMPRESSION_COIL'
  | 'FAILED_BREAKOUT_TRAP'
  | 'EVENT_SHOCK'
  | 'POST_NEWS_PRICE_DISCOVERY'
  | 'ILLIQUID_DRIFT'
  | 'PANIC_CORRELATION_CASCADE';

export type Playbook =
  | 'BREAKOUT_CONTINUATION'
  | 'PULLBACK_CONTINUATION'
  | 'FAILED_BREAKOUT_REVERSAL'
  | 'RANGE_MEAN_REVERSION'
  | 'POST_EVENT_RECLAIM'
  | 'SQUEEZE_EXPANSION'
  | 'LIQUIDITY_SWEEP_REVERSAL';

export type CandidateState =
  | 'DISCOVERED' | 'CANDIDATE' | 'VALIDATED' | 'READY'
  | 'ORDER_PENDING' | 'PARTIALLY_FILLED' | 'ACTIVE'
  | 'REDUCING' | 'EXITED' | 'INVALIDATED' | 'BLOCKED';

export type OutcomeClass =
  | 'RIGHT_IDEA_WRONG_TIMING'
  | 'RIGHT_TIMING_BAD_STRUCTURE'
  | 'VALID_SETUP_LOW_PARTICIPATION'
  | 'GOOD_SETUP_EVENT_INTERFERENCE'
  | 'BAD_EXECUTION'
  | 'EARLY_ENTRY'
  | 'LATE_ENTRY'
  | 'REGIME_MISMATCH'
  | 'PLAYBOOK_DRIFT'
  | 'CLEAN_EXECUTION';

export type KeyLevelCategory =
  | 'PDH' | 'PDL' | 'ONH' | 'ONL' | 'VWAP'
  | 'WEEKLY_HIGH' | 'WEEKLY_LOW' | 'MONTHLY_HIGH' | 'MONTHLY_LOW'
  | 'MIDPOINT' | 'SUPPLY' | 'DEMAND' | 'GAMMA_WALL'
  | 'LIQUIDITY_POOL' | 'CUSTOM';

/* ────────────────────────── Shared Schemas ────────────────────────── */

export interface Bar {
  symbol: string;
  market: Market;
  timeframe: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  session?: Session;
}

export interface KeyLevel {
  name: string;
  price: number;
  category: KeyLevelCategory;
  strength?: number;
}

export interface FeatureVector {
  symbol: string;
  market: Market;
  timeframe: string;
  timestamp: string;
  schemaVersion?: string;
  engineVersion?: string;
  features: {
    trendScore: number;
    emaAlignmentScore: number;
    atrPercentile: number;
    bbwpPercentile: number;
    volExpansionScore: number;
    momentumScore: number;
    extensionScore: number;
    structureScore: number;
    timeConfluenceScore: number;
    liquidityScore: number;
    relativeVolumeScore: number;
    eventRiskScore: number;
    crossMarketScore: number;
    trendDirection?: Direction | 'NEUTRAL';
    momentumDirection?: Direction | 'NEUTRAL';
    breakoutDirection?: Direction | 'NEUTRAL';
    levelReclaimDirection?: Direction | 'NEUTRAL';
    sweepDirection?: Direction | 'NEUTRAL';
    cryptoSessionScore?: number | null;
    microstructureProxyScore?: number | null;
    relativeStrengthScore?: number | null;
    fundingPressureProxy?: number | null;
    optionsFlowScore?: number | null;
    symbolTrustScore?: number | null;
    playbookHealthScore?: number | null;
  };
}

export interface SecondaryRegime {
  name: string;
  probability: number;
}

export interface RegimeDecision {
  symbol: string;
  market: Market;
  timeframe: string;
  timestamp: string;
  regime: Regime;
  confidence: number;
  transitionRisk: number;
  secondaryRegimes: SecondaryRegime[];
  allowedPlaybooks: Playbook[];
  blockedPlaybooks: Playbook[];
}

export interface EntryZone {
  min: number;
  max: number;
}

export interface TradeCandidate {
  candidateId: string;
  symbol: string;
  market: Market;
  timeframe: string;
  timestamp: string;
  playbook: Playbook;
  direction: Direction;
  entryZone: EntryZone;
  triggerPrice?: number | null;
  invalidationPrice: number;
  targets: number[];
  candidateState: CandidateState;
  notes?: string[];
}

export interface EvidenceScores {
  regimeFit: number;
  structureQuality: number;
  timeConfluence: number;
  volatilityAlignment: number;
  participationFlow: number;
  crossMarketConfirmation: number;
  eventSafety: number;
  extensionSafety: number;
  symbolTrust: number;
  modelHealth: number;
}

export interface Modifier {
  code: string;
  value: number;
}

export interface Verdict {
  verdictId: string;
  candidateId: string;
  symbol: string;
  market: Market;
  timeframe: string;
  timestamp: string;
  playbook: Playbook;
  regime: Regime;
  direction: Direction;
  confidenceScore: number;
  qualityScore: number;
  permission: Permission;
  sizeMultiplier: number;
  riskUnit: number;
  entryPlan?: {
    entryZone: EntryZone;
    triggerPrice?: number | null;
    invalidationPrice: number;
    targets: number[];
  };
  evidence: EvidenceScores;
  boosts: Modifier[];
  penalties: Modifier[];
  reasonCodes: string[];
}

export interface GovernanceDecision {
  governanceDecisionId: string;
  verdictId: string;
  timestamp: string;
  finalPermission: Permission;
  sizeMultiplier: number;
  blockReasons: string[];
  throttleReasons: string[];
  lockouts: string[];
}

export interface TargetOrder {
  price: number;
  quantityPct: number;
}

export interface ExecutionPlan {
  executionPlanId: string;
  verdictId: string;
  symbol: string;
  direction: Direction;
  orderIntent: OrderIntent;
  quantity: number;
  /** §13.5 idempotency */
  idempotencyKey: string;
  orderIntentHash: string;
  environmentMode: EnvironmentMode;
  entryOrder: {
    type: OrderType;
    price?: number | null;
    stopPrice?: number | null;
    timeInForce: TimeInForce;
  };
  stopOrder: {
    type: 'STOP' | 'STOP_LIMIT';
    price?: number | null;
    stopPrice: number;
  };
  targetOrders: TargetOrder[];
}

export interface TradeReview {
  positionId: string;
  timestamp: string;
  outcomeClass: OutcomeClass;
  rootCause: string;
  entryEfficiency: number;
  exitEfficiency: number;
  mae: number;
  mfe: number;
  reviewNotes?: string[];
}

/* ────────────────────────── API Envelope ────────────────────────── */

export interface ApiEnvelope<T = unknown> {
  ok: boolean;
  requestId: string;
  timestamp: string;
  service: string;
  version: string;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/* ────────────────────────── Service Request/Response Types ───────── */

export interface MarketDataSnapshotRequest {
  symbol: string;
  market: Market;
  timeframe: string;
}

export interface CrossMarketState {
  dxyState: string;
  vixState: string;
  breadthState: string;
}

export interface EventWindow {
  isActive: boolean;
  severity: string | null;
  nextEventAt: string | null;
}

export interface MarketDataSnapshot {
  latestBar: Bar | null;
  keyLevels: KeyLevel[];
  eventWindow: EventWindow;
  crossMarket: CrossMarketState;
}

export interface FeatureComputeRequest {
  symbol: string;
  market: Market;
  timeframe: string;
  bars: Bar[];
  keyLevels: KeyLevel[];
  optionsSnapshot?: unknown | null;
  crossMarketSnapshot: CrossMarketState;
  eventSnapshot: EventWindow;
}

export interface RegimeClassifyRequest {
  symbol: string;
  market: Market;
  timeframe: string;
  featureVector: FeatureVector;
}

export interface DoctrineEvaluation {
  hardBlocks: string[];
  requiredConfirmations: string[];
  boosts: Modifier[];
  penalties: Modifier[];
  doctrineNotes: string[];
}

export interface DoctrineEvalRequest {
  symbol: string;
  market: Market;
  timeframe: string;
  regimeDecision: RegimeDecision;
  featureVector: FeatureVector;
  candidateContext: {
    playbook: Playbook;
    direction: Direction;
    entryZone: EntryZone;
    invalidationPrice: number;
  };
}

export interface PlaybookDetectRequest {
  symbol: string;
  market: Market;
  timeframe: string;
  featureVector: FeatureVector;
  regimeDecision: RegimeDecision;
  keyLevels: KeyLevel[];
  /** OHLCV bars for ATR-based entry zone computation */
  bars?: Bar[];
}

export interface HealthContext {
  symbolTrustScore: number;
  playbookHealthScore: number;
  modelHealthScore: number;
}

export interface ScoringRequest {
  candidate: TradeCandidate;
  featureVector: FeatureVector;
  regimeDecision: RegimeDecision;
  doctrineEvaluation: DoctrineEvaluation;
  healthContext: HealthContext;
}

export interface PortfolioState {
  equity: number;
  dailyPnl: number;
  drawdownPct: number;
  openRisk: number;
  correlationRisk: number;
  activePositions: number;
  killSwitchActive: boolean;
}

export interface RiskPolicy {
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  maxOpenRiskPct: number;
  maxCorrelationRisk: number;
}

export interface ExecutionEnvironment {
  brokerConnected: boolean;
  estimatedSlippageBps: number;
  minLiquidityOk: boolean;
}

export interface GovernanceCheckRequest {
  verdict: Verdict;
  portfolioState: PortfolioState;
  riskPolicy: RiskPolicy;
  executionEnvironment: ExecutionEnvironment;
}

export interface AccountState {
  buyingPower: number;
  accountRiskUnit: number;
}

export interface InstrumentMeta {
  lotSize: number;
  tickSize: number;
  supportsBrackets: boolean;
}

export interface ExecutionPlanRequest {
  verdict: Verdict;
  governanceDecision: GovernanceDecision;
  accountState: AccountState;
  instrumentMeta: InstrumentMeta;
}

export interface ManagePositionRequest {
  positionId: string;
  marketState: {
    currentPrice: number;
    thesisIntegrityScore: number;
    regimeTransitionRisk: number;
  };
  managementPolicy: {
    moveStopToBreakEvenAtR: number;
    scaleOutLevelsR: number[];
  };
}

export interface ReviewRequest {
  position: {
    positionId: string;
    symbol: string;
    entryPrice: number;
    exitPrice: number;
    realizedPnl: number;
  };
  verdict: Verdict;
  governanceDecision: GovernanceDecision;
  lifecycleEvents: unknown[];
  marketReplayContext: {
    bars: Bar[];
    regimeTimeline: RegimeDecision[];
  };
}

export interface LearningWindowRequest {
  scope: {
    type: string;
    playbook?: Playbook;
    regime?: Regime;
  };
  window: {
    start: string;
    end: string;
    minSampleSize: number;
  };
}

export interface ProposedAdjustment {
  type: string;
  target: string;
  currentValue: number;
  proposedValue: number;
  delta: number;
  reason: string;
}

export interface LearningWindowResult {
  sampleSize: number;
  metrics: {
    winRate: number;
    expectancyR: number;
    avgMaeR: number;
    avgMfeR: number;
    edgeScore: number;
    driftScore: number;
  };
  proposedAdjustments: ProposedAdjustment[];
}

export interface ApplyAdjustmentsRequest {
  adjustments: ProposedAdjustment[];
  approvedBy: string;
  mode: 'AUTO_BOUNDED' | 'MANUAL_APPROVED';
}

/* ────────────────────────── Radar / Dashboard ────────────────────── */

export interface RadarOpportunity {
  symbol: string;
  playbook: Playbook;
  regime: Regime;
  direction: Direction;
  confidenceScore: number;
  permission: Permission;
  sizeMultiplier: number;
  reasonCodes: string[];
  /** §13.3 symbol trust composite */
  symbolTrust: number;
}

export interface PlaybookPermission {
  name: Playbook;
  status: Permission;
}

export interface PermissionMatrix {
  symbol: string;
  timeframe: string;
  regime: Regime;
  playbooks: PlaybookPermission[];
}

/* ────────────────────────── Environment Modes §13.6 ─────────────── */

export type EnvironmentMode = 'RESEARCH' | 'PAPER' | 'LIVE_ASSISTED' | 'LIVE_AUTO';

/* ────────────────────────── Engine Versions §13.2 ───────────────── */

export interface EngineVersions {
  featureEngineVersion: string;
  regimeEngineVersion: string;
  playbookEngineVersion: string;
  doctrineVersion: string;
  scoringProfileVersion: string;
  governancePolicyVersion: string;
  orchestratorVersion: string;
  symbolTrustVersion: string;
  metaHealthVersion: string;
}

/* ────────────────────────── Decision Snapshot §13.1 ─────────────── */

export interface DecisionSnapshot {
  snapshotId: string;
  requestId: string;
  symbol: string;
  timestamp: string;
  engineVersions: EngineVersions;
  environmentMode: EnvironmentMode;
  /** Raw inputs */
  inputs: {
    bars: Bar[];
    keyLevels: KeyLevel[];
    crossMarket: CrossMarketState;
    eventWindow: EventWindow;
  };
  /** Stage outputs */
  featureVector: FeatureVector;
  regimeDecision: RegimeDecision;
  candidates: TradeCandidate[];
  doctrineEvaluations: DoctrineEvaluation[];
  verdicts: Verdict[];
  governanceDecisions: GovernanceDecision[];
  executionPlans: (ExecutionPlan | null)[];
  /** Metadata */
  durationMs: number;
}

/* ────────────────────────── Symbol Trust §13.3 ──────────────────── */

export interface SymbolTrustProfile {
  symbol: string;
  market: Market;
  lastUpdated: string;
  sampleSize: number;
  /** 0–1 scores (higher = more trustworthy) */
  falseBreakRate: number;
  slippageQuality: number;
  followThroughRate: number;
  spreadStability: number;
  sessionReliability: number;
  eventSensitivity: number;
  /** Composite trust score 0–1 */
  compositeTrust: number;
}

/* ────────────────────────── Thesis Integrity §13.4 ──────────────── */

export interface ThesisIntegrityState {
  candidateId: string;
  symbol: string;
  timestamp: string;
  /** Individual dimension scores 0–1 */
  structureValid: number;
  volatilitySupportive: number;
  timingEdgeAlive: number;
  regimeStable: number;
  crossMarketAligned: number;
  /** Composite integrity score 0–1 */
  thesisIntegrityScore: number;
  /** Recommended action */
  recommendation: 'HOLD' | 'REDUCE' | 'EXIT';
  reasons: string[];
}

/* ────────────────────────── Meta-Health §13.7 ───────────────────── */

export interface MetaHealthState {
  timestamp: string;
  windowSize: number;
  confidenceInflation: number;
  expectancyTrend: number;
  overPermissionRate: number;
  playbookDrift: number;
  slippageDeterioration: number;
  /** Composite health 0–1 (1 = healthy) */
  compositeHealth: number;
  /** Global throttle multiplier 0–1 */
  throttleMultiplier: number;
  alerts: string[];
}

/* ────────────────────────── Idempotency §13.5 ───────────────────── */

export interface IdempotencyRecord {
  idempotencyKey: string;
  orderIntentHash: string;
  executionPlanId: string;
  submittedAt: string;
  status: 'PENDING' | 'SUBMITTED' | 'FILLED' | 'REJECTED' | 'CANCELLED';
}

/* ────────────────────────── Event Bus ────────────────────────── */

export interface OperatorEvent<T = unknown> {
  eventId: string;
  eventType: string;
  timestamp: string;
  traceId: string;
  payload: T;
}
