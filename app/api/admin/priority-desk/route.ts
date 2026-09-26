import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { appendResearchEvent } from "@/lib/admin/researchEventTape";
import { buildAdminScanContext } from "@/lib/admin/scan-context";
import { wrapTruth } from "@/lib/admin";
import { isDataDegraded, isRankable, readSavedScan, scanStatusForResponse, type SavedPacket } from "@/lib/admin/sharedScan";
import { recordAdminCalls, savedPacketCall, type AdminCallInput } from "@/lib/admin/adminCallLog";

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

/** Last top-candidate key per workspace+timeframe on this instance (tape de-dupe). */
const lastTopKeys = new Map<string, string>();

/** "MA, NVDA, AAPL" — the best-list symbols in rank order; "" when nothing ranks (no event). */
export function priorityDeskTopKey(top: Pick<SavedPacket, "symbol">[], max = 5): string {
  return top.slice(0, max).map((p) => p.symbol).join(", ");
}

/**
 * The Priority Desk's calls: every symbol in the best equities / crypto lists (with its rank) plus the ARCA top
 * candidate. Logged to ai_signal_log (admin-call:priority-desk) when the top list changes, for outcome labelling.
 */
export function priorityDeskCalls(bestEquities: SavedPacket[], bestCrypto: SavedPacket[], arcaTop: SavedPacket | null, nowMs: number = Date.now()): AdminCallInput[] {
  const calls: AdminCallInput[] = [];
  const add = (list: SavedPacket[], listName: string) =>
    list.forEach((p, i) => calls.push(savedPacketCall(p, "priority-desk", { verdict: `${listName} #${i + 1}`, trace: { list: listName, rank: i + 1 }, calledAtMs: nowMs })));
  add(bestEquities, "bestEquities");
  add(bestCrypto, "bestCrypto");
  if (arcaTop) calls.push(savedPacketCall(arcaTop, "priority-desk", { verdict: "ARCA top", trace: { list: "arcaTopCandidate", rank: 1 }, calledAtMs: nowMs }));
  return calls;
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
  // Only current, successful saved results with a detected setup rank; failed / skipped / stale ones go to the
  // degraded list. While the US market is closed, scans made after the last session's close stay current.
  const all = everything.filter(isRankable);
  const noSetupCount = everything.filter((p) => p.savedScan.noSetup && !isDataDegraded(p)).length;

  const bestEquities = topBy(all, (p) => p.assetClass === "equity");
  const bestCrypto = topBy(all, (p) => p.assetClass === "crypto");
  const bestOptionsPressure = topBy(all, (p) => p.optionsIntelligence.optionsPressureScore >= 65);
  const bestVolatilityCompression = topBy(all, (p) => p.volatilityState.breakoutReadiness >= 60 && !p.volatilityState.exhaustion);
  const bestTimeConfluence = topBy(all, (p) => p.timeConfluence.score >= 0.7 || p.timeConfluence.hotWindow);
  const bestNewsDriven = topBy(all, (p) => p.newsContext.status === "ELEVATED");
  const bestEarningsWatch = topBy(all, (p) => p.earningsContext.riskLevel === "HIGH" || p.earningsContext.riskLevel === "MEDIUM");
  const avoidTrapList = topBy(all, (p) => p.trapDetection.trapRiskScore >= 60, 8);
  const dataDegradedList = topBy(everything, isDataDegraded, 8);
  const arcaTopCandidate = all.slice().sort((a, b) => b.trustAdjustedScore - a.trustAdjustedScore)[0] ?? null;

  // Tape event only when the top candidates change (it used to append one on every load and every 120 s poll).
  const topKey = priorityDeskTopKey([...bestEquities, ...bestCrypto]);
  const tapeKey = `${auth.workspaceId}:${timeframe}`;
  if (topKey && lastTopKeys.get(tapeKey) !== topKey) {
    lastTopKeys.set(tapeKey, topKey);
    await appendResearchEvent({
      workspaceId: auth.workspaceId,
      eventType: "NEW_HIGH_PRIORITY",
      severity: "INFO",
      message: `Priority Desk top candidates changed: ${topKey}.`,
      payload: {
        timeframe,
        top: topKey,
        ranked: all.length,
        equities: bestEquities.length,
        crypto: bestCrypto.length,
        degraded: dataDegradedList.length,
      },
    }).catch(() => undefined);
    // Same trigger as the tape: log the desk's calls with their saved-scan price (deduped per NY day).
    await recordAdminCalls(priorityDeskCalls(bestEquities, bestCrypto, arcaTopCandidate)).catch(() => undefined);
  }

  return NextResponse.json({
    ok: true,
    // When the newest saved result was built (not "now"): the page shows this as the scan age.
    generatedAt: [equityView.newestScannedAt, cryptoView.newestScannedAt].filter(Boolean).sort().pop() ?? null,
    servedAt: new Date().toISOString(),
    savedScan: { equities: scanStatusForResponse(equityView), crypto: scanStatusForResponse(cryptoView) },
    // Current saved results where the engine found no setup (neither ranked nor data-degraded).
    noSetupCount,
    rankedCount: all.length,
    // "as of Fri 25 Sep 2026 close" while the US market is closed (from the newest ranked equity result).
    marketClosedAsOf: all.find((p) => p.savedScan.asOfLabel)?.savedScan.asOfLabel ?? null,
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
