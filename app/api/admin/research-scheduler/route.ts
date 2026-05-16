import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { wrapTruth } from "@/lib/admin";
import { listSchedulerRuns, runResearchScheduler, type SchedulerMode } from "@/lib/admin/researchScheduler";
import { unionWatchlistSymbols } from "@/lib/operator/watchlists";

export const runtime = "nodejs";

// Pinned anchors live at the head; the rest is the deduped DEFAULT_WATCHLISTS
// union per market so the research scheduler covers the same operator
// universe as the cockpit (admin-only — see no-public-leakage).
const CRYPTO_UNIVERSE = unionWatchlistSymbols("CRYPTO", ["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK", "DOT", "MATIC", "ARB", "INJ"]);
const EQUITY_UNIVERSE = unionWatchlistSymbols("EQUITIES", ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "AMZN", "TSLA", "GOOGL", "AMD"]);
// HIGH_PRIORITY_RESCAN and WATCHLIST stay narrow on purpose — they exist to
// re-poll anchors fast without burning AV/CG quota on the full universe.
const HIGH_PRIORITY_ANCHORS = ["SPY", "QQQ", "BTC", "ETH", "AAPL", "NVDA"];
const WATCHLIST_ANCHORS = ["AAPL", "MSFT", "NVDA", "BTC", "ETH", "SOL"];

function defaultSymbols(mode: SchedulerMode, market: string): string[] {
  if (mode === "HIGH_PRIORITY_RESCAN") return HIGH_PRIORITY_ANCHORS;
  if (mode === "WATCHLIST") return WATCHLIST_ANCHORS;
  if (market === "CRYPTO") return CRYPTO_UNIVERSE;
  return EQUITY_UNIVERSE;
}

async function authorize(req: NextRequest): Promise<{ ok: boolean; workspaceId: string }> {
  const adminAuth = await requireAdmin(req);
  if (adminAuth.ok) return { ok: true, workspaceId: adminAuth.workspaceId || "admin" };
  const session = await getSessionFromCookie();
  if (!session || !isOperator(session.cid, session.workspaceId)) return { ok: false, workspaceId: "" };
  return { ok: true, workspaceId: session.workspaceId };
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const limit = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get("limit") || 50)));
  const runs = await listSchedulerRuns(auth.workspaceId, limit);
  return NextResponse.json({
    ok: true,
    runs,
    truth: wrapTruth(
      { source: 'admin:research-scheduler', count: runs.length },
      {
        source: 'admin:research-scheduler',
        freshness: 'real-time',
        simulated: false,
        confidence: runs.length > 0 ? 'high' : 'medium',
        confidenceReason: runs.length > 0
          ? `${runs.length} scheduler run${runs.length === 1 ? '' : 's'} listed.`
          : 'No scheduler runs recorded yet.',
      },
    ),
  });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const mode = (body?.mode || "WATCHLIST") as SchedulerMode;
  const market = String(body?.market || "CRYPTO").toUpperCase();
  const timeframe = String(body?.timeframe || "15m");
  const symbols = Array.isArray(body?.symbols)
    ? body.symbols.map((s: string) => String(s || "").trim().toUpperCase()).filter(Boolean)
    : defaultSymbols(mode, market);

  const result = await runResearchScheduler({
    workspaceId: auth.workspaceId,
    mode,
    market: market === "EQUITIES" ? "EQUITIES" : "CRYPTO",
    timeframe,
    symbols,
  });

  return NextResponse.json({
    ok: true,
    result,
    truth: wrapTruth(
      { source: 'admin:research-scheduler', mode, market },
      {
        source: 'admin:research-scheduler',
        freshness: 'real-time',
        simulated: false,
        confidence: 'high',
        confidenceReason: `Scheduler executed in ${mode} mode against ${symbols.length} symbol${symbols.length === 1 ? '' : 's'}.`,
      },
    ),
  });
}
