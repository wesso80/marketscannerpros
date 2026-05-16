/**
 * lib/admin/arca-brain/mistakeLabeler.ts
 *
 * Post-mortem classifier for closed ARCA trades.
 *
 * Inputs: a closed arca_trade row + optional context (entry packet,
 * regime at entry, doctrine snapshot).
 *
 * Output: a single MistakeLabel persisted to arca_trade_mistake_labels.
 * "NO_MISTAKE_SYSTEM_VALID" is a legitimate outcome — losing trades that
 * followed the system correctly must not be labelled as mistakes.
 *
 * Admin-only. Direct language allowed (entry/stop/target/long/short).
 */

import { q } from "@/lib/db";
import { mapMistakeLabel } from "./rowMappers";
import type {
  MistakeLabel,
  MistakeSeverity,
  MistakeType,
} from "./types";

export interface ClosedTradeForLabeling {
  id: string;
  workspaceId: string;
  portfolioId: string;
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  rRealised: number | null;
  pnlDollars: number;
  exitReason: string | null;
  playbookId: string | null;
  holdMinutes: number | null;
  /** Was the originating data marked stale at decision time? */
  dataStaleAtEntry?: boolean;
  /** Was the regime at entry contraindicated for this playbook? */
  regimeContraindicated?: boolean;
  /** Did entry occur after the trigger window expired? */
  lateEntry?: boolean;
  /** Was the stop placed inside expected noise? */
  stopInsideNoise?: boolean;
  /** Was the position notional > approved max for the grade? */
  positionTooLarge?: boolean;
  /** Did Brad or operator override an ARCA reject? */
  brokeRule?: boolean;
  /** Doctrine rule violated, if any. */
  ruleViolatedId?: string | null;
}

/**
 * Pure deterministic labeller. No LLM — uses the structured signals
 * collected at debate/close time. Returns the single most representative
 * mistake type with severity.
 */
export function classifyMistake(t: ClosedTradeForLabeling): {
  mistakeType: MistakeType;
  severity: MistakeSeverity;
  reasoning: string;
} {
  const winning = (t.rRealised ?? 0) > 0 || t.pnlDollars > 0;
  const reasons: string[] = [];

  // Hard violations first.
  if (t.brokeRule) {
    return {
      mistakeType: "BROKE_RULE",
      severity: "critical",
      reasoning: "Position taken or held against an ACTIVE doctrine rule or risk block.",
    };
  }
  if (t.positionTooLarge) {
    return {
      mistakeType: "POSITION_TOO_LARGE",
      severity: "high",
      reasoning: "Notional exceeded approved max for the assigned grade.",
    };
  }
  if (t.dataStaleAtEntry) {
    return {
      mistakeType: "STALE_DATA_DECISION",
      severity: "high",
      reasoning: "Entry decision made on data flagged as stale at the time.",
    };
  }
  if (t.regimeContraindicated) {
    return {
      mistakeType: "BAD_REGIME",
      severity: winning ? "medium" : "high",
      reasoning: "Playbook ran against the prevailing regime per regime-playbook matrix.",
    };
  }

  // Exit pattern issues.
  if (!winning && t.exitReason === "STOP_HIT" && t.stopInsideNoise) {
    return {
      mistakeType: "BAD_STOP_PLACEMENT",
      severity: "medium",
      reasoning: "Stop placed inside expected noise band; got swept on normal volatility.",
    };
  }
  if (!winning && t.lateEntry) {
    return {
      mistakeType: "LATE_ENTRY",
      severity: "medium",
      reasoning: "Entry filled after the trigger window expired; risk:reward already eroded.",
    };
  }
  if (winning && t.exitReason === "MANUAL_CLOSE" && (t.rRealised ?? 0) < 0.5) {
    return {
      mistakeType: "EXIT_TOO_EARLY",
      severity: "low",
      reasoning: "Manual close before structural target; cut a winner too soon.",
    };
  }
  if (!winning && t.exitReason === "TIME_STOP" && (t.holdMinutes ?? 0) > 60 * 24) {
    return {
      mistakeType: "HELD_TOO_LONG",
      severity: "medium",
      reasoning: "Trade held beyond doctrine time-stop; thesis decayed.",
    };
  }
  if (!winning && t.takeProfit && Math.abs(t.takeProfit - t.entryPrice) / Math.max(1e-9, Math.abs(t.entryPrice - (t.stopLoss ?? t.entryPrice))) > 5) {
    return {
      mistakeType: "TARGET_TOO_AMBITIOUS",
      severity: "medium",
      reasoning: "Take-profit >5R from entry; mean-reversion before target was likely.",
    };
  }

  // Default: losing trade that followed the system is NOT a mistake.
  if (!winning) {
    reasons.push("Loss within expected distribution; risk respected; no rule violated.");
  } else {
    reasons.push("Trade followed system; outcome positive.");
  }
  return {
    mistakeType: "NO_MISTAKE_SYSTEM_VALID",
    severity: "low",
    reasoning: reasons.join(" "),
  };
}

