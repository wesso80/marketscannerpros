import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { getAdminResearchPacketsForSymbols, type AdminResearchPacket } from "@/lib/admin/getAdminResearchPacket";
import { appendResearchEvent } from "@/lib/admin/researchEventTape";

export const runtime = "nodejs";

const EQUITIES = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "AMZN", "TSLA", "GOOGL", "AMD"];
const CRYPTO = ["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK", "DOT", "MATIC", "ARB", "INJ"];

async function authorize(req: NextRequest): Promise<{ ok: boolean; workspaceId: string }> {
  const adminAuth = await requireAdmin(req);
  if (adminAuth.ok) return { ok: true, workspaceId: adminAuth.workspaceId || "admin" };
  const session = await getSessionFromCookie();
  if (!session || !isOperator(session.cid, session.workspaceId)) return { ok: false, workspaceId: "" };
  return { ok: true, workspaceId: session.workspaceId };
}

function topBy(packets: AdminResearchPacket[], predicate: (p: AdminResearchPacket) => boolean, max = 6): AdminResearchPacket[] {
  return packets
    .filter(predicate)
    .sort((a, b) => b.trustAdjustedScore - a.trustAdjustedScore)
    .slice(0, max);
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const timeframe = req.nextUrl.searchParams.get("timeframe") || "15m";

  const [equityPackets, cryptoPackets] = await Promise.all([
    getAdminResearchPacketsForSymbols({ symbols: EQUITIES, market: "EQUITIES", timeframe }),
    getAdminResearchPacketsForSymbols({ symbols: CRYPTO, market: "CRYPTO", timeframe }),
  ]);

  const all = [...equityPackets, ...cryptoPackets];

  const bestEquities = topBy(all, (p) => p.assetClass === "equity");
  const bestCrypto = topBy(all, (p) => p.assetClass === "crypto");
  const bestOptionsPressure = topBy(all, (p) => p.optionsIntelligence.optionsPressureScore >= 65);
  const bestVolatilityCompression = topBy(all, (p) => p.volatilityState.breakoutReadiness >= 60 && !p.volatilityState.exhaustion);
  const bestTimeConfluence = topBy(all, (p) => p.timeConfluence.score >= 0.7 || p.timeConfluence.hotWindow);
  const bestNewsDriven = topBy(all, (p) => p.newsContext.status === "ELEVATED");
  const bestEarningsWatch = topBy(all, (p) => p.earningsContext.riskLevel === "HIGH" || p.earningsContext.riskLevel === "MEDIUM");
  const avoidTrapList = topBy(all, (p) => p.trapDetection.trapRiskScore >= 60, 8);
  const dataDegradedList = topBy(all, (p) => ["STALE", "DEGRADED", "MISSING", "ERROR", "SIMULATED"].includes(p.dataTruth.status), 8);
  const arcaTopCandidate = all.slice().sort((a, b) => b.trustAdjustedScore - a.trustAdjustedScore)[0] ?? null;

  await appendResearchEvent({
    workspaceId: auth.workspaceId,
    eventType: "NEW_HIGH_PRIORITY",
    severity: "INFO",
    message: `Priority Desk generated ${all.length} packets across equities and crypto.`,
    payload: {
      timeframe,
      equities: bestEquities.length,
      crypto: bestCrypto.length,
      degraded: dataDegradedList.length,
    },
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
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
  });
}
