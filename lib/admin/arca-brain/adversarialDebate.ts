/**
 * lib/admin/arca-brain/adversarialDebate.ts
 *
 * Internal debate before any simulated entry. Three roles, one verdict.
 *
 *   Trader      — argues FOR the trade. States entry/stop/target & thesis.
 *   Risk        — argues SIZING and PORTFOLIO blocks (drawdown, correlation, event risk).
 *   Prosecutor  — argues AGAINST the trade. Crowding, staleness, invalidation,
 *                 obvious-noise. Returns a 0..100 score (higher = stronger objection).
 *
 *   Verdict     — TAKE / SKIP / SIZE_DOWN / WAIT_FOR_CONFIRMATION.
 *
 * Output is persisted to arca_trade_debates. NO simulated order should
 * be created without a debate row id.
 *
 * Admin-only. Deterministic — uses structured inputs, not an LLM call.
 */

import { q } from "@/lib/db";
import { mapDebateRecord } from "./rowMappers";
import type {
  DataFreshnessStatus,
  DebateDecision,
  DebateRecord,
  InformationEdgeBand,
} from "./types";

export interface DebateCandidate {
  symbol: string;
  assetClass: string;
  side: "LONG" | "SHORT";
  entry: number;
  stop: number;
  takeProfit: number | null;
  playbookId: string | null;
  sourceEdgePacketId: string | null;
  /** ARCA confidence at decision time (0..100). */
  confidence: number;
  /** Opportunity Rank from edge packet (0..100). */
  opportunityRank: number;
  /** Trust-adjusted score (0..100). */
  trustAdjusted: number;
  /** Thesis text from the edge packet. */
  thesis: string;
}

export interface DebateContext {
  workspaceId: string;
  portfolioId: string;
  freshness: DataFreshnessStatus;
  freshnessAgeSeconds?: number | null;
  informationEdgeScore: number | null;
  informationEdgeBand: InformationEdgeBand | null;
  regimeQuality?: number;
  /** Number of mistake-labelled (non-NMSV) trades in the last 7 days. */
  recentMistakeFrequency?: number;
  /** Open correlation exposure 0..100, where 100 = saturated. */
  correlationExposure?: number;
  /** Event risk inside the planned hold window. */
  eventRisk?: "none" | "minor" | "major";
  /** Was this symbol the source of a recent loss inside the same playbook? */
  repeatedLossSamePlaybook?: boolean;
  /** Doctrine rule that contradicts this candidate, if any. */
  doctrineConflictRuleId?: string | null;
  /** Risk officer hard blocks already emitted upstream. */
  preExistingRiskBlocks?: string[];
}

export interface DebateOutcome {
  record: DebateRecord;
  shouldCreateOrder: boolean;
  sizeMultiplier: number;
}

function pickFreshnessFloor(f: DataFreshnessStatus): number {
  if (f === "fresh") return 0;
  if (f === "delayed") return 25;
  if (f === "stale") return 70;
  return 50; // unknown — treat as a moderate objection
}

function buildTraderCase(c: DebateCandidate, ctx: DebateContext): {
  text: string;
  confidence: number;
  evidence: Record<string, unknown>;
} {
  const text = `${c.side} ${c.symbol} @ ${c.entry} stop ${c.stop}${
    c.takeProfit ? ` target ${c.takeProfit}` : ""
  }. Playbook ${c.playbookId ?? "(unset)"}. Thesis: ${c.thesis.trim() || "(no thesis text)"}.`;
  const confidence = Math.round(
    Math.max(0, Math.min(100, 0.6 * c.confidence + 0.25 * c.trustAdjusted + 0.15 * c.opportunityRank)),
  );
  return {
    text,
    confidence,
    evidence: {
      entry: c.entry,
      stop: c.stop,
      takeProfit: c.takeProfit,
      opportunityRank: c.opportunityRank,
      trustAdjusted: c.trustAdjusted,
      arcaConfidence: c.confidence,
      informationEdge: ctx.informationEdgeScore,
    },
  };
}

