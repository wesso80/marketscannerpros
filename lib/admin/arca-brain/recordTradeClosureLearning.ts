/**
 * lib/admin/arca-brain/recordTradeClosureLearning.ts
 *
 * P1 — Closed-trade learning loop.
 *
 * Every closed simulated trade is funnelled through this helper so the
 * post-mortem path can never be silently dropped. For each call we:
 *
 *   1. derive entry-time context (data freshness, regime, late-entry,
 *      stop-inside-noise, broke-rule, position-too-large) from the
 *      source admin_edge_packets + arca_simulated_orders rows;
 *   2. classify the mistake via `classifyMistake` and persist a
 *      `arca_trade_mistake_labels` row via `recordMistakeLabel`;
 *   3. write a `REVIEW` journal entry summarising the decomposition;
 *   4. for mistake types that touch doctrine, propose a `POST_TRADE`
 *      doctrine review against the matching active rule(s);
 *   5. roll up `arca_playbook_performance` so the new trade is reflected
 *      in the closed-trade stats consumed by the debate / commander.
 *
 * Every persistence call is soft-failed individually so the close path
 * itself never breaks. The aggregated result is returned for telemetry
 * and exposed on `markAndMaybeExit` / `manualSimClose`.
 *
 * Admin-only / simulated-only. No broker execution path.
 */

import { q } from "@/lib/db";
import {
  classifyMistake,
  recordMistakeLabel,
  type ClosedTradeForLabeling,
} from "./mistakeLabeler";
import { writeJournal } from "@/lib/admin/portfolio-lab/journalEngine";
import { rollupPlaybookPerformance } from "@/lib/admin/portfolio-lab/playbookEngine";
import {
  proposeDoctrineReview,
  listDoctrineRules,
} from "./doctrineEngine";
import type {
  ArcaPortfolio,
  ArcaTrade,
  TradeExitReason,
} from "@/lib/admin/portfolio-lab/types";
import type { MistakeType, MistakeSeverity } from "./types";

/** Mistake types that must always raise a POST_TRADE doctrine review. */
const DOCTRINE_TRIGGER_MISTAKES: ReadonlySet<MistakeType> = new Set<MistakeType>([
  "BROKE_RULE",
  "STALE_DATA_DECISION",
  "BAD_REGIME",
  "PLAYBOOK_INVALID",
  "POSITION_TOO_LARGE",
  "LOW_QUALITY_SETUP",
]);

export interface ClosureContextOverrides {
  /** Force-set entry-time flags. Leave undefined to derive from DB. */
  dataStaleAtEntry?: boolean;
  regimeContraindicated?: boolean;
  lateEntry?: boolean;
  stopInsideNoise?: boolean;
  positionTooLarge?: boolean;
  brokeRule?: boolean;
  ruleViolatedId?: string | null;
  /** Free-form note appended to journal/label reasoning. */
  reasoningNote?: string;
}

export interface RecordTradeClosureLearningInput {
  trade: ArcaTrade;
  portfolio: ArcaPortfolio;
  overrides?: ClosureContextOverrides;
  /** Set true for manual closes so labeller can flag EXIT_TOO_EARLY etc. */
  manualClose?: boolean;
}

export interface RecordTradeClosureLearningResult {
  mistakeWritten: boolean;
  mistakeType?: MistakeType;
  severity?: MistakeSeverity;
  labelId?: string;
  journalWritten: boolean;
  journalId?: string;
  doctrineReviewsProposed: number;
  playbookRollupOk: boolean;
  errors: string[];
}

/**
 * Pull the source edge packet row (if any) and convert its freshness +
 * trap_risk_score signals into entry-time flags used by the labeller.
 */
