/**
 * lib/admin/arca-brain/types.ts
 *
 * Shared types for the ARCA Meta-Brain layer.
 * Mirror of migrations/096_arca_meta_brain.sql.
 *
 * Admin-only. Direct buy/sell/long/short/entry/stop/take-profit language
 * is allowed here because every record is SIMULATED.
 */

// ───────── Doctrine Engine ─────────
export type DoctrineStatus =
  | "ACTIVE"
  | "UNDER_REVIEW"
  | "PROMOTED"
  | "DOWNGRADED"
  | "RETIRED"
  | "EXPERIMENTAL";

export type DoctrineConfidence = "low" | "medium" | "high";

export type DoctrineCategory =
  | "ENTRY_TIMING"
  | "EXIT_DISCIPLINE"
  | "REGIME_GUARD"
  | "SIZING"
  | "DATA_QUALITY"
  | "PLAYBOOK_SCOPE"
  | "RISK_LIMITS"
  | "BEHAVIOURAL"
  | "INFORMATION_EDGE"
  | "OTHER";

export interface DoctrineRule {
  id: string;
  workspaceId: string;
  name: string;
  category: DoctrineCategory | string;
  ruleText: string;
  appliesToPlaybooks: string[];
  appliesToAssetClasses: string[];
  status: DoctrineStatus;
  evidence: {
    sampleSize: number;
    winRate: number | null;
    averageR: number | null;
    maxDrawdown: number | null;
    confidence: DoctrineConfidence;
  };
  supportingTradeIds: string[];
  contradictingTradeIds: string[];
  proposedChange: string | null;
  arcaReasoning: string | null;
  bradApprovalRequired: boolean;
  approvedByBrad: boolean;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastReviewedAt: string | null;
}

export type DoctrineReviewType = "DAILY" | "WEEKLY" | "POST_TRADE" | "MANUAL";
export type DoctrineProposedAction =
  | "KEEP"
  | "PROMOTE"
  | "DOWNGRADE"
  | "RETIRE"
  | "MODIFY";

export interface DoctrineReview {
  id: string;
  workspaceId: string;
  ruleId: string;
  reviewType: DoctrineReviewType;
  finding: string;
  evidenceJson: Record<string, unknown>;
  proposedAction: DoctrineProposedAction;
  oldRuleText: string | null;
  newRuleText: string | null;
  arcaReasoning: string;
  approved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
}

// ───────── Mistake Taxonomy ─────────
export const MISTAKE_TYPES = [
  "GOOD_TRADE_BAD_OUTCOME",
  "LATE_ENTRY",
  "EARLY_ENTRY",
  "CHASING",
  "LOW_QUALITY_SETUP",
  "BAD_REGIME",
  "BAD_STOP_PLACEMENT",
  "TARGET_TOO_AMBITIOUS",
  "EXIT_TOO_EARLY",
  "HELD_TOO_LONG",
  "IGNORED_BEAR_CASE",
  "STALE_DATA_DECISION",
  "OVERLAPPED_EXPOSURE",
  "NEWS_EVENT_RISK",
  "OPTIONS_FLOW_MISREAD",
  "VOLATILITY_TRAP",
  "LIQUIDITY_SWEEP_FAILED",
  "PLAYBOOK_INVALID",
  "POSITION_TOO_LARGE",
  "BROKE_RULE",
  "NO_MISTAKE_SYSTEM_VALID",
] as const;
export type MistakeType = (typeof MISTAKE_TYPES)[number];
export type MistakeSeverity = "low" | "medium" | "high" | "critical";

export interface MistakeLabel {
  id: string;
  workspaceId: string;
  tradeId: string;
  portfolioId: string;
  mistakeType: MistakeType;
  severity: MistakeSeverity;
  arcaReasoning: string;
  evidenceJson: Record<string, unknown>;
  ruleViolatedId: string | null;
  labeler: string;
  labelerVersion: string;
  manualOverride: boolean;
  manualNote: string | null;
  createdAt: string;
}

// ───────── Adversarial Debate ─────────
export type DebateDecision = "TAKE" | "SKIP" | "SIZE_DOWN" | "WAIT_FOR_CONFIRMATION";
export type DataFreshnessStatus = "fresh" | "delayed" | "stale" | "unknown";

