/**
 * Phase 5 — Admin Research Alerts API
 *
 * POST  /api/admin/research-alerts  — evaluate + dispatch a candidate
 * GET   /api/admin/research-alerts  — log of recent alerts (FIRED + SUPPRESSED)
 *
 * Boundary: every payload here carries the immutable classification
 * `PRIVATE_RESEARCH_ALERT_NOT_BROKER_EXECUTION`. This route never
 * routes orders, never executes against a broker, never sizes client
 * positions.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { q } from "@/lib/db";
import {
  runResearchAlertEngine,
  type ResearchAlertCandidate,
} from "@/lib/engines/researchAlertEngine";
import type { AdminResearchAlert } from "@/lib/admin/adminTypes";
import { appendResearchEvent } from "@/lib/admin/researchEventTape";

export const runtime = "nodejs";

interface AlertRow {
  alert_id: string;
  symbol: string;
  market: string;
  timeframe: string;
  setup: string;
  bias: string;
  score: number;
  data_trust_score: number;
  classification: string;
  status: "FIRED" | "SUPPRESSED";
  suppression_reason: string | null;
  channels: unknown;
  created_at: string;
}

async function ensureTable(): Promise<void> {
  await q(`
    CREATE TABLE IF NOT EXISTS admin_research_alerts (
      id BIGSERIAL PRIMARY KEY,
      workspace_id VARCHAR(100) NOT NULL,
      alert_id UUID NOT NULL,
      symbol VARCHAR(40) NOT NULL,
      market VARCHAR(20) NOT NULL,
      timeframe VARCHAR(10) NOT NULL,
      setup VARCHAR(60) NOT NULL,
      bias VARCHAR(20) NOT NULL,
      score INT NOT NULL,
      data_trust_score INT NOT NULL,
      classification VARCHAR(60) NOT NULL,
      status VARCHAR(20) NOT NULL,
      suppression_reason VARCHAR(40),
      channels JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_research_alerts_workspace ON admin_research_alerts (workspace_id, created_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_research_alerts_key ON admin_research_alerts (workspace_id, symbol, timeframe, setup, created_at DESC)`);
}

async function authorize(req: NextRequest): Promise<{ ok: boolean; workspaceId: string }> {
  const adminAuth = (await requireAdmin(req)).ok;
  if (adminAuth) return { ok: true, workspaceId: "admin" };
  const session = await getSessionFromCookie();
  if (!session || !isOperator(session.cid, session.workspaceId)) {
    return { ok: false, workspaceId: "" };
  }
  return { ok: true, workspaceId: session.workspaceId };
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    const body = (await req.json()) as Partial<ResearchAlertCandidate>;
    const required = ["symbol", "market", "timeframe", "setup", "bias", "score", "dataTrustScore", "lifecycle"] as const;
    for (const k of required) {
      if (body[k] === undefined || body[k] === null || body[k] === "") {
        return NextResponse.json({ error: `Missing required field: ${k}` }, { status: 400 });
      }
    }

    await ensureTable();

    // Pull recent alerts for suppression context (24h window — well above any realistic cooldown).
    const recent = await q<{ symbol: string; timeframe: string; setup: string; created_at: string }>(
      `SELECT symbol, timeframe, setup, created_at
         FROM admin_research_alerts
        WHERE workspace_id = $1
          AND created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC
        LIMIT 200`,
      [auth.workspaceId],
    );

    const candidate = body as ResearchAlertCandidate;
    candidate.symbol = candidate.symbol.toUpperCase();
    candidate.market = candidate.market.toUpperCase();

    const outcome = await runResearchAlertEngine(candidate, {
      recentAlerts: recent.map((r) => ({
        symbol: r.symbol,
        timeframe: r.timeframe,
        setup: r.setup as AdminResearchAlert["setup"],
        createdAt: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at).toISOString(),
      })),
    });

    await q(
      `INSERT INTO admin_research_alerts (
         workspace_id, alert_id, symbol, market, timeframe, setup,
         bias, score, data_trust_score, classification,
         status, suppression_reason, channels, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13, $14
       )`,
      [
        auth.workspaceId,
        outcome.alert.alertId,
        outcome.alert.symbol,
        outcome.alert.market,
        outcome.alert.timeframe,
        outcome.alert.setup,
        outcome.alert.bias,
        Math.round(outcome.alert.score),
        Math.round(outcome.alert.dataTrustScore),
        outcome.alert.classification,
        outcome.status,
        outcome.decision.reason ?? null,
        JSON.stringify(outcome.channels),
        outcome.alert.createdAt,
      ],
    );

    await appendResearchEvent({
      workspaceId: auth.workspaceId,
      symbol: outcome.alert.symbol,
      market: outcome.alert.market,
      eventType: outcome.status === "FIRED" ? "ALERT_FIRED" : "ALERT_SUPPRESSED",
      severity: outcome.status === "FIRED" ? "HIGH" : "WATCH",
      message: `${outcome.status} ${outcome.alert.symbol} ${outcome.alert.setup} (${outcome.alert.score.toFixed(0)}/${outcome.alert.dataTrustScore.toFixed(0)})`,
      payload: {
        reason: outcome.decision.reason || null,
        channels: outcome.channels,
      },
    }).catch(() => undefined);

    if (outcome.channels.discord.ok || outcome.channels.discord.error || outcome.channels.discord.skipped) {
      await appendResearchEvent({
        workspaceId: auth.workspaceId,
        symbol: outcome.alert.symbol,
        market: outcome.alert.market,
        eventType: "DISCORD_STATUS",
        severity: outcome.channels.discord.ok ? "INFO" : "WATCH",
        message: outcome.channels.discord.ok ? "Discord dispatch succeeded" : "Discord dispatch did not succeed",
        payload: outcome.channels.discord,
      }).catch(() => undefined);
    }

    if (outcome.channels.email.ok || outcome.channels.email.error || outcome.channels.email.skipped) {
      await appendResearchEvent({
        workspaceId: auth.workspaceId,
        symbol: outcome.alert.symbol,
        market: outcome.alert.market,
        eventType: "EMAIL_STATUS",
        severity: outcome.channels.email.ok ? "INFO" : "WATCH",
        message: outcome.channels.email.ok ? "Email dispatch succeeded" : "Email dispatch did not succeed",
        payload: outcome.channels.email,
      }).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      status: outcome.status,
      alert: outcome.alert,
      decision: outcome.decision,
      channels: outcome.channels,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to evaluate alert" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") || 50)));
    const symbol = (searchParams.get("symbol") || "").toUpperCase();

    await ensureTable();

    const rows = symbol
      ? await q<AlertRow>(
          `SELECT alert_id, symbol, market, timeframe, setup, bias, score, data_trust_score,
                  classification, status, suppression_reason, channels, created_at
             FROM admin_research_alerts
            WHERE workspace_id = $1 AND symbol = $2
            ORDER BY created_at DESC
            LIMIT $3`,
          [auth.workspaceId, symbol, limit],
        )
      : await q<AlertRow>(
          `SELECT alert_id, symbol, market, timeframe, setup, bias, score, data_trust_score,
                  classification, status, suppression_reason, channels, created_at
             FROM admin_research_alerts
            WHERE workspace_id = $1
            ORDER BY created_at DESC
            LIMIT $2`,
          [auth.workspaceId, limit],
        );

    return NextResponse.json({
      ok: true,
      header: "PRIVATE RESEARCH ALERT — NOT BROKER EXECUTION",
      alerts: rows.map((r) => ({
        alertId: r.alert_id,
        symbol: r.symbol,
        market: r.market,
        timeframe: r.timeframe,
        setup: r.setup,
        bias: r.bias,
        score: r.score,
        dataTrustScore: r.data_trust_score,
        classification: r.classification,
        status: r.status,
        suppressionReason: r.suppression_reason,
        channels: r.channels,
        createdAt: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at).toISOString(),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load alerts" },
      { status: 500 },
    );
  }
}
