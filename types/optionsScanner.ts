export type EvidenceModuleKey =
  | 'structure'
  | 'optionsFlow'
  | 'greeksIv'
  | 'liquidityTape'
  | 'aiNarrative'
  | 'riskCompliance';

export type PermissionState = 'GO' | 'WAIT' | 'BLOCK';
export type DirectionState = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type RegimeSummary = {
  marketRegime: string;
  volatility: string;
  liquidity: string;
};

export type FeedHealth = {
  integrity: string;
  latencySec: number | null;
  feedStatus: string;
};

export type DeskHeaderModel = {
  symbol: string;
  underlyingPrice: number;
  sessionLabel?: string;
  regime: RegimeSummary;
  feed: FeedHealth;
};

export type DecisionModel = {
  permission: PermissionState;
  direction: DirectionState;
  confidence: number;
  quality: 'High' | 'Med' | 'Low';
  primaryDriver: string;
  primaryBlocker?: string;
  flipTrigger: string;
  catalystWindow?: string;
  validityLabel: string;
};

export type DecisionActions = {
  deployEnabled: boolean;
  alertEnabled: boolean;
  watchlistEnabled: boolean;
  journalEnabled: boolean;
  onDeploy: () => void;
  onAlert: () => void;
  onWatchlist: () => void;
  onJournal: () => void;
};

export type SetupModel = {
  setupType: string;
  timeframeAlignment: string;
  volRegime: string;
  optionsRegime: string;
  invalidation: string;
};

export type ExecutionPlanModel = {
  entry: string;
  stop: string;
  targets: string[];
  rPreview: string;
  riskGovernor: string;
  positionSuggestion: string;
};

export type EvidenceSummaryModel = {
  confirmations: number;
  conflicts: number;
  signals: number;
};

export type StructureEvidenceModel = {
  trendStructure: string;
  keyLevels: string[];
  state: string;
};

export type OptionsFlowEvidenceModel = {
  callPutPressure: string;
  oiChange: string;
  unusualActivity: string;
  volumeBursts: string;
};

export type GreeksIVEvidenceModel = {
  ivRank: string;
  ivPercentile: string;
  skewTerm: string;
  greeksSummary: string;
  gammaRisk: string;
};

export type LiquidityEvidenceModel = {
  magnetLevels: string;
  sweepFlags: string;
  volumeProfile: string;
};

export type AINarrativeEvidenceModel = {
  summaryBullets: string[];
  signalChecklist: string[];
};

export type RiskComplianceEvidenceModel = {
  dataIntegrity: string;
  latency: string;
  whyBlocked: string;
};

export type EvidenceModulesModel = {
  structure: StructureEvidenceModel;
  optionsFlow: OptionsFlowEvidenceModel;
  greeksIv: GreeksIVEvidenceModel;
  liquidityTape: LiquidityEvidenceModel;
  aiNarrative: AINarrativeEvidenceModel;
  riskCompliance: RiskComplianceEvidenceModel;
};

export type OptionsScannerPayload = {
  header: DeskHeaderModel;
  decision: DecisionModel;
  setup: SetupModel;
  plan: ExecutionPlanModel;
  evidenceSummary: EvidenceSummaryModel;
  evidence: EvidenceModulesModel;
};
