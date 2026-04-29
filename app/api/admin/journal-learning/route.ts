/**
 * Phase 7 — Journal Learning API
 *
 * GET /api/admin/journal-learning
 *   ?symbol=AAPL&market=EQUITIES&timeframe=15m&bias=LONG&setup=TREND_CONTINUATION&score=78
 *
 * Loads recent admin_research_cases for the workspace and returns:
 *   - pattern groups (setup × market × bias rollups)
 *   - matches for the optional current candidate
 *   - meaningful-match flag + recommended JOURNAL_PATTERN_MATCH boost
 *
 * Boundary: research patterns over saved research cases. No trades.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { q } from "@/lib/db";
import {
  buildJournalDNA,
  computeJournalPatternBoost,
  type JournalCaseRow,
  type JournalCurrent,
} from "@/lib/engines/journalLearning";

export const runtime = "nodejs";

interface DbRow {
  id: string;
  symbol: string;
  market: string;
  timeframe: string;
  bias: string;
  setup_type: string;
  score: number;
  lifecycle: string;
  data_trust_score: number;
  created_at: string;
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

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").toUpperCase();
  const market = (searchParams.get("market") || "").toUpperCase();
  const timeframe = searchParams.get("timeframe") || "";
  const bias = (searchParams.get("bias") || "").toUpperCase();
  const setup = (searchParams.get("setup") || "").toUpperCase();
  const score = Number(searchParams.get("score") || NaN);
  const limit = Math.max(50, Math.min(500, Number(searchParams.get("limit") || 200)));

  let rows: DbRow[];
  try {
    rows = await q<DbRow>(
      `SELECT id::text, symbol, market, timeframe, bias, setup_type,
              score, lifecycle, data_trust_score, created_at
         FROM admin_research_cases
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [auth.workspaceId, limit],
    );
  } catch (err) {
    // Table may not exist yet (no cases saved). Return an empty summary.
    return NextResponse.json({
      ok: true,
      summary: { totalCases: 0, groups: [], matches: [], hasMeaningfulMatch: false },
      boost: null,
      note: err instanceof Error ? err.message : "no journal table",
    });
  }

  const cases: JournalCaseRow[] = rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    market: r.market,
    timeframe: r.timeframe,
    bias: r.bias,
    setupType: r.setup_type,
    score: Number(r.score) || 0,
    lifecycle: r.lifecycle,
    dataTrustScore: Number(r.data_trust_score) || 0,
    createdAt: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at).toISOString(),
  }));

  let current: JournalCurrent | null = null;
  if (symbol && market && timeframe && bias && setup && Number.isFinite(score)) {
    current = { symbol, market, timeframe, bias, setupType: setup, score };
  }

  const summary = buildJournalDNA(cases, current);
  const boost = current ? computeJournalPatternBoost(summary.matches) : null;

  return NextResponse.json({ ok: true, summary, boost });
}
