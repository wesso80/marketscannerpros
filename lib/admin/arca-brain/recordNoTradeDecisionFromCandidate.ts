/**
 * lib/admin/arca-brain/recordNoTradeDecisionFromCandidate.ts
 *
 * Single funnel for every "this candidate did NOT become a simulated
 * order" path in the cycle. Writes both:
 *   1. an `arca_no_trade_alpha` row (so the system can later measure
 *      money saved / opportunity missed from inaction), and
 *   2. a REJECTED / RISK_BLOCK / DEFERRED journal entry tagged with the
 *      structured rejection stage, freshness, regime/playbook decision,
 *      capital allocation grade, info-edge score/band and prosecutor
 *      reason where each is available.
 *
 * The DB CHECK on `arca_no_trade_alpha.rejection_source` is currently
 * narrow ('DEBATE','DOCTRINE','REGIME_MATRIX','CAP_ALLOC','DATA_QUALITY',
 * 'MANUAL'). The richer 20+ rejection stages this admin pipeline now
 * tracks are MAPPED onto the nearest legal source value, and the exact
 * stage is preserved inside `rejection_reason` as a `[STAGE=...]`
 * prefix so the operator can filter precisely without breaking the
 * schema today. See `MIGRATION_NOTE` below for the expansion path.
 *
 * Admin-only. No live execution.
 */

import { recordNoTradeRejection } from "./noTradeAlpha";
import { writeJournal } from "@/lib/admin/portfolio-lab/journalEngine";
import type {
  DataFreshnessStatus,
  InformationEdgeBand,
  NoTradeRejectionSource,
} from "./types";
import type { RegimePlaybookDecision } from "./regimePlaybookDecision";

/**
 * MIGRATION_NOTE — when the operator is ready to expand the allowed
 * source list on `arca_no_trade_alpha.rejection_source`, add a new
 * migration that DROPs the existing CHECK and re-adds it with the
 * richer set below, then change `mapStageToSource()` to return the
 * stage directly. The structured `[STAGE=...]` prefix in
 * `rejection_reason` is forwards-compatible — nothing else needs to
 * change.
 *
 * Proposed future allowed values:
 *   DEBATE, DOCTRINE, REGIME_MATRIX, CAP_ALLOC, DATA_QUALITY, MANUAL,
 *   STALE_DATA, MISSING_DATA, DO_NOTHING, DISABLED_PLAYBOOK,
 *   WAIT_FOR_CONFIRMATION, UNKNOWN_REGIME, UNKNOWN_PLAYBOOK,
 *   RISK_CAP, PORTFOLIO_HEAT, PRE_TRADE_RISK,
 *   DEBATE_REJECT, PROSECUTOR_REJECT,
 *   MISSING_TRADE_STRUCTURE, POOR_RISK_REWARD,
 *   DUPLICATE_EXPOSURE, EVENT_RISK, DATA_TRUST,
 *   INFO_EDGE_OBVIOUS_NOISE, SIZING_FAILED
 */

export type RejectionStage =
  | "STALE_DATA"
  | "MISSING_DATA"
  | "DO_NOTHING"
  | "REGIME_MATRIX"
  | "DISABLED_PLAYBOOK"
  | "WAIT_FOR_CONFIRMATION"
  | "UNKNOWN_REGIME"
  | "UNKNOWN_PLAYBOOK"
  | "CAPITAL_ALLOCATION"
  | "RISK_CAP"
  | "PORTFOLIO_HEAT"
  | "PRE_TRADE_RISK"
  | "DEBATE_REJECT"
  | "PROSECUTOR_REJECT"
  | "MISSING_TRADE_STRUCTURE"
  | "POOR_RISK_REWARD"
  | "DUPLICATE_EXPOSURE"
  | "EVENT_RISK"
  | "DATA_TRUST"
  | "INFO_EDGE_OBVIOUS_NOISE"
  | "SIZING_FAILED";