export interface RecordMistakeLabelInput extends ClosedTradeForLabeling {
  arcaReasoningPrefix?: string;
  labelerVersion?: string;
}

export async function recordMistakeLabel(input: RecordMistakeLabelInput): Promise<MistakeLabel> {
  const classification = classifyMistake(input);
  const arcaReasoning = [
    input.arcaReasoningPrefix?.trim(),
    classification.reasoning,
  ]
    .filter(Boolean)
    .join(" — ");

  const rows = await q<Record<string, unknown>>(
    `INSERT INTO arca_trade_mistake_labels
       (workspace_id, trade_id, portfolio_id, mistake_type, severity,
        arca_reasoning, evidence_json, rule_violated_id,
        labeler, labeler_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      input.workspaceId,
      input.id,
      input.portfolioId,
      classification.mistakeType,
      classification.severity,
      arcaReasoning,
      {
        symbol: input.symbol,
        side: input.side,
        entryPrice: input.entryPrice,
        exitPrice: input.exitPrice,
        rRealised: input.rRealised,
        pnlDollars: input.pnlDollars,
        exitReason: input.exitReason,
        playbookId: input.playbookId,
        holdMinutes: input.holdMinutes,
        flags: {
          dataStaleAtEntry: !!input.dataStaleAtEntry,
          regimeContraindicated: !!input.regimeContraindicated,
          lateEntry: !!input.lateEntry,
          stopInsideNoise: !!input.stopInsideNoise,
          positionTooLarge: !!input.positionTooLarge,
          brokeRule: !!input.brokeRule,
        },
      },
      input.ruleViolatedId ?? null,
      "mistake_label_engine_v1",
      input.labelerVersion ?? "v1",
    ],
  );
  return mapMistakeLabel(rows[0]);
}

export interface ListMistakeOptions {
  workspaceId: string;
  mistakeType?: MistakeType;
  sinceDays?: number;
  limit?: number;
}
export async function listMistakeLabels(opts: ListMistakeOptions): Promise<MistakeLabel[]> {
  const params: unknown[] = [opts.workspaceId];
  const where: string[] = [`workspace_id = $1`];

  if (opts.mistakeType) {
    params.push(opts.mistakeType);
    where.push(`mistake_type = $${params.length}`);
  }
  if (opts.sinceDays) {
    params.push(opts.sinceDays);
    where.push(`created_at > NOW() - ($${params.length} || ' days')::INTERVAL`);
  }
  params.push(Math.max(1, Math.min(500, opts.limit ?? 100)));

  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM arca_trade_mistake_labels
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows.map(mapMistakeLabel);
}

export async function recentMistakeFrequency(workspaceId: string, days = 7): Promise<number> {
  const rows = await q<{ n: string }>(
    `SELECT COUNT(*)::TEXT AS n FROM arca_trade_mistake_labels
     WHERE workspace_id = $1
       AND mistake_type <> 'NO_MISTAKE_SYSTEM_VALID'
       AND created_at > NOW() - ($2 || ' days')::INTERVAL`,
    [workspaceId, days],
  );
  return Number(rows[0]?.n ?? 0);
}
