/**
 * lib/admin/arca-brain/rowMappers.ts
 *
 * Translates Postgres rows (snake_case) to the camelCase types in
 * lib/admin/arca-brain/types.ts.
 *
 * Admin-only.
 */

import type {
  DoctrineRule,
  DoctrineReview,
  MistakeLabel,
  DebateRecord,
  CapitalAllocationDecision,
  RegimePlaybookMatrixRow,
  InformationEdgeScore,
  RegretMapEntry,
  NoTradeAlphaEntry,
  SelfCritiqueReport,
} from "./types";

function iso(value: unknown): string {
  if (!value) return new Date(0).toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
function isoOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
function num(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function numOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function strOrNull(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}
function strArr(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  return [];
}
function jsonObj(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function mapDoctrineRule(r: Record<string, unknown>): DoctrineRule {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    name: String(r.name),
    category: String(r.category),
    ruleText: String(r.rule_text),
    appliesToPlaybooks: strArr(r.applies_to_playbooks),
    appliesToAssetClasses: strArr(r.applies_to_asset_classes),
    status: String(r.status) as DoctrineRule["status"],
    evidence: {
      sampleSize: num(r.evidence_sample_size),
      winRate: numOrNull(r.evidence_win_rate),
      averageR: numOrNull(r.evidence_average_r),
      maxDrawdown: numOrNull(r.evidence_max_drawdown),
      confidence: String(r.evidence_confidence) as DoctrineRule["evidence"]["confidence"],
    },
    supportingTradeIds: strArr(r.supporting_trade_ids),
    contradictingTradeIds: strArr(r.contradicting_trade_ids),
    proposedChange: strOrNull(r.proposed_change),
    arcaReasoning: strOrNull(r.arca_reasoning),
    bradApprovalRequired: Boolean(r.brad_approval_required),
    approvedByBrad: Boolean(r.approved_by_brad),
    approvedAt: isoOrNull(r.approved_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    lastReviewedAt: isoOrNull(r.last_reviewed_at),
  };
}

export function mapDoctrineReview(r: Record<string, unknown>): DoctrineReview {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    ruleId: String(r.rule_id),
    reviewType: String(r.review_type) as DoctrineReview["reviewType"],
    finding: String(r.finding),
    evidenceJson: jsonObj(r.evidence_json),
    proposedAction: String(r.proposed_action) as DoctrineReview["proposedAction"],
    oldRuleText: strOrNull(r.old_rule_text),
    newRuleText: strOrNull(r.new_rule_text),
    arcaReasoning: String(r.arca_reasoning),
    approved: Boolean(r.approved),
    approvedBy: strOrNull(r.approved_by),
    approvedAt: isoOrNull(r.approved_at),
    rejectedReason: strOrNull(r.rejected_reason),
    createdAt: iso(r.created_at),
  };
}

export function mapMistakeLabel(r: Record<string, unknown>): MistakeLabel {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    tradeId: String(r.trade_id),
    portfolioId: String(r.portfolio_id),
    mistakeType: String(r.mistake_type) as MistakeLabel["mistakeType"],
    severity: String(r.severity) as MistakeLabel["severity"],
    arcaReasoning: String(r.arca_reasoning),
    evidenceJson: jsonObj(r.evidence_json),
    ruleViolatedId: strOrNull(r.rule_violated_id),
    labeler: String(r.labeler),
    labelerVersion: String(r.labeler_version),
    manualOverride: Boolean(r.manual_override),
    manualNote: strOrNull(r.manual_note),
    createdAt: iso(r.created_at),
  };
}

export function mapDebateRecord(r: Record<string, unknown>): DebateRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    portfolioId: String(r.portfolio_id),
    symbol: String(r.symbol),
    assetClass: String(r.asset_class),
    side: String(r.side) as DebateRecord["side"],
    sourceEdgePacketId: strOrNull(r.source_edge_packet_id),
    playbookId: strOrNull(r.playbook_id),
    traderCase: String(r.trader_case),
    traderConfidence: num(r.trader_confidence),
    traderEvidenceJson: jsonObj(r.trader_evidence_json),
    riskCase: String(r.risk_case),
    riskBlocks: strArr(r.risk_blocks),
    riskEvidenceJson: jsonObj(r.risk_evidence_json),
    prosecutorCase: String(r.prosecutor_case),
    prosecutorScore: num(r.prosecutor_score),
    prosecutorEvidenceJson: jsonObj(r.prosecutor_evidence_json),
    finalDecision: String(r.final_decision) as DebateRecord["finalDecision"],
    confidenceAfterDebate: num(r.confidence_after_debate),
    rejectedReason: strOrNull(r.rejected_reason),
    approvedSizeMultiplier: num(r.approved_size_multiplier),
    informationEdgeScore: numOrNull(r.information_edge_score),
    dataFreshnessStatus: String(r.data_freshness_status) as DebateRecord["dataFreshnessStatus"],
    resultingOrderId: strOrNull(r.resulting_order_id),
    decidedAt: iso(r.decided_at),
    createdAt: iso(r.created_at),
  };
}

