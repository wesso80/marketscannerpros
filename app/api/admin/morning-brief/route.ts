import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { buildMorningBrief, saveMorningBriefSnapshot } from "@/lib/admin/morning-brief";
import type { Market } from "@/types/operator";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const symbols = searchParams.get("symbols")
      ?.split(",")
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean);
    const market = (searchParams.get("market") || "CRYPTO") as Market;
    const timeframe = searchParams.get("timeframe") || "15m";
    const scanLimit = Number(searchParams.get("scanLimit") || searchParams.get("limit") || 50);
    const brief = await buildMorningBrief({ symbols, market, timeframe, scanLimit });
    await saveMorningBriefSnapshot(brief, "admin");
    return NextResponse.json({ ok: true, brief });
  } catch (err: unknown) {
    console.error("[admin:morning-brief] Error:", err);
    return NextResponse.json(
      { error: "Morning brief failed", detail: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}