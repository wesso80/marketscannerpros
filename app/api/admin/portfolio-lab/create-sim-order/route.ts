/**
 * POST /api/admin/portfolio-lab/create-sim-order
 *
 * Manual ad-hoc SIMULATED order entry. Sits alongside the auto path in
 * simulateArcaCycle for cases where the operator wants to model a setup
 * that ARCA hasn't picked up yet. Everything is still paper — there is
 * no broker route. Position sizing and pre-trade risk caps are enforced
 * exactly as in the cycle.
 *
 *   Idempotency-Key: a stable unique key per intended order (16–128 characters).
 *   Retry an uncertain result with the same key and body.
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
import { getPortfolioById, } from "@/lib/admin/portfolio-lab/portfolioStore";
import { createSimulatedOrder } from "@/lib/admin/portfolio-lab/simulatedOrderEngine";
import { sizeForPortfolio } from "@/lib/admin/portfolio-lab/positionSizing";
import { checkPreTrade } from "@/lib/admin/portfolio-lab/riskEngine";
import { writeJournal } from "@/lib/admin/portfolio-lab/journalEngine";
import { ARCA_DEFAULT_PORTFOLIO_NAME } from "@/lib/admin/portfolio-lab/constants";
import type { ArcaAssetClass, SimOrderType, } from "@/lib/admin/portfolio-lab/types";
import { q } from '@/lib/db';
import { manualOrderRequest } from '@/lib/admin/portfolio-lab/manualOrderRequest';
import { validAdminMutationOrigin } from '@/lib/admin/mutationOrigin';
export const runtime = "nodejs";
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' };
const VALID_ASSETS: ArcaAssetClass[] = ["equity", "crypto", "commodity", "options", "futures"];
const VALID_TYPES: SimOrderType[] = ["MARKET_SIM", "LIMIT_SIM", "STOP_SIM"];
export async function POST(req: NextRequest) {
    const admin = await requireAdmin(req);
    if (!admin.ok || !admin.workspaceId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403, headers });
    }
    const workspaceId = admin.workspaceId;
    if (!validAdminMutationOrigin(req.headers.get('origin'), req.nextUrl.origin))
        return NextResponse.json({ error: 'Origin rejected' }, { status: 403, headers });
    const requestKey = req.headers.get('idempotency-key') ?? '';
    if (!/^[A-Za-z0-9_.:-]{16,128}$/.test(requestKey))
        return NextResponse.json({ error: 'Idempotency-Key required (16–128 letters, digits, dot, dash, underscore or colon)' }, { status: 400, headers });
    const parsed = await req.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return NextResponse.json({ error: 'JSON object required' }, { status: 400, headers });
    const body = parsed as {
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
    if (!body.symbol || typeof body.symbol !== "string")
        errs.push("symbol required");
    if (!body.assetClass || !VALID_ASSETS.includes(body.assetClass as ArcaAssetClass)) {
        errs.push(`assetClass must be one of ${VALID_ASSETS.join(", ")}`);
    }
    if (body.side !== "LONG" && body.side !== "SHORT")
        errs.push("side must be LONG or SHORT");
    if (!Number.isFinite(body.entry) || (body.entry as number) <= 0)
        errs.push("entry must be > 0");
    if (!Number.isFinite(body.stop) || (body.stop as number) <= 0)
        errs.push("stop must be > 0");
    const orderType = body.orderType ?? "LIMIT_SIM";
    if (!VALID_TYPES.includes(orderType))
        errs.push(`orderType must be one of ${VALID_TYPES.join(", ")}`);
    for (const field of ['takeProfit1', 'takeProfit2', 'takeProfit3', 'riskPctOverride'] as const) {
        if (body[field] != null && (!Number.isFinite(body[field]) || body[field]! <= 0))
            errs.push(`${field} must be > 0`);
    }
    for (const field of ['symbol', 'reason', 'playbookId', 'sourceEdgePacketId'] as const) {
        if (body[field] != null && (typeof body[field] !== 'string' || body[field]!.length > 2000))
            errs.push(`${field} must be a bounded string`);
    }
    if (errs.length > 0)
        return NextResponse.json({ error: "Invalid input", violations: errs }, { status: 400, headers });
    const canonical = Object.fromEntries(['symbol', 'assetClass', 'side', 'entry', 'stop', 'takeProfit1', 'takeProfit2', 'takeProfit3', 'riskPctOverride', 'playbookId', 'reason', 'sourceEdgePacketId'].map(field => [field, parsed[field] ?? null]));
    canonical.orderType = orderType;
    try {
        const result = await manualOrderRequest(workspaceId, requestKey, canonical, async () => {
            const [locked] = await q<{
                id: string;
            }>("SELECT id FROM arca_portfolios WHERE workspace_id=$1 AND name=$2 AND mode='SIMULATED' AND status IN ('ACTIVE','PAUSED') FOR UPDATE", [workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME]);
            if (!locked)
                return { status: 404, body: { error: 'No current simulated ARCA portfolio' } };
            const portfolio = await getPortfolioById(workspaceId, locked.id);
            if (!portfolio || portfolio.mode !== 'SIMULATED')
                return { status: 409, body: { error: 'Current simulated portfolio unavailable' } };
            // loadCapacity (used by sizing) reads at most 200 pending orders. Fail closed beyond that bound.
            const [pending] = await q<{
                count: string;
            }>("SELECT COUNT(*)::text AS count FROM arca_simulated_orders WHERE workspace_id=$1 AND portfolio_id=$2 AND status IN ('PLANNED','WAITING_FOR_TRIGGER','TRIGGERED')", [workspaceId, portfolio.id]);
            if (!pending || Number(pending.count) > 200)
                return { status: 409, body: { error: 'Pending order capacity requires review' } };
            const assetClass = body.assetClass as ArcaAssetClass;
            const sizing = await sizeForPortfolio(portfolio, {
                entry: body.entry!,
                stop: body.stop!,
                side: body.side!,
                assetClass,
                riskPctOverride: body.riskPctOverride,
            });
            if (!sizing.ok) {
                await writeJournal({
                    workspaceId,
                    portfolioId: portfolio.id,
                    journalType: "REJECTED",
                    title: `Manual sim order REJECTED ${body.symbol} — sizing_${sizing.reason ?? "failed"}`,
                    symbol: body.symbol!,
                    reasoning: body.reason || `Manual order rejected at sizing: ${sizing.reason ?? "unknown"}`,
                });
                return { status: 422, body: { error: "sizing_failed", reason: sizing.reason } };
            }
            const pre = await checkPreTrade({
                portfolio,
                assetClass,
                riskDollars: sizing.riskDollars,
                notional: sizing.notional,
            });
            if (!pre.ok) {
                await writeJournal({
                    workspaceId,
                    portfolioId: portfolio.id,
                    journalType: "RISK_BLOCK",
                    title: `Manual sim order BLOCKED ${body.symbol} — ${pre.reasons.join("|")}`,
                    symbol: body.symbol!,
                    reasoning: `Pre-trade risk check failed: ${pre.reasons.join(", ")}`,
                });
                return { status: 409, body: { error: "risk_blocked", reasons: pre.reasons, warnings: pre.warnings } };
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
            return { status: 200, body: wrapTruth({
                    order,
                    sizing,
                    warnings: pre.warnings,
                }, {
                    source: "arca:create-sim-order",
                    simulated: true,
                    freshness: "real-time",
                    confidence: "high",
                    confidenceReason: "Manual sim order; sized and risk-checked exactly as in cycle.",
                }) };
        });
        return NextResponse.json(result.body, { status: result.status, headers: { ...headers, 'Idempotency-Replayed': String(result.replayed) } });
    }
    catch {
        return NextResponse.json({ error: 'Manual order outcome unavailable. Retry with the same Idempotency-Key to retrieve any committed result.' }, { status: 503, headers });
    }
}
