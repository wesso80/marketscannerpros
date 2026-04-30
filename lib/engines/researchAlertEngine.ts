/**
 * Phase 5 — Admin Research Alert Engine
 *
 * Orchestrates the lifecycle of a single internal research alert:
 *   1. Build the canonical AdminResearchAlert payload from a candidate
 *   2. Apply suppression (cooldown / duplicate / threshold / lifecycle)
 *   3. Dispatch to Discord + email channels (best-effort)
 *   4. Return a structured outcome the caller can persist
 *
 * The engine does NOT touch the database directly. The API route is
 * responsible for loading recent alerts (for suppression context) and
 * persisting the engine's outcome.
 *
 * Boundary: every alert payload carries the immutable classification
 * `PRIVATE_RESEARCH_ALERT_NOT_BROKER_EXECUTION`.
 */

import { randomUUID } from "node:crypto";
import type {
  AdminResearchAlert,
  ResearchLifecycle,
  SetupType,
} from "@/lib/admin/adminTypes";
import type { BiasState } from "@/lib/admin/types";
import {
  evaluateSuppression,
  type SuppressionDecision,
  type SuppressionThresholds,
} from "../alerts/alertSuppression";
import { dispatchDiscordResearchAlert } from "../alerts/discord";
import { dispatchEmailResearchAlert } from "../alerts/email";

export interface ResearchAlertCandidate {
  symbol: string;
  market: string;
  timeframe: string;
  setup: SetupType;
  bias: BiasState;
  score: number;
  trustAdjustedScore?: number;
  dataTrustScore: number;
  lifecycle: ResearchLifecycle;
  contradictionCount?: number;
  trapRiskScore?: number;
  setupLate?: boolean;
  dataTruthStatus?: string;
  whyThis?: string;
  whyNow?: string;
  whatChanged?: string;
  evidence?: string[];
  missingEvidence?: string[];
  mainRisk?: string;
  nextResearchCheck?: string;
  researchLink?: string;
}

export interface ResearchAlertContext {
  recentAlerts: Pick<AdminResearchAlert, "symbol" | "timeframe" | "setup" | "createdAt">[];
  thresholds?: Partial<SuppressionThresholds>;
  /** Inject "now" for deterministic tests. */
  now?: number;
  /** Optional per-call channel overrides (env is the default). */
  discordWebhookUrl?: string;
  emailRecipient?: string;
}

export interface ResearchAlertOutcome {
  alert: AdminResearchAlert;
  decision: SuppressionDecision;
  status: "FIRED" | "SUPPRESSED";
  channels: {
    discord: { ok: boolean; status?: number; skipped?: string; error?: string };
    email: { ok: boolean; skipped?: string; error?: string };
  };
}

function buildAlert(candidate: ResearchAlertCandidate, now: number): AdminResearchAlert {
  return {
    alertId: randomUUID(),
    symbol: candidate.symbol,
    market: candidate.market,
    timeframe: candidate.timeframe,
    setup: candidate.setup,
    bias: candidate.bias,
    score: candidate.score,
    dataTrustScore: candidate.dataTrustScore,
    whyThis: candidate.whyThis,
    whyNow: candidate.whyNow,
    whatChanged: candidate.whatChanged,
    evidence: candidate.evidence,
    missingEvidence: candidate.missingEvidence,
    mainRisk: candidate.mainRisk,
    nextResearchCheck: candidate.nextResearchCheck,
    researchLink: candidate.researchLink,
    classification: "PRIVATE_RESEARCH_ALERT_NOT_BROKER_EXECUTION",
    createdAt: new Date(now).toISOString(),
  };
}

export async function runResearchAlertEngine(
  candidate: ResearchAlertCandidate,
  ctx: ResearchAlertContext,
): Promise<ResearchAlertOutcome> {
  const now = ctx.now ?? Date.now();
  const alert = buildAlert(candidate, now);

  const decision = evaluateSuppression({
    symbol: candidate.symbol,
    market: candidate.market,
    timeframe: candidate.timeframe,
    setup: candidate.setup,
    score: candidate.score,
    trustAdjustedScore: candidate.trustAdjustedScore,
    dataTrustScore: candidate.dataTrustScore,
    lifecycle: candidate.lifecycle,
    contradictionCount: candidate.contradictionCount,
    trapRiskScore: candidate.trapRiskScore,
    setupLate: candidate.setupLate,
    dataTruthStatus: candidate.dataTruthStatus,
    recentAlerts: ctx.recentAlerts,
    thresholds: ctx.thresholds,
    now,
  });

  if (!decision.allow) {
    return {
      alert,
      decision,
      status: "SUPPRESSED",
      channels: { discord: { ok: false, skipped: "SUPPRESSED" }, email: { ok: false, skipped: "SUPPRESSED" } },
    };
  }

  const [discord, email] = await Promise.all([
    dispatchDiscordResearchAlert(alert, ctx.discordWebhookUrl),
    dispatchEmailResearchAlert(alert, ctx.emailRecipient),
  ]);

  return {
    alert,
    decision,
    status: "FIRED",
    channels: {
      discord: { ok: discord.ok, status: discord.status, skipped: discord.skipped, error: discord.error },
      email: { ok: email.ok, skipped: email.skipped, error: email.error },
    },
  };
}
