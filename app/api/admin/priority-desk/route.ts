import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { appendResearchEvent } from "@/lib/admin/researchEventTape";
import { buildAdminScanContext } from "@/lib/admin/scan-context";
import { wrapTruth } from "@/lib/admin";
import { isRankable, readSavedScan, scanStatusForResponse, type SavedPacket } from "@/lib/admin/sharedScan";

export const runtime = "nodejs";

// Admin Priority Desk surveys the full DEFAULT_WATCHLISTS union per market (deduped, anchors first).
// It reads the shared saved admin scan (lib/admin/sharedScan.ts) instead of rebuilding ~265 packets
// live on every load/poll (~990 Alpha Vantage calls per load before). Each packet carries savedScan
// { status, ageLabel, stale }; only current, successful results rank in the "best" lists.

async function authorize(req: NextRequest): Promise<{ ok: boolean; workspaceId: string }> {
  const adminAuth = await requireAdmin(req);
  if (adminAuth.ok) return { ok: true, workspaceId: adminAuth.workspaceId || "admin" };
  const session = await getSessionFromCookie();
  if (!session || !isOperator(session.cid, session.workspaceId)) return { ok: false, workspaceId: "" };
  return { ok: true, workspaceId: session.workspaceId };
}

function topBy(packets: SavedPacket[], predicate: (p: SavedPacket) => boolean, max = 6): SavedPacket[] {
  return packets
    .filter(predicate)
    .sort((a, b) => b.trustAdjustedScore - a.trustAdjustedScore)
    .slice(0, max);
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const timeframe = req.nextUrl.searchParams.get("timeframe") || "15m";

  const [{ risk }, equityView, cryptoView] = await Promise.all([
    buildAdminScanContext(),
    readSavedScan({ market: "EQUITIES", timeframe }),
    readSavedScan({ market: "CRYPTO", timeframe }),
  ]);

  const everything = [...equityView.packets, ...cryptoView.packets];
  // Only current, successful saved results rank; failed / skipped / stale ones go to the degraded list.
  const all = everything.filter(isRankable);

  const bestEquities = topBy(all, (p) => p.assetClass === "equity");
  const bestCrypto = topBy(all, (p) => p.assetClass === "crypto");
  const bestOptionsPressure = topBy(all, (p) => p.optionsIntelligence.optionsPressureScore >= 65);
  const bestVolatilityCompression = topBy(all, (p) => p.volatilityState.breakoutReadiness >= 60 && !p.volatilityState.exhaustion);
  const bestTimeConfluence = topBy(all, (p) => p.timeConfluence.score >= 0.7 || p.timeConfluence.hotWindow);
  const bestNewsDriven = topBy(all, (p) => p.newsContext.status === "ELEVATED");
  const bestEarningsWatch = topBy(all, (p) => p.earningsContext.riskLevel === "HIGH" || p.earningsContext.riskLevel === "MEDIUM");
  const avoidTrapList = topBy(all, (p) => p.trapDetection.trapRiskScore >= 60, 8);
  const dataDegradedList = topBy(everything, (p) => !isRankable(p) || ["STALE", "DEGRADED", "MISSING", "ERROR", "SIMULATED"].includes(p.dataTruth.status), 8);
  const arcaTopCandidate = all.slice().sort((a, b) => b.trustAdjustedScore - a.trustAdjustedScore)[0] ?? null;

  await appendResearchEvent({
    workspaceId: auth.workspaceId,
    eventType: "NEW_HIGH_PRIORITY",
    severity: "INFO",
    message: `Priority Desk read ${all.length} current saved packets across equities and crypto.`,
    payload: {
      timeframe,
      equities: bestEquities.length,
      crypto: bestCrypto.length,
      degraded: dataDegradedList.length,
    },
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    // When the newest saved result was built (not "now"): the page shows this as the scan age.
    generatedAt: [equityView.newestScannedAt, cryptoView.newestScannedAt].filter(Boolean).sort().pop() ?? null,
    servedAt: new Date().toISOString(),
    savedScan: { equities: scanStatusForResponse(equityView), crypto: scanStatusForResponse(cryptoView) },
    timeframe,
    bestEquities,
    bestCrypto,
    bestOptionsPressure,
    bestVolatilityCompression,
    bestTimeConfluence,
    bestNewsDriven,
    bestEarningsWatch,
    avoidTrapList,
    dataDegradedList,
    arcaTopCandidate,
    // Operator guard context — discovery and ranking are unaffected.
    // Portfolio/risk state appears here as warnings only.
    operatorGuard: {
      active: risk.operatorGuardActive,
      reasons: risk.operatorGuardReasons,
      alertsDeliveryPaused: risk.killSwitchActive || risk.permission === "BLOCK",
      message: risk.operatorGuardActive
        ? "Operator guard active — discovery remains live. Personal exposure warnings shown separately."
        : null,
      riskSource: risk.source,
      drawdownPct: risk.dailyDrawdown,
      activePositions: risk.activePositions,
    },
    // Truth Layer envelope — see .claude/ADMIN_TRUTH_LAYER.md.
    // Lets the UI render freshness/source/missing-data badges without inferring them.
    truth: wrapTruth(
      { equities: bestEquities.length, crypto: bestCrypto.length, degraded: dataDegradedList.length },
      {
        source: "admin:priority-desk",
        freshness: dataDegradedList.length > 0 ? "stale" : "delayed",
        simulated: false,
        missingFields: dataDegradedList.map((p) => p.symbol),
        confidence: dataDegradedList.length > all.length / 3 ? "low" : dataDegradedList.length > 0 ? "medium" : "high",
        confidenceReason:
          dataDegradedList.length === 0
            ? "All saved packets are current."
            : `${dataDegradedList.length}/${all.length} packets degraded; downgraded confidence.`,
      },
    ),
  });
}