function buildRiskCase(c: DebateCandidate, ctx: DebateContext): {
  text: string;
  blocks: string[];
  evidence: Record<string, unknown>;
} {
  const blocks: string[] = [...(ctx.preExistingRiskBlocks ?? [])];
  if ((ctx.correlationExposure ?? 0) >= 75) blocks.push("correlation_exposure_saturated");
  if (ctx.eventRisk === "major") blocks.push("major_event_risk_in_window");
  if (ctx.freshness === "stale") blocks.push("data_freshness_stale");
  if ((ctx.recentMistakeFrequency ?? 0) >= 5) blocks.push("elevated_recent_mistake_rate");
  if (ctx.doctrineConflictRuleId) blocks.push(`doctrine_conflict:${ctx.doctrineConflictRuleId}`);
  const rrDist = c.takeProfit
    ? Math.abs(c.takeProfit - c.entry) / Math.max(1e-9, Math.abs(c.entry - c.stop))
    : null;
  const text = blocks.length
    ? `Risk officer flags: ${blocks.join(", ")}. R:R ≈ ${rrDist?.toFixed(2) ?? "n/a"}.`
    : `No hard blocks. R:R ≈ ${rrDist?.toFixed(2) ?? "n/a"}. Correlation exposure ${ctx.correlationExposure ?? 0}/100.`;
  return {
    text,
    blocks,
    evidence: {
      correlationExposure: ctx.correlationExposure ?? null,
      eventRisk: ctx.eventRisk ?? "none",
      freshness: ctx.freshness,
      freshnessAgeSeconds: ctx.freshnessAgeSeconds ?? null,
      recentMistakeFrequency: ctx.recentMistakeFrequency ?? 0,
      rrToTakeProfit: rrDist,
    },
  };
}

function buildProsecutorCase(c: DebateCandidate, ctx: DebateContext): {
  text: string;
  score: number;
  evidence: Record<string, unknown>;
} {
  // Start with a floor based on data freshness.
  let score = pickFreshnessFloor(ctx.freshness);
  const objections: string[] = [];

  if (ctx.informationEdgeBand === "OBVIOUS_NOISE") {
    score += 25;
    objections.push("information_edge=OBVIOUS_NOISE (everyone sees it)");
  } else if (ctx.informationEdgeBand === "MODERATE") {
    score += 10;
    objections.push("information_edge=MODERATE");
  } else if (ctx.informationEdgeBand === "RARE_ASYMMETRIC") {
    score -= 15;
    objections.push("information_edge=RARE_ASYMMETRIC (counter-argument weak)");
  }

  if (ctx.repeatedLossSamePlaybook) {
    score += 15;
    objections.push("recent_loss_same_playbook_same_symbol");
  }
  if (c.opportunityRank < 55) {
    score += 10;
    objections.push("opportunity_rank<55");
  }
  if ((ctx.regimeQuality ?? 50) < 35) {
    score += 10;
    objections.push("regime_quality<35");
  }
  if (ctx.eventRisk === "minor") {
    score += 5;
    objections.push("minor_event_risk_in_window");
  }

  score = Math.max(0, Math.min(100, score));
  const text = objections.length
    ? `Strongest counter-argument: ${objections[0]}. Other objections: ${objections.slice(1).join(", ") || "none"}.`
    : `No material counter-argument found.`;
  return { text, score, evidence: { objections } };
}

