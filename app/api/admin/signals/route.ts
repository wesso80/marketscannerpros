/**
 * GET /api/admin/signals — List recorded signals with optional filters
 *
 * Query params:
 *   ?symbol=SOL         — filter by symbol
 *   &regime=TREND_UP    — filter by regime
 *   &outcome=correct    — filter by outcome (pending|correct|wrong|neutral|expired)
 *   &limit=50           — max rows (default 50, max 200)
 *   &offset=0           — pagination offset
 */

import { NextRequest, NextResponse } from "next/server";
import { isAdminSecret, isOperator } from "@/lib/quant/operatorAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { q } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const adminAuth = isAdminSecret(req.headers.get("authorization"));
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const regime = searchParams.get("regime");
    const outcome = searchParams.get("outcome");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const conditions: string[] = ["workspace_id = 'operator-terminal'"];
    const params: unknown[] = [];
    let paramIdx = 0;

    if (symbol) {
      paramIdx++;
      conditions.push(`symbol = $${paramIdx}`);
      params.push(symbol.toUpperCase());
    }
    if (regime) {
      paramIdx++;
      conditions.push(`regime = $${paramIdx}`);
      params.push(regime);
    }
    if (outcome) {
      paramIdx++;
      conditions.push(`outcome = $${paramIdx}`);
      params.push(outcome);
    }

    paramIdx++;
    const limitParam = paramIdx;
    params.push(limit);
    paramIdx++;
    const offsetParam = paramIdx;
    params.push(offset);

    const where = conditions.join(" AND ");

    const rows = await q(
      `SELECT id, symbol, asset_type, timeframe, signal_at,
              regime, confluence_score, confidence, verdict, trade_bias,
              price_at_signal, entry_price, stop_loss, target_1, target_2,
              decision_trace, outcome, price_after_24h, pct_move_24h, outcome_measured_at,
              created_at
       FROM ai_signal_log
       WHERE ${where}
       ORDER BY signal_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    );

    const countRows = await q(
      `SELECT COUNT(*)::int AS total FROM ai_signal_log WHERE ${where}`,
      params.slice(0, -2), // exclude limit & offset
    );

    return NextResponse.json({
      signals: rows,
      total: countRows[0]?.total ?? 0,
      limit,
      offset,
    });
  } catch (err: unknown) {
    console.error("[admin:signals] Error:", err);
    return NextResponse.json({ error: "Failed to fetch signals" }, { status: 500 });
  }
}
