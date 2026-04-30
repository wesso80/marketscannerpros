import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { listSchedulerRuns, runResearchScheduler, type SchedulerMode } from "@/lib/admin/researchScheduler";

export const runtime = "nodejs";

const CRYPTO_UNIVERSE = ["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK", "DOT", "MATIC", "ARB", "INJ"];
const EQUITY_UNIVERSE = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "AMZN", "TSLA", "GOOGL", "AMD"];

function defaultSymbols(mode: SchedulerMode, market: string): string[] {
  if (mode === "HIGH_PRIORITY_RESCAN") return ["SPY", "QQQ", "BTC", "ETH", "AAPL", "NVDA"];
  if (mode === "WATCHLIST") return ["AAPL", "MSFT", "NVDA", "BTC", "ETH", "SOL"];
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
  return NextResponse.json({ ok: true, runs });
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

  return NextResponse.json({ ok: true, result });
}
