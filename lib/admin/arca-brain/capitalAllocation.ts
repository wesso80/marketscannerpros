/**
 * lib/admin/arca-brain/capitalAllocation.ts
 *
 * Grades a candidate (A/B/C/EXPERIMENTAL/NO_TRADE) and sets the risk %
 * per trade as a function of the brain's full signal stack.
 *
 * Admin-only.
 */

import { q } from "@/lib/db";
import { mapCapitalAllocation } from "./rowMappers";
import type { CapitalAllocationDecision, CapitalGrade } from "./types";

export interface AllocationInputs {
  workspaceId: string;
  portfolioId: string;
  debateId: string | null;
  symbol: string;
  playbookId: string | null;

  playbookExpectancy: number | null; // R per trade
  regimeQuality: number | null;      // 0..100
  dataFreshness: string | null;      // 'fresh'|'delayed'|'stale'|'unknown'
  confidence: number | null;         // 0..100
  informationEdgeScore: number | null; // 0..100
  personalFitScore: number | null;   // 0..100
  drawdownState: string | null;      // 'normal'|'caution'|'restricted'|'halted'
  correlationExposure: number | null; // 0..100
  eventRisk: string | null;          // 'none'|'minor'|'major'
  recentMistakeFrequency: number;
  /** Max risk % the portfolio allows for an A-grade trade. */
  maxRiskPercent?: number;
  /** Equity for max-loss calc. */
  equityDollars: number;
}

export function gradeCandidate(i: AllocationInputs): {
  grade: CapitalGrade;
  riskPercent: number;
  reason: string;
} {
  const max = Math.min(2, Math.max(0.1, i.maxRiskPercent ?? 1));

  if (i.drawdownState === "halted") {
    return { grade: "NO_TRADE", riskPercent: 0, reason: "drawdown_state=halted" };
  }
  if (i.dataFreshness === "stale") {
    return { grade: "NO_TRADE", riskPercent: 0, reason: "data_stale" };
  }
  if (i.eventRisk === "major") {
    return { grade: "NO_TRADE", riskPercent: 0, reason: "major_event_risk" };
  }
  if (i.recentMistakeFrequency >= 7) {
    return { grade: "C_GRADE", riskPercent: max * 0.25, reason: "high_recent_mistake_rate" };
  }

  const conf = i.confidence ?? 50;
  const edge = i.informationEdgeScore ?? 50;
  const regime = i.regimeQuality ?? 50;
  const fit = i.personalFitScore ?? 50;
  const expect = i.playbookExpectancy ?? 0;

  const composite =
    0.30 * conf +
    0.25 * edge +
    0.20 * regime +
    0.15 * fit +
    Math.max(-10, Math.min(20, expect * 10));

  if (composite >= 80 && edge >= 60 && regime >= 55) {
    return { grade: "A_GRADE", riskPercent: max, reason: "composite>=80, edge>=60, regime>=55" };
  }
  if (composite >= 65) {
    return { grade: "B_GRADE", riskPercent: max * 0.7, reason: `composite=${composite.toFixed(0)}` };
  }
  if (composite >= 50) {
    return { grade: "C_GRADE", riskPercent: max * 0.4, reason: `composite=${composite.toFixed(0)}` };
  }
  if (composite >= 35) {
    return { grade: "EXPERIMENTAL", riskPercent: max * 0.2, reason: `composite=${composite.toFixed(0)}; trial size only` };
  }
  return { grade: "NO_TRADE", riskPercent: 0, reason: `composite=${composite.toFixed(0)} below floor` };
}

export async function recordAllocationDecision(i: AllocationInputs): Promise<CapitalAllocationDecision> {
  const { grade, riskPercent, reason } = gradeCandidate(i);
  const maxLoss = Math.max(0, (riskPercent / 100) * i.equityDollars);

  const rows = await q<Record<string, unknown>>(
    `INSERT INTO arca_capital_allocation_decisions
       (workspace_id, portfolio_id, debate_id, symbol, playbook_id,
        grade, risk_percent, max_loss_dollars,
        playbook_expectancy, regime_quality, data_freshness,
        confidence, information_edge_score, personal_fit_score,
        drawdown_state, correlation_exposure, event_risk,
        recent_mistake_frequency, allocation_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      i.workspaceId,
      i.portfolioId,
      i.debateId,
      i.symbol,
      i.playbookId,
      grade,
      riskPercent,
      maxLoss,
      i.playbookExpectancy,
      i.regimeQuality,
      i.dataFreshness,
      i.confidence,
      i.informationEdgeScore,
      i.personalFitScore,
      i.drawdownState,
      i.correlationExposure,
      i.eventRisk,
      i.recentMistakeFrequency,
      reason,
    ],
  );
  return mapCapitalAllocation(rows[0]);
}