async function deriveEntryContextFromPacket(
  workspaceId: string,
  sourceEdgePacketId: string | null,
): Promise<{
  dataStaleAtEntry: boolean;
  lateEntry: boolean;
  stopInsideNoise: boolean;
  regimeContraindicated: boolean;
}> {
  const empty = {
    dataStaleAtEntry: false,
    lateEntry: false,
    stopInsideNoise: false,
    regimeContraindicated: false,
  };
  if (!sourceEdgePacketId) return empty;
  try {
    const rows = await q<{
      freshness: string | null;
      trap_risk_score: string | null;
      thesis_status: string | null;
      admin_state: string | null;
    }>(
      `SELECT freshness, trap_risk_score, thesis_status, admin_state
         FROM admin_edge_packets
        WHERE workspace_id = $1 AND packet_id = $2
        ORDER BY generated_at DESC
        LIMIT 1`,
      [workspaceId, sourceEdgePacketId],
    );
    const r = rows[0];
    if (!r) return empty;
    const freshness = String(r.freshness ?? "").toLowerCase();
    const trapRisk = r.trap_risk_score == null ? 0 : Number(r.trap_risk_score);
    const thesis = String(r.thesis_status ?? "").toLowerCase();
    const adminState = String(r.admin_state ?? "").toLowerCase();
    return {
      dataStaleAtEntry: freshness === "stale" || freshness === "unknown",
      // Trigger window has expired if the packet's thesis is INVALIDATED /
      // EXPIRED by the time the order filled.
      lateEntry: thesis === "invalidated" || thesis === "expired",
      // High trap risk → stop likely placed inside expected noise.
      stopInsideNoise: trapRisk >= 65,
      // Admin marked the setup as off-regime.
      regimeContraindicated:
        adminState === "off_regime" || adminState === "wrong_regime",
    };
  } catch {
    return empty;
  }
}

/**
 * Detect whether the executing order was created in spite of a prior
 * rejection (operator override) by looking at the source simulated
 * order row's `arca_reason_summary`.
 */
async function deriveBrokeRuleFlag(
  workspaceId: string,
  tradeId: string,
): Promise<boolean> {
  try {
    const rows = await q<{ arca_reason_summary: string | null }>(
      `SELECT o.arca_reason_summary
         FROM arca_simulated_orders o
         JOIN arca_trades t ON t.source_edge_packet_id = o.source_edge_packet_id
        WHERE t.id = $1 AND o.workspace_id = $2
        ORDER BY o.created_at DESC
        LIMIT 1`,
      [tradeId, workspaceId],
    );
    const summary = (rows[0]?.arca_reason_summary ?? "").toLowerCase();
    return summary.includes("override") || summary.includes("broke_rule");
  } catch {
    return false;
  }
}

function holdMinutesFromIso(entryIso: string, exitIso: string): number | null {
  const e = Date.parse(entryIso);
  const x = Date.parse(exitIso);
  if (Number.isNaN(e) || Number.isNaN(x) || x <= e) return null;
  return Math.round((x - e) / 60000);
}

/**
 * Main funnel. Always returns — never throws. The close path treats the
 * result as advisory telemetry; persistence success is reported via
 * `mistakeWritten` / `journalWritten` / `errors`.
 */
