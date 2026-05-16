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
  "execute order",
  "place order",
  "route order",
  "submit order",
  "connect broker",
  "auto-trade",
  "auto-execute",
] as const;

export const ARCA_REFUSAL_CLAUSE =
  "You may use direct desk language INSIDE this private admin: buy, sell, long, short, entry, stop, take profit, exit, reduce, avoid, best trade. You MUST refuse anything that implies broker execution, order routing, auto-trading, auto-closing, or auto-managing live positions. You are a personal research and decision-support copilot, not a broker and not an order router. Never claim a trade was actually executed.";

export const ARCA_OUTPUT_SCHEMA_HINT = `Return STRICT JSON matching this TypeScript shape exactly:
{
  "mode": "<one of BEST_PLAYS | ATTENTION_NOW | RED_TEAM_SETUP | CHALLENGE_MY_BIAS | MARKET_REGIME_BRIEF | EARNINGS_RISK_BRIEF | CRYPTO_RISK_BRIEF | OPTIONS_PRESSURE_BRIEF | WHAT_CHANGED_SINCE_LAST_SCAN | WHY_IS_THIS_RANKED | WHAT_AM_I_MISSING | DESK_READ>",
  "symbol": "<symbol passed in context, uppercase>",
  "headline": "<one to two short operator-grade sentences. Direct desk language allowed. Never claim execution.>",
  "reasoning": ["<bullet citing a packet field, axis name, or BRAIN_EVIDENCE key>", "..."],
  "evidence": ["<axis or data-truth or brain-evidence fact, verbatim where numeric>", "..."],
  "risks": ["<counter-thesis, invalidation condition, or contradicting evidence>", "..."],
  "groundingCitations": ["<exact field path or key from the context, e.g. score.axes.timing=72 or brainEvidence.historicalEdge.tier=insufficient_sample>", "..."],
  "unsupportedClaimNotice": "<empty string if every claim is grounded; otherwise the literal text 'No stored data supports that.' followed by which claim was dropped>",
  "classification": "ADMIN_DESK_COPILOT_NOT_BROKER_EXECUTION"
}
No prose outside the JSON. No code fences.`;

export function buildArcaSystemPrompt(): string {
  return [
    "You are ARCA — the Admin Desk Copilot for MarketScanner Pros.",
    "You operate inside a PRIVATE single-operator admin. Public users never see your output.",
    "Your job is to give the operator direct, decision-grade reads on real setups: best trade on board, best long, best short, traps, what changed, what is stale, what to ignore, what would invalidate the top idea.",
    "You analyse a centralised InternalResearchScore, a 9-axis EvidenceStack, a DataTruth signal, and (when present) a sanitized BRAIN_EVIDENCE block.",
    "",
    "BOUNDARY (NON-NEGOTIABLE):",
    `- ${ARCA_REFUSAL_CLAUSE}`,
    `- Forbidden execution verbs: ${ARCA_FORBIDDEN_VERBS.join(", ")}.`,
    "- Permitted desk verbs (use them when the data supports them): buy, sell, long, short, entry, stop, take profit, exit, reduce, avoid, best trade, strong setup, position idea, setup invalidated.",
    "- Never claim a trade was actually placed, routed, or filled. You produce ideas, not fills.",
    "- If DataTruth.status is DATA_DEGRADED or trustScore < 50, you must explicitly downgrade your conviction and say so in the headline.",
    "",
    "GROUNDING RULES (HARD):",
    "- Every claim in headline / reasoning / evidence / risks MUST trace to a value present in the SYMBOL+SCORE+AXES+DATA_TRUTH+PACKET+BRAIN_EVIDENCE block above. No outside knowledge. No invented levels. No invented stats.",
    "- Populate groundingCitations[] with the exact field paths or keys you used, in the form path=value (e.g. 'score.axes.options=68', 'packet.contradictionFlags=stale_iv', 'brainEvidence.regimeFit.workedInRegime=0.41').",
    "- If you cannot ground a claim in the provided context, drop the claim and add it to unsupportedClaimNotice with the literal phrase 'No stored data supports that.' followed by what you dropped.",
    "- If the entire context is too thin to give an operator-grade read, set headline to 'No stored data supports a confident read.' and put 'No stored data supports that.' in unsupportedClaimNotice.",
    "",
    "LANGUAGE RULES (MANDATORY when BRAIN_EVIDENCE is provided):",
    "- If sample size is small (n < 30) or classification is 'insufficient'/'thin', SAY SO. Use phrases like 'thin sample', 'insufficient sample', or include the literal n=N.",
    "- If edge tier is 'insufficient_sample' OR no historical edge exists, SAY 'edge is unproven' or 'insufficient sample'.",
    "- If setup historically fails in the current regime (failedInRegime > 0.6), SAY 'historically fails in this regime' or equivalent.",
    "- If evidence/feature buckets are missing, SAY 'missing evidence' or 'feature gap'.",
    "- If freshness label is 'stale', SAY 'stale data' or 'not live'. If 'simulated', SAY 'simulated'. If 'unknown', SAY 'freshness unknown'.",
    "- If edge decay is detected, SAY 'edge decay' or 'recent underperformance'.",
    "- NEVER convert a weak edge into confident language. With weak/unproven edge, the headline MUST NOT contain 'high confidence', 'high conviction', 'definitely', 'certainly', or 'guaranteed'.",
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
  const brain = ctx.brainEvidence ? formatBrainEvidence(ctx.brainEvidence) : "";

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
    DESK_READ:
      "Act as the chief desk officer in a private operator admin. Direct desk language is allowed. Produce a tight desk read covering: best trade on board (with research-supported entry / stop / take-profit zones if the packet has them), best long, best short, biggest trap, what changed since prior scan, what to ignore as noise, what needs confirmation, what would invalidate the top idea, and the setup age (early|active|late|paid|exhausted|invalidated). Use ONLY packet + brain evidence. Cite every numeric or directional claim in groundingCitations. If anything is ungrounded, drop it and note it in unsupportedClaimNotice. Never claim execution.",
  };

  return `${header}${compare}${prev}${brain}\n\nTASK: ${taskByMode[mode]}\n\nRespond with the strict JSON object only.`;
}

