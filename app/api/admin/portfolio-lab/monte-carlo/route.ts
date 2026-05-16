/**
 * GET /api/admin/portfolio-lab/monte-carlo
 *
 * Run a bootstrap Monte Carlo equity simulation against the workspace's
 * ARCA portfolio. Reads the closed-trade R-multiples to build the
 * empirical distribution and projects `horizon` trades forward from the
 * portfolio's current equity, using the portfolio's riskPerTradePct as
 * the sizing rule.
 *
 * Query params (all optional, all clamped):
 *   trials       (default 2000, max 5000)
 *   horizon      (default 100,  max 500)
 *   ruinPct      (default 50,   range 1..99)
 *   samplePaths  (default 60,   max 120)
 *   seed         (default 0xC0FFEE)
 *   riskPerTradePct (default portfolio.settings.riskPerTradePct, range 0.01..10)
 *
 * Admin-only, workspace-isolated, SIMULATED only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import {
  getDefaultPortfolio,
  listTrades,
} from "@/lib/admin/portfolio-lab/portfolioStore";
import { ARCA_DEFAULT_PORTFOLIO_NAME, ARCA_DISCLAIMER } from "@/lib/admin/portfolio-lab/constants";
import { runMonteCarlo } from "@/lib/admin/portfolio-lab/monteCarloEngine";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const url = new URL(req.url);
  const trials = clampInt(url.searchParams.get("trials"), 100, 2000, 5000);
  const horizon = clampInt(url.searchParams.get("horizon"), 10, 100, 500);
  const samplePaths = clampInt(url.searchParams.get("samplePaths"), 0, 60, 120);
  const seed = parseSeed(url.searchParams.get("seed"));
  const ruinPct = clampFloat(url.searchParams.get("ruinPct"), 1, 50, 99);

  const portfolio = await getDefaultPortfolio(admin.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) {
    return NextResponse.json(
      wrapTruth(
        { monteCarlo: null, disclaimer: ARCA_DISCLAIMER, reason: "no_portfolio" },
        { source: "arca:monte-carlo", simulated: true, freshness: "real-time", confidence: "high", confidenceReason: "No ARCA portfolio yet." },
      ),
    );
  }

  const riskPerTradePct = clampFloat(
    url.searchParams.get("riskPerTradePct"),
    0.01,
    portfolio.settings.riskPerTradePct,
    10,
  );

  const trades = await listTrades(admin.workspaceId, portfolio.id, { limit: 1000 });
  const rMultiples = trades.map((t) => t.rMultiple).filter((r): r is number => r != null && Number.isFinite(r));

  const result = runMonteCarlo({
    startingEquity: portfolio.totalEquity,
    riskPerTradePct,
    rMultiples,
    trials,
    horizon,
    ruinDrawdownPct: ruinPct,
    seed,
    samplePaths,
  });

  const confidence: "high" | "medium" | "low" =
    rMultiples.length >= 30 ? "high" : rMultiples.length >= 10 ? "medium" : "low";
  const reason =
    rMultiples.length === 0
      ? "No closed trades yet — Monte Carlo cannot bootstrap."
      : rMultiples.length < 10
      ? `Only ${rMultiples.length} closed trades in the empirical distribution.`
      : `${rMultiples.length} closed trades feed the bootstrap.`;

  return NextResponse.json(
    wrapTruth(
      { monteCarlo: result, disclaimer: ARCA_DISCLAIMER },
      {
        source: "arca:monte-carlo",
        simulated: true,
        freshness: "real-time",
        confidence,
        confidenceReason: reason,
      },
    ),
  );
}

function clampInt(raw: string | null, lo: number, def: number, hi: number): number {
  if (raw == null || raw === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
function clampFloat(raw: string | null, lo: number, def: number, hi: number): number {
  if (raw == null || raw === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}
function parseSeed(raw: string | null): number {
  if (raw == null || raw === "") return 0xC0FFEE;
  const n = Number(raw);
  if (Number.isFinite(n)) return Math.floor(n) >>> 0;
  // hash a non-numeric string into a 32-bit seed
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