export interface DebateRecord {
  id: string;
  workspaceId: string;
  portfolioId: string;
  symbol: string;
  assetClass: string;
  side: "LONG" | "SHORT";
  sourceEdgePacketId: string | null;
  playbookId: string | null;

  traderCase: string;
  traderConfidence: number;
  traderEvidenceJson: Record<string, unknown>;

  riskCase: string;
  riskBlocks: string[];
  riskEvidenceJson: Record<string, unknown>;

  prosecutorCase: string;
  prosecutorScore: number;
  prosecutorEvidenceJson: Record<string, unknown>;

  finalDecision: DebateDecision;
  confidenceAfterDebate: number;
  rejectedReason: string | null;
  approvedSizeMultiplier: number;
  informationEdgeScore: number | null;
  dataFreshnessStatus: DataFreshnessStatus;

  resultingOrderId: string | null;
  decidedAt: string;
  createdAt: string;
}

// ───────── Capital Allocation ─────────
export type CapitalGrade =
  | "A_GRADE"
  | "B_GRADE"
  | "C_GRADE"
  | "EXPERIMENTAL"
  | "NO_TRADE";

export interface CapitalAllocationDecision {
  id: string;
  workspaceId: string;
  portfolioId: string;
  debateId: string | null;
  symbol: string;
  playbookId: string | null;
  grade: CapitalGrade;
  riskPercent: number;
  maxLossDollars: number;
  inputs: {
    playbookExpectancy: number | null;
    regimeQuality: number | null;
    dataFreshness: string | null;
    confidence: number | null;
    informationEdgeScore: number | null;
    personalFitScore: number | null;
    drawdownState: string | null;
    correlationExposure: number | null;
    eventRisk: string | null;
    recentMistakeFrequency: number;
  };
  allocationReason: string;
  sizeAdjustmentReason: string | null;
  createdAt: string;
}