export async function recordTradeClosureLearning(
  input: RecordTradeClosureLearningInput,
): Promise<RecordTradeClosureLearningResult> {
  const { trade, portfolio, overrides, manualClose } = input;
  const errors: string[] = [];

  // 1. Build ClosedTradeForLabeling.
  const packetCtx = await deriveEntryContextFromPacket(
    trade.workspaceId,
    trade.sourceEdgePacketId,
  );
  const derivedBrokeRule = await deriveBrokeRuleFlag(
    trade.workspaceId,
    trade.id,
  );

  const closed: ClosedTradeForLabeling = {
    id: trade.id,
    workspaceId: trade.workspaceId,
    portfolioId: trade.portfolioId,
    symbol: trade.symbol,
    side: trade.side,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit1 ?? trade.takeProfit2 ?? trade.takeProfit3,
    rRealised: trade.rMultiple,
    pnlDollars: trade.realisedPnl,
    exitReason: trade.exitReason as TradeExitReason,
    playbookId: trade.playbookId,
    holdMinutes: holdMinutesFromIso(trade.entryTime, trade.exitTime),
    dataStaleAtEntry: overrides?.dataStaleAtEntry ?? packetCtx.dataStaleAtEntry,
    regimeContraindicated:
      overrides?.regimeContraindicated ?? packetCtx.regimeContraindicated,
    lateEntry: overrides?.lateEntry ?? packetCtx.lateEntry,
    stopInsideNoise: overrides?.stopInsideNoise ?? packetCtx.stopInsideNoise,
    positionTooLarge: overrides?.positionTooLarge ?? false,
    brokeRule: overrides?.brokeRule ?? derivedBrokeRule,
    ruleViolatedId: overrides?.ruleViolatedId ?? null,
  };

  // 2. Classify + persist mistake label. The persisted label is the
  // source of truth for downstream gating; we fall back to the local
  // classification only if the DB write failed.
  const localClassification = classifyMistake(closed);
  let labelId: string | undefined;
  let mistakeWritten = false;
  let resolvedMistakeType: MistakeType = localClassification.mistakeType;
  let resolvedSeverity: MistakeSeverity = localClassification.severity;
  let resolvedReasoning: string = localClassification.reasoning;
  try {
    const reasoningPrefix = [
      manualClose ? "manual_close" : "auto_close",
      overrides?.reasoningNote,
    ]
      .filter(Boolean)
      .join(" | ");
    const label = await recordMistakeLabel({
      ...closed,
      arcaReasoningPrefix: reasoningPrefix || undefined,
    });
    labelId = label.id;
    mistakeWritten = true;
    resolvedMistakeType = label.mistakeType;
    resolvedSeverity = label.severity;
    resolvedReasoning = label.arcaReasoning || resolvedReasoning;
  } catch (e) {
    errors.push(`mistake_label_failed: ${(e as Error).message}`);
  }
  const classification = {
    mistakeType: resolvedMistakeType,
    severity: resolvedSeverity,
    reasoning: resolvedReasoning,
  };

  // 3. REVIEW journal entry.
  let journalWritten = false;
  let journalId: string | undefined;
  try {
    const evidence: string[] = [
      `mistake=${classification.mistakeType}`,
      `severity=${classification.severity}`,
      `exit=${closed.exitReason ?? "unknown"}`,
      `r=${closed.rRealised ?? "n/a"}`,
      `pnl=${closed.pnlDollars}`,
      `hold_min=${closed.holdMinutes ?? "n/a"}`,
      closed.dataStaleAtEntry ? "data_stale_at_entry=true" : "",
      closed.regimeContraindicated ? "regime_contraindicated=true" : "",
      closed.lateEntry ? "late_entry=true" : "",
      closed.stopInsideNoise ? "stop_inside_noise=true" : "",
      closed.brokeRule ? "broke_rule=true" : "",
      closed.positionTooLarge ? "position_too_large=true" : "",
      closed.playbookId ? `playbook=${closed.playbookId}` : "",
    ].filter(Boolean);

    const j = await writeJournal({
      workspaceId: trade.workspaceId,
      portfolioId: trade.portfolioId,
      journalType: "REVIEW",
      title:
        `POST-TRADE REVIEW ${trade.symbol} — ${classification.mistakeType} ` +
        `(${classification.severity})`,
      symbol: trade.symbol,
      tradeId: trade.id,
      reasoning:
        `[CLOSE=${trade.exitReason}][MISTAKE=${classification.mistakeType}] ` +
        `${classification.reasoning} ` +
        (overrides?.reasoningNote ? `note="${overrides.reasoningNote}" ` : "") +
        `(label_id=${labelId ?? "unwritten"})`,
      evidence,
      sourcePacketIds: trade.sourceEdgePacketId ? [trade.sourceEdgePacketId] : [],
      lessons:
        classification.mistakeType === "NO_MISTAKE_SYSTEM_VALID"
          ? "System followed; outcome within expected distribution."
          : `Investigate: ${classification.mistakeType}.`,
    });
    journalId = (j as unknown as { id?: string }).id;
    journalWritten = true;
  } catch (e) {
    errors.push(`journal_review_failed: ${(e as Error).message}`);
  }

  // 4. Doctrine review proposals for triggering mistake types.
  let doctrineReviewsProposed = 0;
  if (DOCTRINE_TRIGGER_MISTAKES.has(classification.mistakeType)) {
    try {
      const rules = await listDoctrineRules({
        workspaceId: trade.workspaceId,
        status: "ACTIVE",
      });
      // Prefer the rule referenced by ruleViolatedId; otherwise propose
      // against all ACTIVE rules whose ruleText mentions the mistake key.
      const explicit = overrides?.ruleViolatedId
        ? rules.find((r) => r.id === overrides.ruleViolatedId)
        : undefined;
      const candidates = explicit
        ? [explicit]
        : rules.filter((r) =>
            r.ruleText
              .toLowerCase()
              .includes(mistakeKeyword(classification.mistakeType)),
          );
      for (const rule of candidates) {
        try {
          await proposeDoctrineReview({
            workspaceId: trade.workspaceId,
            ruleId: rule.id,
            reviewType: "POST_TRADE",
            proposedAction:
              classification.severity === "critical" ? "MODIFY" : "KEEP",
            finding:
              `Trade ${trade.symbol} closed with mistake ` +
              `${classification.mistakeType} (${classification.severity}).`,
            arcaReasoning: classification.reasoning,
            evidenceJson: {
              tradeId: trade.id,
              labelId: labelId ?? null,
              mistakeType: classification.mistakeType,
              severity: classification.severity,
              exitReason: trade.exitReason,
              rMultiple: trade.rMultiple,
              realisedPnl: trade.realisedPnl,
              playbookId: trade.playbookId,
              sourceEdgePacketId: trade.sourceEdgePacketId,
              flags: {
                dataStaleAtEntry: closed.dataStaleAtEntry,
                regimeContraindicated: closed.regimeContraindicated,
                lateEntry: closed.lateEntry,
                stopInsideNoise: closed.stopInsideNoise,
                positionTooLarge: closed.positionTooLarge,
                brokeRule: closed.brokeRule,
              },
            },
          });
          doctrineReviewsProposed++;
        } catch (e) {
          errors.push(
            `doctrine_review_failed[${rule.id}]: ${(e as Error).message}`,
          );
        }
      }
    } catch (e) {
      errors.push(`doctrine_rule_lookup_failed: ${(e as Error).message}`);
    }
  }

  // 5. Roll up playbook performance.
  let playbookRollupOk = false;
  try {
    await rollupPlaybookPerformance(portfolio);
    playbookRollupOk = true;
  } catch (e) {
    errors.push(`playbook_rollup_failed: ${(e as Error).message}`);
  }

  return {
    mistakeWritten,
    mistakeType: classification.mistakeType,
    severity: classification.severity,
    labelId,
    journalWritten,
    journalId,
    doctrineReviewsProposed,
    playbookRollupOk,
    errors,
  };
}

/**
 * Map a mistake type to the lowercase keyword most likely to appear in
 * the textual body of a doctrine rule that governs it.
 */
function mistakeKeyword(m: MistakeType): string {
  switch (m) {
    case "BROKE_RULE":
      return "rule";
    case "STALE_DATA_DECISION":
      return "stale";
    case "BAD_REGIME":
      return "regime";
    case "PLAYBOOK_INVALID":
      return "playbook";
    case "POSITION_TOO_LARGE":
      return "size";
    case "LOW_QUALITY_SETUP":
      return "quality";
    default:
      return "rule";
  }
}
