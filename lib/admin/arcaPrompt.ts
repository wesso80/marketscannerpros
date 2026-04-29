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
  "mode": "<one of EXPLAIN_RANK | CHALLENGE_SETUP | FIND_MISSING_EVIDENCE | SUMMARIZE_WATCHLIST | DETECT_CONTRADICTIONS | PREPARE_RESEARCH_ALERT | REVIEW_JOURNAL_MISTAKE | COMPARE_TWO_SYMBOLS | WHAT_CHANGED_SINCE_LAST_SCAN>",
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
    `DATA_TRUTH: status=${ctx.dataTruth.status}, trustScore=${ctx.dataTruth.trustScore}`;

  const compare = ctx.compareTo
    ? `\nCOMPARE_TO: ${ctx.compareTo.symbol} score=${ctx.compareTo.score} axes={${fmtAxes(ctx.compareTo.axes)}}`
    : "";
  const prev = ctx.previous
    ? `\nPREVIOUS_SCAN: capturedAt=${ctx.previous.capturedAt} score=${ctx.previous.score} axes={${fmtAxes(ctx.previous.axes)}}`
    : "";

  const taskByMode: Record<ArcaAdminMode, string> = {
    EXPLAIN_RANK: "Explain why this symbol earns its current score. Cite the dominant axis and any penalties or boosts implied by the axes distribution.",
    CHALLENGE_SETUP: "Argue against the current setup. What would have to be true for this thesis to be wrong? List the most plausible failure modes.",
    FIND_MISSING_EVIDENCE: "Identify which axes are weakest or absent. What additional research evidence would meaningfully strengthen or weaken the verdict?",
    SUMMARIZE_WATCHLIST: "Summarise this symbol as a single line a senior operator could read in 5 seconds, then list 3 supporting bullets.",
    DETECT_CONTRADICTIONS: "Identify contradictions inside the evidence (e.g. high trend axis but weak momentum axis, high score but degraded data truth).",
    PREPARE_RESEARCH_ALERT: "Draft a research-only alert summary. It must carry research framing, never broker instructions. Headline ≤ 90 chars.",
    REVIEW_JOURNAL_MISTAKE: "Treat this as a post-mortem of a past research case. What pattern in the axes likely led to a mistaken verdict? What would you weight differently next time?",
    COMPARE_TWO_SYMBOLS: "Compare this symbol with the COMPARE_TO context. Which has the stronger research thesis right now and why? Be specific about which axes diverge.",
    WHAT_CHANGED_SINCE_LAST_SCAN: "Compare current vs PREVIOUS_SCAN. Identify the largest axis movements and whether they strengthen or weaken the thesis.",
  };

  return `${header}${compare}${prev}\n\nTASK: ${taskByMode[mode]}\n\nRespond with the strict JSON object only.`;
}