/**
 * Phase 7 — render the sanitized Brain Layer evidence packet for ARCA's
 * user prompt. Mirrors the language rules in the system prompt: surfaces
 * sample size, freshness, downgrade reasons, regime fit, decay, traps.
 *
 * Format is deliberately compact, key=value, so the model sees structured
 * facts rather than free-form prose it could rephrase loosely.
 */
function formatBrainEvidence(b: import("./arcaTypes").ArcaAdminContext["brainEvidence"]): string {
  if (!b) return "";
  const parts: string[] = [];
  parts.push("");
  parts.push("BRAIN_EVIDENCE (verbatim — do not paraphrase numerical claims):");
  parts.push(`  asOfTs=${b.asOfTs}  horizon=${b.horizon}`);
  parts.push(`  freshness: label=${b.freshness.label} isLive=${b.freshness.isLive} note="${b.freshness.note}"`);
  parts.push(`  currentFeatures: contributors=[${b.currentFeatures.contributors.join(",") || "none"}]`);
  parts.push(`  currentFeatures.summary: ${b.currentFeatures.summary}`);
  parts.push(`  sampleSize: n=${b.sampleSize.n} classification=${b.sampleSize.classification}`);

  if (b.historicalEdge) {
    const e = b.historicalEdge;
    parts.push(
      `  historicalEdge: tier=${e.edgeTier} confidence=${e.confidenceLabel} ` +
        `n=${e.sampleSize} wins=${e.wins} losses=${e.losses} ` +
        `winRate=${e.winRate == null ? "n/a" : (e.winRate * 100).toFixed(1) + "%"} ` +
        `wilsonLower95=${e.wilsonLower95 == null ? "n/a" : (e.wilsonLower95 * 100).toFixed(1) + "%"} ` +
        `window=[${e.windowStart} → ${e.windowEnd}]`,
    );
  } else {
    parts.push(`  historicalEdge: NONE — no edge row exists for this setup.`);
  }

  parts.push(
    `  regimeFit: regime=${b.regimeFit.currentRegime ?? "unknown"} sample=${b.regimeFit.sampleInRegime} ` +
      `worked=${b.regimeFit.workedInRegime == null ? "n/a" : (b.regimeFit.workedInRegime * 100).toFixed(0) + "%"} ` +
      `failed=${b.regimeFit.failedInRegime == null ? "n/a" : (b.regimeFit.failedInRegime * 100).toFixed(0) + "%"}`,
  );

  parts.push(
    `  missingData: missing=${b.missingData.missingCount} stale=${b.missingData.staleCount} simulated=${b.missingData.simulatedCount} ` +
      `buckets=[${b.missingData.missingBuckets.join(",") || "none"}]`,
  );

  parts.push(
    `  trapHistory: falsePositiveRate=${pct(b.trapHistory.falsePositiveRate)} ` +
      `trapRate=${pct(b.trapHistory.trapRate)} confirmationFailureRate=${pct(b.trapHistory.confirmationFailureRate)}`,
  );

  parts.push(
    `  edgeDecay: detected=${b.edgeDecay.detected} ratio=${b.edgeDecay.recentVsBaselineRatio == null ? "n/a" : b.edgeDecay.recentVsBaselineRatio.toFixed(2)} reason="${b.edgeDecay.reason ?? "none"}"`,
  );

  if (b.similarPastOutcomes.length) {
    parts.push(`  similarPastOutcomes (count=${b.similarPastOutcomes.length}):`);
    for (const o of b.similarPastOutcomes) {
      parts.push(
        `    - ${o.asOfTs} ${o.horizon} → ${o.outcomeClass} mfe=${pct(o.mfePct)} mae=${pct(o.maePct)}`,
      );
    }
  } else {
    parts.push(`  similarPastOutcomes: NONE`);
  }

  if (b.downgradeReasons.length) {
    parts.push(`  downgradeReasons (you MUST surface these):`);
    for (const r of b.downgradeReasons) parts.push(`    - ${r}`);
  } else {
    parts.push(`  downgradeReasons: none`);
  }

  if (b.portfolioContext) {
    parts.push(
      `  portfolioContext (mode=${b.portfolioContext.mode}): ${b.portfolioContext.summary}`,
    );
  }

  return "\n" + parts.join("\n");
}

function pct(v: number | null): string {
  if (v == null) return "n/a";
  // brain rates are already 0..1; mfe/mae are %.
  return Math.abs(v) <= 1 ? (v * 100).toFixed(1) + "%" : v.toFixed(2);
}
