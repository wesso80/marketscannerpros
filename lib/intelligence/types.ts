// Analytics Command Centre — typed contracts.
// The UI consumes these shapes only; calculation logic lives behind the API
// (currently mocked, later replaced by native engine outputs) so the frontend
// never has to change when real engines are wired in.

export type SemanticState =
  | 'strong-positive'
  | 'positive'
  | 'neutral'
  | 'warning'
  | 'negative'
  | 'critical';

export type EngineKey =
  | 'macro'
  | 'fragility'
  | 'lead-lag'
  | 'nq-pressure'
  | 'auction'
  | 'master';

export type EngineTrend =
  | 'improving'
  | 'stable'
  | 'weakening'
  | 'recovering'
  | 'none';

export type GateState = 'PASS' | 'WAIT' | 'FAIL' | 'BLOCKER' | 'PRE-EDGE';

export type ModuleDir = 'LONG' | 'SHORT' | 'NEUTRAL';

export type EngineStatusFlag = 'LIVE' | 'MOCK' | 'STALE' | 'UNAVAILABLE';

/** A single sub-metric shown when an engine row is expanded. */
export interface EngineComponent {
  label: string;
  value: number | string;
  state: SemanticState;
  detail?: string;
}

/** Standardised result every engine returns. */
export interface EngineResult {
  engine: EngineKey;
  label: string;
  timestamp: string;
  symbol?: string;
  timeframe?: string;
  /** Native engine reading (may be signed, e.g. -100..100). */
  rawValue?: number;
  /** Normalised 0..100 risk-on / long orientation. */
  orientation: number;
  /** Convenience alias of orientation used for status strips. */
  score: number;
  /** Display label, e.g. "Strong Long". */
  state: string;
  semantic: SemanticState;
  confidence?: number;
  trend: EngineTrend;
  gate: GateState;
  weightPct?: number;
  dirSupport?: number;
  moduleDir?: ModuleDir;
  role?: string;
  status: EngineStatusFlag;
  components?: EngineComponent[];
}

/** One rung of the Trigger Ladder — how close a gate is to passing. */
export interface TriggerRung {
  gate: string;
  current: number;
  required: number;
  /** current − required; positive means the gate has cleared. */
  distance: number;
  status: GateState;
  passed: boolean;
}

export interface TriggerLadderResult {
  rungs: TriggerRung[];
  primaryBlocker: string | null;
  nextClosest: string[];
}

export interface DecisionGate {
  label: string;
  state: GateState;
}

/** The Master Command Centre aggregate. */
export interface MasterResult {
  timestamp: string;
  composite: number;
  bias: string;
  biasSemantic: SemanticState;
  edge: number;
  edgeLabel: string;
  agreement: number;
  risk: string;
  riskSemantic: SemanticState;
  conflict: string;
  conflictSemantic: SemanticState;
  playbook: string;
  playbookSemantic: SemanticState;
  context: number;
  execution: number;
  gap: number;
  engines: EngineResult[];
  gates: DecisionGate[];
  ladder: TriggerLadderResult;
}

/** Row in the Intelligence-home engine status strip. */
export interface EngineStatusRow {
  engine: EngineKey;
  label: string;
  href: string;
  score: number;
  state: string;
  semantic: SemanticState;
  trend: EngineTrend;
  timestamp: string;
}

/* ── Liquidity Transmission / Rotation Clock ──────────────────────────────── */

export interface TransmissionStage {
  stage: number;
  name: string;
  driver: string;
  grade: string;
  gradeSemantic: SemanticState;
  confMonth: string;
  live20d: string;
  live5d: string;
  score: number;
  state: string;
  semantic: SemanticState;
  role: string;
  next: string;
}

export interface DriverMonitorItem {
  label: string;
  detail: string;
  score: number;
  semantic: SemanticState;
}