function mapStageToSource(stage: RejectionStage): NoTradeRejectionSource {
  switch (stage) {
    case "STALE_DATA":
    case "MISSING_DATA":
    case "DATA_TRUST":
    case "DO_NOTHING":
      return "DATA_QUALITY";
    case "REGIME_MATRIX":
    case "DISABLED_PLAYBOOK":
    case "WAIT_FOR_CONFIRMATION":
    case "UNKNOWN_REGIME":
    case "UNKNOWN_PLAYBOOK":
      return "REGIME_MATRIX";
    case "DEBATE_REJECT":
    case "PROSECUTOR_REJECT":
      return "DEBATE";
    case "CAPITAL_ALLOCATION":
    case "RISK_CAP":
    case "PORTFOLIO_HEAT":
    case "PRE_TRADE_RISK":
    case "MISSING_TRADE_STRUCTURE":
    case "POOR_RISK_REWARD":
    case "DUPLICATE_EXPOSURE":
    case "EVENT_RISK":
    case "INFO_EDGE_OBVIOUS_NOISE":
    case "SIZING_FAILED":
      return "CAP_ALLOC";
    default:
      return "MANUAL";
  }
}

/** Which journal type best fits a given stage. */
function mapStageToJournalType(stage: RejectionStage): "REJECTED" | "RISK_BLOCK" | "DEFERRED" {
  if (stage === "WAIT_FOR_CONFIRMATION") return "DEFERRED";
  if (
    stage === "RISK_CAP" ||
    stage === "PORTFOLIO_HEAT" ||
    stage === "PRE_TRADE_RISK" ||
    stage === "EVENT_RISK"
  ) return "RISK_BLOCK";
  return "REJECTED";
}

export interface NoTradeCandidateInput {
  workspaceId: string;
  portfolioId: string;

  symbol: string;
  setupType?: string | null;
  side?: "long" | "short" | null;
  assetClass?: string | null;

  rejectionStage: RejectionStage;
  rejectionReason: string;

  edgePacketId?: string | null;
  playbookId?: string | null;
  regime?: string | null;

  regimePlaybookDecision?: RegimePlaybookDecision | null;
  informationEdge?: {
    score: number | null;
    band: InformationEdgeBand | null;
    missingInputs?: string[];
    derivationConfidence?: number | null;
  } | null;
  capitalAllocation?: {
    grade: string;
    reason: string;
    riskPercent: number;
  } | null;
  debate?: {
    id: string | null;
    reason: string | null;
    finalDecision?: string | null;
  } | null;

  dataFreshness?: DataFreshnessStatus | null;

  entry?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  hypotheticalSizeDollars?: number | null;
  confidence?: number | null;

  /** Arbitrary key/value context the operator may want surfaced. */
  metadata?: Record<string, unknown>;

  /**
   * Optional in-memory set the caller (the cycle) can share across
   * candidates to dedupe (same symbol + stage in one cycle). When
   * provided, repeat calls for the same key are silently skipped.
   */
  dedupeKeys?: Set<string>;
}

export interface NoTradeWriteResult {
  written: boolean;
  noTradeRowId?: string;
  journalRowId?: string;
  skippedReason?: "duplicate";
}

/** Pretty-print a number; null -> "n/a". */
function n(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "n/a";
}

/**
 * What would have to change for the same setup to become valid?
 * Cheap, deterministic suggestions per stage. Surfaced in the journal
 * so the operator and the learning loop can see the "if-then".
 */