// ───────── Regime-Playbook Matrix ─────────
export interface RegimePlaybookMatrixRow {
  id: string;
  workspaceId: string;
  regime: string;
  enabledPlaybooks: string[];
  reducedSizePlaybooks: string[];
  disabledPlaybooks: string[];
  preferredAssetClasses: string[];
  avoidedAssetClasses: string[];
  requiredConfirmations: string[];
  notes: string | null;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

// ───────── Information Edge Score ─────────
export type InformationEdgeBand =
  | "OBVIOUS_NOISE"
  | "MODERATE"
  | "STRONG"
  | "RARE_ASYMMETRIC";

export interface InformationEdgeInputs {
  uniqueness: number;
  earliness: number;
  crowdingRisk: number;
  obviousness: number;
  hiddenPressure: number;
  rewardRemaining: number;
  signalRarity: number;
  crossAssetConfirmation: number;
  personalHistoricalEdge: number;
}

export interface InformationEdgeScore extends InformationEdgeInputs {
  id: string;
  workspaceId: string;
  packetId: string;
  symbol: string;
  playbookId: string | null;
  score: number;
  band: InformationEdgeBand;
  reasoning: string;
  weightsVersion: string;
  createdAt: string;
}

// ───────── Regret Map ─────────
export const REGRET_CLASSIFICATIONS = [
  "ARCA_TAKEN_BRAD_SKIPPED",
  "BRAD_TAKEN_ARCA_REJECTED",
  "BOTH_TAKEN",
  "BOTH_SKIPPED_WINNER",
  "BOTH_AVOIDED_LOSER",
  "ARCA_TAKEN_FAILED",
  "BRAD_TAKEN_FAILED",
  "ARCA_REJECTED_CORRECTLY",
  "BRAD_DISCRETION_BEAT_ARCA",
] as const;
export type RegretClassification = (typeof REGRET_CLASSIFICATIONS)[number];

export interface RegretMapEntry {
  id: string;
  workspaceId: string;
  symbol: string;
  observedAt: string;
  classification: RegretClassification;
  arcaTradeId: string | null;
  bradJournalEntryId: string | null;
  sourceEdgePacketId: string | null;
  playbookId: string | null;
  missedR: number | null;
  avoidedRLoss: number | null;
  regretCostDollars: number | null;
  correctAvoidanceValue: number | null;
  arcaReasoning: string;
  evidenceJson: Record<string, unknown>;
  createdAt: string;
}

// ───────── No-Trade Alpha ─────────
export type NoTradeRejectionSource =
  | "DEBATE"
  | "DOCTRINE"
  | "REGIME_MATRIX"
  | "CAP_ALLOC"
  | "DATA_QUALITY"
  | "MANUAL";

export type NoTradeOutcomeClass =
  | "AVOIDED_LOSS"
  | "MISSED_WIN"
  | "CORRECT_REJECTION"
  | "INCORRECT_REJECTION"
  | "UNRESOLVED";

export interface NoTradeAlphaEntry {
  id: string;
  workspaceId: string;
  symbol: string;
  rejectedAt: string;
  rejectionSource: NoTradeRejectionSource;
  debateId: string | null;
  rejectionReason: string;
  hypotheticalEntry: number | null;
  hypotheticalStop: number | null;
  hypotheticalTarget: number | null;
  hypotheticalSizeDollars: number | null;
  outcomeEvaluatedAt: string | null;
  outcomeClass: NoTradeOutcomeClass | null;
  realisedRIfTaken: number | null;
  realisedPnlIfTaken: number | null;
  evaluatorVersion: string;
  createdAt: string;
}

// ───────── Self-Critique ─────────
export type SelfCritiqueKind =
  | "DAILY"
  | "EVENING"
  | "WEEKLY"
  | "POST_MORTEM"
  | "MANUAL";

export interface SelfCritiqueReport {
  id: string;
  workspaceId: string;
  portfolioId: string | null;
  reportKind: SelfCritiqueKind;
  periodStart: string;
  periodEnd: string;
  mostOverconfidentBadCall: Record<string, unknown> | null;
  bestRejectedTrade: Record<string, unknown> | null;
  worstAcceptedTrade: Record<string, unknown> | null;
  mostUsefulDataSource: string | null;
  leastUsefulDataSource: string | null;
  ruleToPromoteId: string | null;
  ruleToDowngradeId: string | null;
  setupToBanNextWeek: string | null;
  setupToIncreaseNextWeek: string | null;
  behaviouralWarning: string | null;
  dataQualityWarning: string | null;
  fullReportJson: Record<string, unknown>;
  engineVersion: string;
  createdAt: string;
}

// ───────── Commander Mode aggregate ─────────
export interface CommanderModeSnapshot {
  generatedAt: string;
  workspaceId: string;
  freshness: {
    overall: DataFreshnessStatus;
    sources: Array<{ name: string; status: DataFreshnessStatus; ageSeconds: number | null }>;
  };
  bestTradeNow: CommanderCandidate | null;
  bestLongNow: CommanderCandidate | null;
  bestShortNow: CommanderCandidate | null;
  strongestNoTradeWarning: { symbol: string; reason: string; severity: MistakeSeverity } | null;
  highestRiskOpenPosition: { symbol: string; openR: number; reason: string } | null;
  biggestChange: { symbol: string; what: string; magnitude: string } | null;
  arcaIsWaitingFor: Array<{ symbol: string; trigger: string }>;
  arcaWillNotTouch: Array<{ symbol: string; reason: string }>;
  doctrineWarningToday: { ruleId: string; ruleName: string; warning: string } | null;
  evidenceQualityScore: number;
  personalExposureFlag: "ok" | "elevated" | "danger";
  confidence: string;
  whatConfirms: string;
  whatInvalidates: string;
  mainRisk: string;
}

export interface CommanderCandidate {
  symbol: string;
  side: "LONG" | "SHORT";
  playbook: string | null;
  entry: number;
  stop: number;
  takeProfit: number | null;
  confidence: number;
  informationEdgeScore: number | null;
  informationEdgeBand: InformationEdgeBand | null;
  debateDecision: DebateDecision;
  debateId: string | null;
  evidenceQualityScore: number;
  personalExposureFlag: "ok" | "elevated" | "danger";
  reasoning: string;
  whatConfirms: string;
  whatInvalidates: string;
  mainRisk: string;
}
