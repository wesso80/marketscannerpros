/**
 * POST /api/admin/research-cases — save a Research Case from the
 * admin Symbol Research Terminal.
 *
 * Boundary: this writes a *research note*, not a trade. The persisted
 * record carries no order, no fills, no position. It is a typed
 * snapshot of the operator's research thesis at a moment in time.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { q } from "@/lib/db";

export const runtime = "nodejs";

interface ResearchCaseInput {
  symbol: string;
  market: string;
  timeframe: string;
  bias: string;
  setupType: string;
  score: number;
  lifecycle: string;
  dataTrustScore: number;
  dataTruthStatus: string;
  thesis?: string;
  whyNow?: string;
  invalidation?: string;
  scenarios?: { bullish?: string; bearish?: string; neutral?: string; invalidation?: string };
  evidenceAxes?: Record<string, number>;
  penalties?: { code: string; label: string; weight: number }[];
  boosts?: { code: string; label: string; weight: number }[];
}

async function ensureTable(): Promise<void> {
  await q(`
    CREATE TABLE IF NOT EXISTS admin_research_cases (
      id BIGSERIAL PRIMARY KEY,
      workspace_id VARCHAR(100) NOT NULL,
      symbol VARCHAR(40) NOT NULL,
      market VARCHAR(20) NOT NULL,
      timeframe VARCHAR(10) NOT NULL,
      bias VARCHAR(20) NOT NULL,
      setup_type VARCHAR(60) NOT NULL,
      score INT NOT NULL,
      lifecycle VARCHAR(40) NOT NULL,
      data_trust_score INT NOT NULL,
      data_truth_status VARCHAR(30) NOT NULL,
      thesis TEXT,
      why_now TEXT,
      invalidation TEXT,
      scenarios JSONB,
      evidence_axes JSONB,
      penalties JSONB,
      boosts JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_research_cases_workspace ON admin_research_cases (workspace_id, created_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_research_cases_symbol ON admin_research_cases (workspace_id, symbol, created_at DESC)`);
}

export async function POST(req: NextRequest) {
  // Auth gate (mirrors other admin endpoints)
  const adminAuth = (await requireAdmin(req)).ok;
  let workspaceId = "admin";
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    workspaceId = session.workspaceId;
  }

  try {
    const body = (await req.json()) as ResearchCaseInput;

    if (!body?.symbol || !body?.market || !body?.timeframe) {
      return NextResponse.json({ error: "symbol, market, and timeframe are required" }, { status: 400 });
    }

    await ensureTable();

    const rows = await q<{ id: string; created_at: string }>(
      `INSERT INTO admin_research_cases (
         workspace_id, symbol, market, timeframe, bias, setup_type,
         score, lifecycle, data_trust_score, data_truth_status,
         thesis, why_now, invalidation, scenarios,
         evidence_axes, penalties, boosts
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15, $16, $17
       )
       RETURNING id, created_at`,
      [
        workspaceId,
        body.symbol.toUpperCase(),
        body.market.toUpperCase(),
        body.timeframe,
        body.bias,
        body.setupType,
        Math.round(body.score),
        body.lifecycle,
        Math.round(body.dataTrustScore),
        body.dataTruthStatus,
        body.thesis ?? null,
        body.whyNow ?? null,
        body.invalidation ?? null,
        body.scenarios ? JSON.stringify(body.scenarios) : null,
        body.evidenceAxes ? JSON.stringify(body.evidenceAxes) : null,
        body.penalties ? JSON.stringify(body.penalties) : null,
        body.boosts ? JSON.stringify(body.boosts) : null,
      ],
    );

    return NextResponse.json({ ok: true, id: rows[0]?.id, createdAt: rows[0]?.created_at });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save research case" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const adminAuth = (await requireAdmin(req)).ok;
  let workspaceId = "admin";
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    workspaceId = session.workspaceId;
  }

  try {
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 50));

    const rows = symbol
      ? await q(
          `SELECT * FROM admin_research_cases WHERE workspace_id = $1 AND symbol = $2 ORDER BY created_at DESC LIMIT $3`,
          [workspaceId, symbol.toUpperCase(), limit],
        )
      : await q(
          `SELECT * FROM admin_research_cases WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
          [workspaceId, limit],
        );

    return NextResponse.json({ cases: rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load research cases" },
      { status: 500 },
    );
  }
}