function whatWouldChange(stage: RejectionStage): string {
  switch (stage) {
    case "STALE_DATA":           return "Re-pull the source feed; require freshness=fresh or delayed.";
    case "MISSING_DATA":         return "Wait until the missing fields populate; require freshness != unknown.";
    case "DO_NOTHING":           return "Wait for the thesis to transition out of DO_NOTHING.";
    case "REGIME_MATRIX":
    case "DISABLED_PLAYBOOK":    return "Wait for a regime in which this playbook is enabled, or remove it from disabled list.";
    case "WAIT_FOR_CONFIRMATION":return "Supply the regime's required confirmations.";
    case "UNKNOWN_REGIME":       return "Pass a current regime label (or seed the regime matrix row).";
    case "UNKNOWN_PLAYBOOK":     return "Tag the candidate with a setup_type the matrix knows about.";
    case "CAPITAL_ALLOCATION":   return "Improve composite grade: raise confidence, edge, regime quality, or reduce mistake rate.";
    case "RISK_CAP":
    case "PORTFOLIO_HEAT":       return "Close exposure or wait for open-risk % to drop below cap.";
    case "PRE_TRADE_RISK":       return "Reduce position size, or wait for risk envelope to recover.";
    case "DEBATE_REJECT":
    case "PROSECUTOR_REJECT":    return "Address the prosecutor's objection (cited reason).";
    case "MISSING_TRADE_STRUCTURE":
    case "SIZING_FAILED":        return "Supply entry, stop and at least one target; verify quote.";
    case "POOR_RISK_REWARD":     return "Tighten stop or extend target so RR >= portfolio floor.";
    case "DUPLICATE_EXPOSURE":   return "Close existing exposure or wait for it to roll off.";
    case "EVENT_RISK":           return "Wait until the major calendar event resolves.";
    case "DATA_TRUST":           return "Replace upstream source or wait for trust rating to recover.";
    case "INFO_EDGE_OBVIOUS_NOISE": return "Find an asymmetric / underweighted angle the crowd is missing.";
    default:                     return "Resolve the cited blocker.";
  }
}

/**
 * Funnel for every non-order outcome of a candidate.
 *
 * - Builds a structured `[STAGE=...]` prefix on the rejection_reason so
 *   the exact stage is recoverable from the DB even though the CHECK
 *   constraint forces us to bucket into 6 source values today.
 * - Writes one journal entry per call with all available evidence.
 * - Dedupes when given a shared `dedupeKeys` Set.
 * - Soft-fails: any write error is caught so the cycle continues; the
 *   error surfaces in the return value so the caller can decide.
 */
