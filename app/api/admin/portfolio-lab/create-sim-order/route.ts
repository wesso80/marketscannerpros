/**
 * POST /api/admin/portfolio-lab/create-sim-order
 *
 * Manual ad-hoc SIMULATED order entry. Sits alongside the auto path in
 * simulateArcaCycle for cases where the operator wants to model a setup
 * that ARCA hasn't picked up yet. Everything is still paper — there is
 * no broker route. Position sizing and pre-trade risk caps are enforced
 * exactly as in the cycle.
 *
 *   body: {
 *     symbol: string,
 *     assetClass: "equity"|"crypto"|"commodity"|"options"|"futures",
 *     side: "LONG" | "SHORT",
 *     orderType?: "MARKET_SIM" | "LIMIT_SIM" | "STOP_SIM",  // default LIMIT_SIM
 *     entry: number,        // becomes triggerPrice for LIMIT_SIM/STOP_SIM
 *     stop: number,
 *     takeProfit1?: number,
 *     takeProfit2?: number,
 *     takeProfit3?: number,
 *     riskPctOverride?: number,   // optional, capped at maxSingleTradeRiskPct
 *     playbookId?: string,
 *     reason?: string,
 *     sourceEdgePacketId?: string,
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import {
  getDefaultPortfolio,
} from "@/lib/admin/portfolio-lab/portfolioStore";
import { createSimulatedOrder } from "@/lib/admin/portfolio-lab/simulatedOrderEngine";
import { sizeForPortfolio } from "@/lib/admin/portfolio-lab/positionSizing";
import { checkPreTrade } from "@/lib/admin/portfolio-lab/riskEngine";
import { writeJournal } from "@/lib/admin/portfolio-lab/journalEngine";
import { ARCA_DEFAULT_PORTFOLIO_NAME } from "@/lib/admin/portfolio-lab/constants";
import type {
  ArcaAssetClass,
  SimOrderType,
} from "@/lib/admin/portfolio-lab/types";

export const runtime = "nodejs";

const VALID_ASSETS: ArcaAssetClass[] = ["equity", "crypto", "commodity", "options", "futures"];
const VALID_TYPES: SimOrderType[] = ["MARKET_SIM", "LIMIT_SIM", "STOP_SIM"];

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    symbol?: string;
    assetClass?: string;
    side?: "LONG" | "SHORT";
    orderType?: SimOrderType;
    entry?: number;
    stop?: number;
    takeProfit1?: number;
    takeProfit2?: number;
    takeProfit3?: number;
    riskPctOverride?: number;
    playbookId?: string;
    reason?: string;
    sourceEdgePacketId?: string;
  };

  // ── input validation ──
  const errs: string[] = [];
  if (!body.symbol || typeof body.symbol !== "string") errs.push("symbol required");
  if (!body.assetClass || !VALID_ASSETS.includes(body.assetClass as ArcaAssetClass)) {
    errs.push(`assetClass must be one of ${VALID_ASSETS.join(", ")}`);
  }
  if (body.side !== "LONG" && body.side !== "SHORT") errs.push("side must be LONG or SHORT");
  if (!Number.isFinite(body.entry) || (body.entry as number) <= 0) errs.push("entry must be > 0");
  if (!Number.isFinite(body.stop) || (body.stop as number) <= 0) errs.push("stop must be > 0");
  const orderType = body.orderType ?? "LIMIT_SIM";
  if (!VALID_TYPES.includes(orderType)) errs.push(`orderType must be one of ${VALID_TYPES.join(", ")}`);
  if (errs.length > 0) return NextResponse.json({ error: "Invalid input", violations: errs }, { status: 400 });

  const portfolio = await getDefaultPortfolio(admin.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) return NextResponse.json({ error: "No ARCA portfolio" }, { status: 404 });

  const assetClass = body.assetClass as ArcaAssetClass;
  const sizing = sizeForPortfolio(portfolio, {
    entry: body.entry!,
    stop: body.stop!,
    side: body.side!,
    assetClass,
    riskPctOverride: body.riskPctOverride,
  });
  if (!sizing.ok) {
    await writeJournal({
      workspaceId: admin.workspaceId,
      portfolioId: portfolio.id,
      journalType: "REJECTED",
      title: `Manual sim order REJECTED ${body.symbol} — sizing_${sizing.reason ?? "failed"}`,
      symbol: body.symbol!,
      reasoning: body.reason || `Manual order rejected at sizing: ${sizing.reason ?? "unknown"}`,
    });
    return NextResponse.json({ error: "sizing_failed", reason: sizing.reason }, { status: 422 });
  }

  const pre = await checkPreTrade({
    portfolio,
    assetClass,
    riskDollars: sizing.riskDollars,
    notional: sizing.notional,
  });
  if (!pre.ok) {
    await writeJournal({
      workspaceId: admin.workspaceId,
      portfolioId: portfolio.id,
      journalType: "RISK_BLOCK",
      title: `Manual sim order BLOCKED ${body.symbol} — ${pre.reasons.join("|")}`,
      symbol: body.symbol!,
      reasoning: `Pre-trade risk check failed: ${pre.reasons.join(", ")}`,
    });
    return NextResponse.json({ error: "risk_blocked", reasons: pre.reasons, warnings: pre.warnings }, { status: 409 });
  }

  const order = await createSimulatedOrder({
    portfolio,
    symbol: body.symbol!,
    assetClass,
    side: body.side!,
    orderType,
    plannedEntry: body.entry!,
    triggerPrice: orderType === "MARKET_SIM" ? null : body.entry!,
    quantity: sizing.quantity,
    notional: sizing.notional,
    stopLoss: body.stop!,
    takeProfit1: body.takeProfit1 ?? null,
    takeProfit2: body.takeProfit2 ?? null,
    takeProfit3: body.takeProfit3 ?? null,
    sourceEdgePacketId: body.sourceEdgePacketId ?? null,
    playbookId: body.playbookId ?? null,
    createdReason: body.reason || `manual_sim_order via admin`,
    arcaConfidence: null,
  });

  return NextResponse.json(
    wrapTruth(
      {
        order,
        sizing,
        warnings: pre.warnings,
      },
      {
        source: "arca:create-sim-order",
        simulated: true,
        freshness: "real-time",
        confidence: "high",
        confidenceReason: "Manual sim order; sized and risk-checked exactly as in cycle.",
      },
    ),
  );
}
