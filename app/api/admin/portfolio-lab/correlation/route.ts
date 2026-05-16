/**
 * GET /api/admin/portfolio-lab/correlation
 *
 * Pairwise Pearson correlation matrix across ARCA's currently open
 * positions. Daily returns are reconstructed from admin_edge_packets
 * snapshots (no external network calls). Pairs without enough
 * overlapping observations come back as null.
 *
 * Query params (clamped):
 *   lookbackDays  (default 90,  range 10..365)
 *   minPaired     (default 10,  range 2..120)
 *
 * Admin-only, workspace-isolated, SIMULATED.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import { loadCorrelations } from "@/lib/admin/portfolio-lab/correlationLoader";
import { ARCA_DISCLAIMER } from "@/lib/admin/portfolio-lab/constants";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const url = new URL(req.url);
  const lookbackDays = clampInt(url.searchParams.get("lookbackDays"), 10, 90, 365);
  const minPaired = clampInt(url.searchParams.get("minPaired"), 2, 10, 120);

  const load = await loadCorrelations({
    workspaceId: admin.workspaceId,
    lookbackDays,
    minPaired,
  });

  if (!load.ok) {
    return NextResponse.json(
      wrapTruth(
        { correlation: null, disclaimer: ARCA_DISCLAIMER, reason: load.reason, lookbackDays },
        {
          source: "arca:correlation",
          simulated: true,
          freshness: "real-time",
          confidence: "high",
          confidenceReason:
            load.reason === "no_portfolio"
              ? "No ARCA portfolio yet."
              : "No open positions — correlation requires at least one open position.",
        },
      ),
    );
  }

  // Confidence: drops when many pairs lack data.
  const totalPairs = (load.result.symbols.length * (load.result.symbols.length - 1)) / 2;
  const defined = load.result.pairs.filter((p) => p.pearson != null).length;
  const ratio = totalPairs === 0 ? 1 : defined / totalPairs;
  const confidence: "high" | "medium" | "low" =
    ratio >= 0.8 ? "high" : ratio >= 0.4 ? "medium" : "low";

  return NextResponse.json(
    wrapTruth(
      {
        correlation: load.result,
        lookbackDays: load.lookbackDays,
        disclaimer: ARCA_DISCLAIMER,
      },
      {
        source: "arca:correlation",
        simulated: true,
        freshness: "real-time",
        confidence,
        confidenceReason: `${defined} of ${totalPairs} unique pairs have ≥${minPaired} overlapping returns over the last ${load.lookbackDays}d.`,
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
