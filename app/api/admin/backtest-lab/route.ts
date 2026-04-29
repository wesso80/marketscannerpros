/**
 * GET /api/admin/backtest-lab — Snapshot of historical research-call
 * outcomes used by the Backtest Lab. Pulls from `signal_outcomes` /
 * `signals_outcomes` and `admin_research_cases` and returns aggregated
 * per-setup, per-market stats.
 *
 * BOUNDARY: read-only. The Backtest Lab is a research analytics surface;
 * no orders, no execution.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { q } from "@/lib/db";

export const runtime = "nodejs";

interface CaseRow {
  setup_type?: string | null;
  market?: string | null;
  bias?: string | null;
  score?: number | string | null;
  outcome?: string | null;
}

interface SetupBreakdown {
  setup: string;
  market: string;
  cases: number;
  avgScore: number;
  hitRate: number | null;
  wins: number;
  losses: number;
}

function isWin(outcome: string | null | undefined): boolean | null {
  if (!outcome) return null;
  const u = outcome.toUpperCase();
  if (u.includes("WIN") || u.includes("HIT") || u.includes("TARGET") || u.includes("TP")) return true;
  if (u.includes("LOSS") || u.includes("STOP") || u.includes("MISS") || u.includes("SL")) return false;
  return null;
}

async function loadRows(): Promise<CaseRow[]> {
  const collected: CaseRow[] = [];
  for (const table of ["admin_research_cases", "signal_outcomes", "signals_outcomes"]) {
    try {
      const rows = await q(
        `SELECT setup_type, market, bias, score, outcome
         FROM ${table}
         ORDER BY created_at DESC
         LIMIT 1000`,
      );
      if (Array.isArray(rows)) collected.push(...rows);
    } catch {
      // Optional table — skip silently.
    }
  }
  return collected;
}

export async function GET(req: NextRequest) {
  const adminAuth = (await requireAdmin(req)).ok;
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }
  }

  const rows = await loadRows();

  const map = new Map<string, SetupBreakdown>();
  let totalCases = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalScore = 0;
  let scoredCases = 0;

  for (const r of rows) {
    const setup = String(r.setup_type ?? "UNKNOWN").toUpperCase();
    const market = String(r.market ?? "UNKNOWN").toUpperCase();
    const key = `${setup}|${market}`;
    const score = Number(r.score);
    const win = isWin(r.outcome ?? null);

    let entry = map.get(key);
    if (!entry) {
      entry = { setup, market, cases: 0, avgScore: 0, hitRate: null, wins: 0, losses: 0 };
      map.set(key, entry);
    }
    entry.cases += 1;
    if (Number.isFinite(score)) {
      entry.avgScore += score;
      totalScore += score;
      scoredCases += 1;
    }
    if (win === true) {
      entry.wins += 1;
      totalWins += 1;
    } else if (win === false) {
      entry.losses += 1;
      totalLosses += 1;
    }
    totalCases += 1;
  }

  const breakdown: SetupBreakdown[] = Array.from(map.values()).map((b) => {
    const labelled = b.wins + b.losses;
    return {
      ...b,
      avgScore: b.cases > 0 ? Math.round((b.avgScore / b.cases) * 10) / 10 : 0,
      hitRate: labelled > 0 ? Math.round((b.wins / labelled) * 1000) / 10 : null,
    };
  });

  breakdown.sort((a, b) => b.cases - a.cases);

  const overallHitRate =
    totalWins + totalLosses > 0
      ? Math.round((totalWins / (totalWins + totalLosses)) * 1000) / 10
      : null;
  const overallAvgScore = scoredCases > 0 ? Math.round((totalScore / scoredCases) * 10) / 10 : null;

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    totalCases,
    totalWins,
    totalLosses,
    overallHitRate,
    overallAvgScore,
    breakdown,
    note:
      totalCases === 0
        ? "No historical cases yet. Save research cases from the Symbol Research terminal to populate the Backtest Lab."
        : null,
  });
}