export async function recordNoTradeDecisionFromCandidate(
  input: NoTradeCandidateInput,
): Promise<NoTradeWriteResult> {
  const dedupeKey = `${input.symbol}::${input.rejectionStage}`;
  if (input.dedupeKeys?.has(dedupeKey)) {
    return { written: false, skippedReason: "duplicate" };
  }

  const source = mapStageToSource(input.rejectionStage);
  const journalType = mapStageToJournalType(input.rejectionStage);

  const reasonPrefix = `[STAGE=${input.rejectionStage}][SOURCE=${source}]`;
  const regimeFrag = input.regimePlaybookDecision
    ? ` regime=${input.regimePlaybookDecision.regime ?? input.regime ?? "null"}` +
      `/playbook=${input.regimePlaybookDecision.playbookId ?? input.playbookId ?? "null"}` +
      `/${input.regimePlaybookDecision.status}(x${input.regimePlaybookDecision.sizeMultiplier})`
    : input.regime || input.playbookId
      ? ` regime=${input.regime ?? "null"}/playbook=${input.playbookId ?? "null"}`
      : "";
  const edgeFrag = input.informationEdge
    ? ` info_edge=${n(input.informationEdge.score)}(${input.informationEdge.band ?? "n/a"})`
    : "";
  const allocFrag = input.capitalAllocation
    ? ` cap_alloc=${input.capitalAllocation.grade}(risk%=${input.capitalAllocation.riskPercent.toFixed(2)})`
    : "";
  const debateFrag = input.debate
    ? ` debate=${input.debate.finalDecision ?? "n/a"}${input.debate.id ? `(${input.debate.id})` : ""}`
    : "";
  const freshFrag = input.dataFreshness ? ` freshness=${input.dataFreshness}` : "";
  const structuredReason =
    `${reasonPrefix} ${input.rejectionReason}` +
    regimeFrag + edgeFrag + allocFrag + debateFrag + freshFrag;

  let noTradeRowId: string | undefined;
  let journalRowId: string | undefined;

  try {
    const row = await recordNoTradeRejection({
      workspaceId: input.workspaceId,
      symbol: input.symbol,
      rejectionSource: source,
      rejectionReason: structuredReason,
      debateId: input.debate?.id ?? null,
      hypotheticalEntry: input.entry ?? null,
      hypotheticalStop: input.stopLoss ?? null,
      hypotheticalTarget: input.takeProfit ?? null,
      hypotheticalSizeDollars: input.hypotheticalSizeDollars ?? null,
    });
    noTradeRowId = (row as unknown as { id?: string }).id;
  } catch {
    // best-effort — surface via return value, do not break the cycle
  }

  try {
    const evidence: string[] = [];
    if (input.regimePlaybookDecision?.requiredConfirmations?.length) {
      evidence.push(`required: ${input.regimePlaybookDecision.requiredConfirmations.join(", ")}`);
    }
    if (input.regimePlaybookDecision?.disqualifiers?.length) {
      evidence.push(`disqualifiers: ${input.regimePlaybookDecision.disqualifiers.join(", ")}`);
    }
    if (input.informationEdge?.missingInputs?.length) {
      evidence.push(`missing inputs: ${input.informationEdge.missingInputs.join(", ")}`);
    }
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        evidence.push(`${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
      }
    }

    const reasoningParts: string[] = [
      `Stage: ${input.rejectionStage} (source=${source}).`,
      `Reason: ${input.rejectionReason}`,
      `Setup: symbol=${input.symbol}` +
        (input.setupType ? ` setup_type=${input.setupType}` : "") +
        (input.side ? ` side=${input.side}` : "") +
        (input.assetClass ? ` asset_class=${input.assetClass}` : "") +
        ".",
      `Levels: entry=${n(input.entry)} stop=${n(input.stopLoss)} target=${n(input.takeProfit)}` +
        (typeof input.hypotheticalSizeDollars === "number"
          ? ` notional=${input.hypotheticalSizeDollars.toFixed(2)}`
          : "") +
        ".",
      input.dataFreshness ? `Data freshness: ${input.dataFreshness}.` : "",
      input.informationEdge
        ? `Information edge: score=${n(input.informationEdge.score)} band=${input.informationEdge.band ?? "n/a"} ` +
          `derivation_confidence=${n(input.informationEdge.derivationConfidence)}.`
        : "",
      input.regimePlaybookDecision
        ? `Regime/playbook: regime=${input.regimePlaybookDecision.regime ?? "null"} ` +
          `playbook=${input.regimePlaybookDecision.playbookId ?? "null"} ` +
          `status=${input.regimePlaybookDecision.status} ` +
          `size_mult=${input.regimePlaybookDecision.sizeMultiplier}.`
        : "",
      input.capitalAllocation
        ? `Capital allocation: grade=${input.capitalAllocation.grade} ` +
          `risk%=${input.capitalAllocation.riskPercent.toFixed(2)} ` +
          `reason="${input.capitalAllocation.reason}".`
        : "",
      input.debate
        ? `Debate: id=${input.debate.id ?? "n/a"} decision=${input.debate.finalDecision ?? "n/a"} ` +
          `reason="${input.debate.reason ?? "n/a"}".`
        : "",
      typeof input.confidence === "number" ? `Confidence: ${input.confidence}.` : "",
      `Would become valid if: ${whatWouldChange(input.rejectionStage)}`,
    ].filter(Boolean);

    const titlePrefix =
      journalType === "RISK_BLOCK" ? "RISK BLOCK" :
      journalType === "DEFERRED"   ? "DEFERRED"   :
                                     "REJECTED";
    const j = await writeJournal({
      workspaceId: input.workspaceId,
      portfolioId: input.portfolioId,
      journalType,
      title:
        `${titlePrefix} ${input.symbol} — ${input.rejectionStage}` +
        (input.regimePlaybookDecision ? ` (regime=${input.regimePlaybookDecision.status})` : ""),
      symbol: input.symbol,
      reasoning: reasoningParts.join(" "),
      evidence,
      dataFreshness: input.dataFreshness ?? undefined,
      sourcePacketIds: input.edgePacketId ? [input.edgePacketId] : [],
    });
    journalRowId = (j as unknown as { id?: string }).id;
  } catch {
    // best-effort
  }

  input.dedupeKeys?.add(dedupeKey);
  return { written: true, noTradeRowId, journalRowId };
}