function decide(
  trader: { confidence: number },
  risk: { blocks: string[] },
  prosecutor: { score: number },
): { decision: DebateDecision; sizeMultiplier: number; confidence: number; rejection: string | null } {
  // Any hard risk block = SKIP.
  if (risk.blocks.length > 0) {
    return {
      decision: "SKIP",
      sizeMultiplier: 0,
      confidence: Math.max(0, trader.confidence - prosecutor.score * 0.5),
      rejection: `Risk blocked: ${risk.blocks[0]}`,
    };
  }

  // Strong prosecutor argument => SKIP.
  if (prosecutor.score >= 70) {
    return {
      decision: "SKIP",
      sizeMultiplier: 0,
      confidence: Math.max(0, trader.confidence - prosecutor.score * 0.6),
      rejection: `Prosecutor score ${prosecutor.score}: edge too obvious or stale`,
    };
  }

  // Moderate prosecutor => SIZE_DOWN.
  if (prosecutor.score >= 50) {
    const mult = Math.max(0.25, 1 - (prosecutor.score - 50) / 50);
    return {
      decision: "SIZE_DOWN",
      sizeMultiplier: Math.round(mult * 100) / 100,
      confidence: Math.max(0, trader.confidence - prosecutor.score * 0.4),
      rejection: null,
    };
  }

  // Mild prosecutor + low trader confidence => wait for confirmation.
  if (prosecutor.score >= 30 && trader.confidence < 55) {
    return {
      decision: "WAIT_FOR_CONFIRMATION",
      sizeMultiplier: 0,
      confidence: trader.confidence - 10,
      rejection: null,
    };
  }

  return {
    decision: "TAKE",
    sizeMultiplier: 1,
    confidence: Math.min(100, trader.confidence - prosecutor.score * 0.25),
    rejection: null,
  };
}

export async function runDebateAndRecord(
  candidate: DebateCandidate,
  ctx: DebateContext,
): Promise<DebateOutcome> {
  const trader = buildTraderCase(candidate, ctx);
  const risk = buildRiskCase(candidate, ctx);
  const prosecutor = buildProsecutorCase(candidate, ctx);
  const verdict = decide(trader, risk, prosecutor);

  const rows = await q<Record<string, unknown>>(
    `INSERT INTO arca_trade_debates
       (workspace_id, portfolio_id, symbol, asset_class, side,
        source_edge_packet_id, playbook_id,
        trader_case, trader_confidence, trader_evidence_json,
        risk_case, risk_blocks, risk_evidence_json,
        prosecutor_case, prosecutor_score, prosecutor_evidence_json,
        final_decision, confidence_after_debate, rejected_reason,
        approved_size_multiplier, information_edge_score, data_freshness_status)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,
        $11,$12,$13,
        $14,$15,$16,
        $17,$18,$19,
        $20,$21,$22)
     RETURNING *`,
    [
      ctx.workspaceId,
      ctx.portfolioId,
      candidate.symbol,
      candidate.assetClass,
      candidate.side,
      candidate.sourceEdgePacketId,
      candidate.playbookId,
      trader.text,
      trader.confidence,
      trader.evidence,
      risk.text,
      risk.blocks,
      risk.evidence,
      prosecutor.text,
      prosecutor.score,
      prosecutor.evidence,
      verdict.decision,
      Math.round(Math.max(0, Math.min(100, verdict.confidence))),
      verdict.rejection,
      verdict.sizeMultiplier,
      ctx.informationEdgeScore,
      ctx.freshness,
    ],
  );

  const record = mapDebateRecord(rows[0]);
  return {
    record,
    shouldCreateOrder: verdict.decision === "TAKE" || verdict.decision === "SIZE_DOWN",
    sizeMultiplier: verdict.sizeMultiplier,
  };
}

export async function linkDebateToOrder(workspaceId: string, debateId: string, orderId: string): Promise<void> {
  await q(
    `UPDATE arca_trade_debates SET resulting_order_id = $1
     WHERE workspace_id = $2 AND id = $3`,
    [orderId, workspaceId, debateId],
  );
}

export async function listRecentDebates(workspaceId: string, limit = 50): Promise<DebateRecord[]> {
  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM arca_trade_debates
     WHERE workspace_id = $1
     ORDER BY decided_at DESC LIMIT $2`,
    [workspaceId, Math.max(1, Math.min(500, limit))],
  );
  return rows.map(mapDebateRecord);
}
