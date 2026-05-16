/**
 * POST /api/cron/persist-edge-packets
 *
 * Scheduled persister for `admin_edge_packets`. Without this cron the
 * ARCA cycle's candidate universe is whatever the admin browser happens
 * to have loaded via /api/admin/opportunities — which is why the cockpit
 * kept cycling the same handful of tickers.
 *
 * For every workspace with an ACTIVE `arca_portfolios` row this route:
 *   1. resolves the symbol universe for the requested market (union of
 *      DEFAULT_WATCHLISTS, deduped),
 *   2. fetches AdminResearchPackets via getAdminResearchPacketsForSymbols,
 *   3. projects to canonical AdminEdgePacket[],
 *   4. inserts into `admin_edge_packets`.
 *
 * Body: `{ "market": "CRYPTO" | "EQUITIES", "timeframe"?: string, "limit"?: number }`
 *
 * Auth: x-cron-secret header (CRON_SECRET env). No session fallback —
 * this is cron-only, not user-facing.
 *
 * Research only. No execution. No broker.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { q } from "@/lib/db";
import type { Market } from "@/types/operator";
import { getAdminResearchPacketsForSymbols } from "@/lib/admin/getAdminResearchPacket";
import { projectEdgePacket, type AdminEdgePacket } from "@/lib/admin/edgePacket";
import { persistEdgePackets } from "@/lib/admin/edgePacketSnapshots";
import { unionWatchlistSymbols } from "@/lib/operator/watchlists";
import { notifyAdmin } from "@/lib/admin/notifyAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function authorise(req: NextRequest): boolean {
  const cronSecret = (process.env.CRON_SECRET || "").trim();
  const headerCron = req.headers.get("x-cron-secret") || "";
  return !!cronSecret && timingSafeCompare(headerCron, cronSecret);
}

const CRYPTO_UNIVERSE = unionWatchlistSymbols("CRYPTO", ["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK", "DOT", "MATIC", "ARB", "INJ"]);
const EQUITY_UNIVERSE = unionWatchlistSymbols("EQUITIES", ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "AMZN", "TSLA", "GOOGL", "AMD"]);

export async function POST(req: NextRequest) {
  if (!authorise(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const marketRaw = typeof body.market === "string" ? body.market.toUpperCase() : "CRYPTO";
    if (marketRaw !== "CRYPTO" && marketRaw !== "EQUITIES") {
      return NextResponse.json({ ok: false, error: "market must be CRYPTO or EQUITIES" }, { status: 400 });
    }
    const market = marketRaw as Market;
    const timeframe = typeof body.timeframe === "string" ? body.timeframe : "15m";
    const universe = market === "CRYPTO" ? CRYPTO_UNIVERSE : EQUITY_UNIVERSE;
    const limit = typeof body.limit === "number" && body.limit > 0
      ? Math.min(body.limit, universe.length)
      : universe.length;
    const symbols = universe.slice(0, limit);

    // Active workspaces from the same source the arca-cycle cron uses.
    let workspaces: Array<{ workspace_id: string }> = [];
    try {
      workspaces = await q<{ workspace_id: string }>(
        `SELECT DISTINCT workspace_id FROM arca_portfolios WHERE status='ACTIVE'`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const missing = /relation .* does not exist|arca_portfolios/i.test(msg);
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: missing ? "arca_portfolios_table_missing" : "portfolio_lookup_failed",
        message: msg,
        durationMs: Date.now() - started,
      });
    }
    if (workspaces.length === 0) {
      return NextResponse.json({
        ok: true,
        workspacesProcessed: 0,
        market,
        symbolsRequested: symbols.length,
        durationMs: Date.now() - started,
      });
    }

    const results: Array<{ workspaceId: string; written: number; packetsBuilt: number; error?: string }> = [];
    for (const w of workspaces) {
      try {
        const packets = await getAdminResearchPacketsForSymbols({
          symbols,
          market,
          timeframe,
          workspaceId: w.workspace_id,
        });
        const edgePackets: AdminEdgePacket[] = packets.map((p) => projectEdgePacket(p));
        // Rank by opportunityRankScore desc; pin IGNORE state to bottom.
        edgePackets.sort((a, b) => {
          const aOut = a.adminState === "IGNORE" ? 1 : 0;
          const bOut = b.adminState === "IGNORE" ? 1 : 0;
          if (aOut !== bOut) return aOut - bOut;
          return b.opportunityRankScore - a.opportunityRankScore;
        });
        edgePackets.forEach((p, i) => { p.opportunityRank = i + 1; });
        const written = await persistEdgePackets({ workspaceId: w.workspace_id, packets: edgePackets });
        results.push({ workspaceId: w.workspace_id, written, packetsBuilt: edgePackets.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ workspaceId: w.workspace_id, written: 0, packetsBuilt: 0, error: msg });
        notifyAdmin({
          subject: "persist-edge-packets workspace failed",
          body: `Workspace ${w.workspace_id} (${market}): ${msg}`,
          severity: "warn",
          context: { workspaceId: w.workspace_id, market, durationMs: Date.now() - started },
        }).catch(() => {});
      }
    }

    const totalWritten = results.reduce((acc, r) => acc + r.written, 0);
    return NextResponse.json({
      ok: true,
      market,
      symbolsRequested: symbols.length,
      workspacesProcessed: results.length,
      totalRowsWritten: totalWritten,
      results,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    notifyAdmin({
      subject: "persist-edge-packets cron failed",
      body: `persist-edge-packets crashed: ${msg}`,
      severity: "error",
      context: { durationMs: Date.now() - started },
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
