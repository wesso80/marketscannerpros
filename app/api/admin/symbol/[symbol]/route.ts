/**
 * GET /api/admin/symbol/[symbol] — Full symbol intelligence for admin terminal
 * Runs the operator engine on a single symbol and returns AdminSymbolIntelligence.
 *
 * Query params:
 *   ?market=CRYPTO (default)
 *   &timeframe=15m (default)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import type { Market } from "@/types/operator";
import { getAdminResearchPacket } from "@/lib/admin/getAdminResearchPacket";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  // Auth gate
  const adminAuth = (await requireAdmin(req)).ok;
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  try {
    const { symbol: rawSymbol } = await params;
    const symbol = decodeURIComponent(rawSymbol).toUpperCase();
    const { searchParams } = new URL(req.url);
    const market = (searchParams.get("market") || "CRYPTO") as Market;
    const timeframe = searchParams.get("timeframe") || "15m";
    const packet = await getAdminResearchPacket({ symbol, market, timeframe });

    return NextResponse.json({
      ...packet.snapshot,
      research: {
        dataTruth: packet.dataTruth,
        score: packet.internalResearchScore,
        setup: packet.setup,
      },
      researchPacket: packet,
      bars: packet.snapshot.bars || [],
      meta: {
        generatedAt: packet.createdAt,
        packetId: packet.packetId,
        alertEligibility: packet.alertEligibility,
      },
    });
  } catch (err: unknown) {
    console.error("[admin:symbol] Error:", err);
    return NextResponse.json(
      { error: "Symbol fetch failed", detail: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
