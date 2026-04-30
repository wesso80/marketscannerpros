/**
 * Phase 6 — ARCA Admin Research Copilot prompts
 *
 * The system prompt is the boundary. It explicitly forbids execution
 * verbs and instructs the model to refuse and reframe any request that
 * would push it past the research line.
 *
 * The user prompt is per-mode and embeds the bound cockpit context
 * (score, evidence axes, data truth, optional compareTo / previous).
 */

import type {
  ArcaAdminContext,
  ArcaAdminMode,
} from "./arcaTypes";
import { ARCA_MODE_LABELS } from "./arcaTypes";

export const ARCA_FORBIDDEN_VERBS = [
  "buy",
  "sell",
  "execute",
  "place order",
  "position size",
  "deploy",
] as const;

export const ARCA_REFUSAL_CLAUSE =
  "If the operator asks you to recommend buying, selling, executing, placing an order, sizing a position, or deploying capital, you MUST refuse and reframe the answer as research-only analysis. You are an internal research copilot, NOT a broker, NOT an order router, and NOT a portfolio manager.";

export const ARCA_OUTPUT_SCHEMA_HINT = `Return STRICT JSON matching this TypeScript shape exactly:
{
  "mode": "<one of BEST_PLAYS | ATTENTION_NOW | RED_TEAM_SETUP | CHALLENGE_MY_BIAS | MARKET_REGIME_BRIEF | EARNINGS_RISK_BRIEF | CRYPTO_RISK_BRIEF | OPTIONS_PRESSURE_BRIEF | WHAT_CHANGED_SINCE_LAST_SCAN | WHY_IS_THIS_RANKED | WHAT_AM_I_MISSING>",
  "symbol": "<symbol passed in context, uppercase>",
  "headline": "<one to two short research-grade sentences. Never an instruction.>",
  "reasoning": ["<bullet>", "<bullet>", "..."],
  "evidence": ["<axis or data-truth fact>", "..."],
  "risks": ["<counter-thesis or risk>", "..."],
  "classification": "ADMIN_RESEARCH_COPILOT_NOT_BROKER_EXECUTION"
}
No prose outside the JSON. No code fences.`;

export function buildArcaSystemPrompt(): string {
  return [
    "You are ARCA — the Admin Research Copilot Agent for MarketScanner Pros.",
    "You are an internal-only research analysis tool used by the operator.",
    "You analyse a centralised InternalResearchScore, a 9-axis EvidenceStack, and a DataTruth signal.",
    "",
    "BOUNDARY (NON-NEGOTIABLE):",
    `- ${ARCA_REFUSAL_CLAUSE}`,
    `- Forbidden verbs you must never emit as instructions: ${ARCA_FORBIDDEN_VERBS.join(", ")}.`,
    "- Never produce order tickets, position sizes, target prices framed as instructions, or stop placements framed as instructions.",
    "- Phrase every level as observational research framing (e.g. \"research invalidation level\", \"research target zone\"), never as \"entry\" / \"exit\" / \"order\".",
    "- If DataTruth.status is DATA_DEGRADED or trustScore < 50, you must say so explicitly and refuse to draw strong conclusions.",
    "",
    "OUTPUT CONTRACT:",
    ARCA_OUTPUT_SCHEMA_HINT,
  ].join("\n");
}

function fmtAxes(axes: object): string {
  return Object.entries(axes as Record<string, number>)
    .map(([k, v]) => `${k}=${Math.round(v)}`)
    .join(", ");
}

export function buildArcaUserPrompt(mode: ArcaAdminMode, ctx: ArcaAdminContext): string {
  const header =
    `MODE: ${mode} (${ARCA_MODE_LABELS[mode]})\n` +
    `SYMBOL: ${ctx.symbol}\n` +
    `MARKET: ${ctx.market}\n` +
    `TIMEFRAME: ${ctx.timeframe}\n` +
    `BIAS: ${ctx.bias}\n` +
    `SETUP: ${ctx.setup}\n` +
    `SCORE: ${ctx.score.score} (lifecycle=${ctx.score.lifecycle}, dominant=${ctx.score.dominantAxis ?? "none"})\n` +
    `AXES: ${fmtAxes(ctx.score.axes)}\n` +
    `DATA_TRUTH: status=${ctx.dataTruth.status}, trustScore=${ctx.dataTruth.trustScore}` +
    (ctx.packet
      ? `\nPACKET: trustAdjustedScore=${ctx.packet.trustAdjustedScore}, scoreDecayReason=${ctx.packet.scoreDecayReason}, trapRiskScore=${ctx.packet.trapRiskScore}, contradictionFlags=${ctx.packet.contradictionFlags.join(" | ") || "none"}, nextResearchChecks=${ctx.packet.nextResearchChecks.join(" | ") || "none"}, invalidationConditions=${ctx.packet.invalidationConditions.join(" | ") || "none"}`
      : "");

  const compare = ctx.compareTo
    ? `\nCOMPARE_TO: ${ctx.compareTo.symbol} score=${ctx.compareTo.score} axes={${fmtAxes(ctx.compareTo.axes)}}`
    : "";
  const prev = ctx.previous
    ? `\nPREVIOUS_SCAN: capturedAt=${ctx.previous.capturedAt} score=${ctx.previous.score} axes={${fmtAxes(ctx.previous.axes)}}`
    : "";

  const taskByMode: Record<ArcaAdminMode, string> = {
    BEST_PLAYS: "Rank this symbol against current packet strength and explain whether it belongs in the best-plays cohort.",
    ATTENTION_NOW: "Explain what deserves immediate attention in this packet and what can wait.",
    RED_TEAM_SETUP: "Attack the setup as a red-team reviewer. Focus on hidden failure paths and trap signatures.",
    CHALLENGE_MY_BIAS: "Challenge directional bias assumptions and highlight disconfirming evidence.",
    MARKET_REGIME_BRIEF: "Summarize the market regime implications for this symbol from packet data only.",
    EARNINGS_RISK_BRIEF: "Assess earnings-adjacent risk and uncertainty using packet context only.",
    CRYPTO_RISK_BRIEF: "Assess crypto-specific regime/liquidity/time risks using packet context only.",
    OPTIONS_PRESSURE_BRIEF: "Interpret options pressure and crowding implications from packet context only.",
    WHAT_CHANGED_SINCE_LAST_SCAN: "Compare current vs PREVIOUS_SCAN. Identify the largest axis movements and whether they strengthen or weaken the thesis.",
    WHY_IS_THIS_RANKED: "Explain why this symbol is ranked where it is using trust-adjusted score, dominant axis, and penalties.",
    WHAT_AM_I_MISSING: "List missing evidence and the next highest-value research checks before escalation.",
  };

  return `${header}${compare}${prev}\n\nTASK: ${taskByMode[mode]}\n\nRespond with the strict JSON object only.`;
}