export function mapCapitalAllocation(r: Record<string, unknown>): CapitalAllocationDecision {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    portfolioId: String(r.portfolio_id),
    debateId: strOrNull(r.debate_id),
    symbol: String(r.symbol),
    playbookId: strOrNull(r.playbook_id),
    grade: String(r.grade) as CapitalAllocationDecision["grade"],
    riskPercent: num(r.risk_percent),
    maxLossDollars: num(r.max_loss_dollars),
    inputs: {
      playbookExpectancy: numOrNull(r.playbook_expectancy),
      regimeQuality: numOrNull(r.regime_quality),
      dataFreshness: strOrNull(r.data_freshness),
      confidence: numOrNull(r.confidence),
      informationEdgeScore: numOrNull(r.information_edge_score),
      personalFitScore: numOrNull(r.personal_fit_score),
      drawdownState: strOrNull(r.drawdown_state),
      correlationExposure: numOrNull(r.correlation_exposure),
      eventRisk: strOrNull(r.event_risk),
      recentMistakeFrequency: num(r.recent_mistake_frequency),
    },
    allocationReason: String(r.allocation_reason),
    sizeAdjustmentReason: strOrNull(r.size_adjustment_reason),
    createdAt: iso(r.created_at),
  };
}

export function mapRegimeMatrix(r: Record<string, unknown>): RegimePlaybookMatrixRow {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    regime: String(r.regime),
    enabledPlaybooks: strArr(r.enabled_playbooks),
    reducedSizePlaybooks: strArr(r.reduced_size_playbooks),
    disabledPlaybooks: strArr(r.disabled_playbooks),
    preferredAssetClasses: strArr(r.preferred_asset_classes),
    avoidedAssetClasses: strArr(r.avoided_asset_classes),
    requiredConfirmations: strArr(r.required_confirmations),
    notes: strOrNull(r.notes),
    updatedBy: String(r.updated_by),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export function mapInfoEdgeScore(r: Record<string, unknown>): InformationEdgeScore {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    packetId: String(r.packet_id),
    symbol: String(r.symbol),
    playbookId: strOrNull(r.playbook_id),
    uniqueness: num(r.uniqueness),
    earliness: num(r.earliness),
    crowdingRisk: num(r.crowding_risk),
    obviousness: num(r.obviousness),
    hiddenPressure: num(r.hidden_pressure),
    rewardRemaining: num(r.reward_remaining),
    signalRarity: num(r.signal_rarity),
    crossAssetConfirmation: num(r.cross_asset_confirmation),
    personalHistoricalEdge: num(r.personal_historical_edge),
    score: num(r.score),
    band: String(r.band) as InformationEdgeScore["band"],
    reasoning: String(r.reasoning),
    weightsVersion: String(r.weights_version),
    createdAt: iso(r.created_at),
  };
}

export function mapRegretEntry(r: Record<string, unknown>): RegretMapEntry {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    symbol: String(r.symbol),
    observedAt: iso(r.observed_at),
    classification: String(r.classification) as RegretMapEntry["classification"],
    arcaTradeId: strOrNull(r.arca_trade_id),
    bradJournalEntryId: strOrNull(r.brad_journal_entry_id),
    sourceEdgePacketId: strOrNull(r.source_edge_packet_id),
    playbookId: strOrNull(r.playbook_id),
    missedR: numOrNull(r.missed_r),
    avoidedRLoss: numOrNull(r.avoided_r_loss),
    regretCostDollars: numOrNull(r.regret_cost_dollars),
    correctAvoidanceValue: numOrNull(r.correct_avoidance_value),
    arcaReasoning: String(r.arca_reasoning),
    evidenceJson: jsonObj(r.evidence_json),
    createdAt: iso(r.created_at),
  };
}

export function mapNoTradeAlpha(r: Record<string, unknown>): NoTradeAlphaEntry {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    symbol: String(r.symbol),
    rejectedAt: iso(r.rejected_at),
    rejectionSource: String(r.rejection_source) as NoTradeAlphaEntry["rejectionSource"],
    debateId: strOrNull(r.debate_id),
    rejectionReason: String(r.rejection_reason),
    hypotheticalEntry: numOrNull(r.hypothetical_entry),
    hypotheticalStop: numOrNull(r.hypothetical_stop),
    hypotheticalTarget: numOrNull(r.hypothetical_target),
    hypotheticalSizeDollars: numOrNull(r.hypothetical_size_dollars),
    outcomeEvaluatedAt: isoOrNull(r.outcome_evaluated_at),
    outcomeClass: r.outcome_class ? (String(r.outcome_class) as NoTradeAlphaEntry["outcomeClass"]) : null,
    realisedRIfTaken: numOrNull(r.realised_r_if_taken),
    realisedPnlIfTaken: numOrNull(r.realised_pnl_if_taken),
    evaluatorVersion: String(r.evaluator_version),
    createdAt: iso(r.created_at),
  };
}

export function mapSelfCritique(r: Record<string, unknown>): SelfCritiqueReport {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    portfolioId: strOrNull(r.portfolio_id),
    reportKind: String(r.report_kind) as SelfCritiqueReport["reportKind"],
    periodStart: iso(r.period_start),
    periodEnd: iso(r.period_end),
    mostOverconfidentBadCall: (r.most_overconfident_bad_call as Record<string, unknown> | null) ?? null,
    bestRejectedTrade: (r.best_rejected_trade as Record<string, unknown> | null) ?? null,
    worstAcceptedTrade: (r.worst_accepted_trade as Record<string, unknown> | null) ?? null,
    mostUsefulDataSource: strOrNull(r.most_useful_data_source),
    leastUsefulDataSource: strOrNull(r.least_useful_data_source),
    ruleToPromoteId: strOrNull(r.rule_to_promote_id),
    ruleToDowngradeId: strOrNull(r.rule_to_downgrade_id),
    setupToBanNextWeek: strOrNull(r.setup_to_ban_next_week),
    setupToIncreaseNextWeek: strOrNull(r.setup_to_increase_next_week),
    behaviouralWarning: strOrNull(r.behavioural_warning),
    dataQualityWarning: strOrNull(r.data_quality_warning),
    fullReportJson: jsonObj(r.full_report_json),
    engineVersion: String(r.engine_version),
    createdAt: iso(r.created_at),
  };
}