export interface LiquidityResult {
  timestamp: string;
  flowState: string;
  flowSemantic: SemanticState;
  clock: string;
  cycle: string;
  validated: number;
  downstream: number;
  earlyWarning: number;
  earlyWarningState: string;
  earlyWarningSemantic: SemanticState;
  globalM2: string;
  m2_1m: string;
  m2_3mAnn: string;
  m2_yoy: string;
  m2Accel: string;
  m2Coverage: string;
  cryptoWindow: string;
  stages: TransmissionStage[];
  drivers: DriverMonitorItem[];
}

/* ── NQ Auction Engine ────────────────────────────────────────────────────── */

export interface AuctionLevel {
  name: string;
  price: string;
  state: string;
  semantic: SemanticState;
  dist: string;
}

export interface AuctionResult {
  timestamp: string;
  symbol: string;
  session: string;
  transition: string;
  auction: string;
  setup: string;
  setupSemantic: SemanticState;
  setupScore: string;
  activeLevel: string;
  stage: string;
  accept: string;
  rvol: string;
  execState: string;
  execSemantic: SemanticState;
  entry: string;
  stop: string;
  risk: string;
  tp1: string;
  rr1: string;
  tp2: string;
  rr2: string;
  tp3: string;
  rr3: string;
  lastEvent: string;
  lastStage: string;
  emaState: string;
  flow: string;
  atr: string;
  osc: string;
  htf: string;
  liveR: string;
  mfe: string;
  mae: string;
  tradeState: string;
  levels: AuctionLevel[];
}

/* ── NQ Institutional Pressure ────────────────────────────────────────────── */

export interface CrossMarketItem {
  label: string;
  state: string;
  semantic: SemanticState;
}

export interface TimeframeRung {
  label: string;
  value: string;
  semantic: SemanticState;
}

export interface PressureResult {
  timestamp: string;
  symbol: string;
  pressure: string;
  pressureSemantic: SemanticState;
  regime: string;
  regimeSemantic: SemanticState;
  confidence: string;
  confidenceSemantic: SemanticState;
  session: string;
  setup: string;
  playbook: string;
  stack: string;
  momentum: string;
  momentumSemantic: SemanticState;
  sessionP: string;
  crossP: string;
  vwap: string;
  rvol: string;
  dayType: string;
  magnetUp: string;
  magnetDn: string;
  pdhpdl: string;
  orhorl: string;
  onhonl: string;
  pwhpwl: string;
  crossAgree: string;
  stackRungs: TimeframeRung[];
  crossMarkets: CrossMarketItem[];
}

/* ── Cross-Asset Lead/Lag ─────────────────────────────────────────────────── */

export interface LeadLagRow {
  market: string;
  sync: string;
  syncSemantic: SemanticState;
  trueLead: string;
  trueLeadSemantic: SemanticState;
  adv: string;
  rel: string;
  relSemantic: SemanticState;
  edgeStatus: string;
  edgeSemantic: SemanticState;
  moveZ: string;
  predImp: string;
}

export interface LeadLagResult {
  timestamp: string;
  symbol: string;
  predEdge: string;
  confirm: string;
  confirmSemantic: SemanticState;
  session: string;
  leaders: string[];
  noValidLead: boolean;
  rows: LeadLagRow[];
}

/* ── Market Fragility ─────────────────────────────────────────────────────── */

export interface FragilityInternal {
  metric: string;
  value: string;
  state: string;
  semantic: SemanticState;
  risk: string;
  detail: string;
  trend: string;
}

export interface RotationItem {
  sector: string;
  score: number;
  state: string;
  semantic: SemanticState;
  representative: string;
  m20: string;
  relSpy: string;
}

export interface FragilityResult {
  timestamp: string;
  health: string;
  healthSemantic: SemanticState;
  fragility: string;
  transition: string;
  divergence: string;
  rotation: string;
  verdict: string;
  verdictSemantic: SemanticState;
  components: { label: string; value: number; semantic: SemanticState }[];
  warnings: { label: string; state: string; semantic: SemanticState }[];
  path: string;
  playbook: string;
  confidence: string;
  rot1: string;
  rot2: string;
  rot3: string;
  internals: FragilityInternal[];
  radar: RotationItem[];
}
