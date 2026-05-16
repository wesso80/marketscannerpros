/**
 * GET  /api/admin/portfolio-lab/orders   → list (optional ?status=PLANNED,WAITING_FOR_TRIGGER)
 * POST /api/admin/portfolio-lab/orders   → cancel an order
 *   body: { orderId: string, reason?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import {
  getDefaultPortfolio,
  listOrders,
} from "@/lib/admin/portfolio-lab/portfolioStore";
import { cancelOrder } from "@/lib/admin/portfolio-lab/simulatedOrderEngine";
import { ARCA_DEFAULT_PORTFOLIO_NAME } from "@/lib/admin/portfolio-lab/constants";
import type { SimOrderStatus } from "@/lib/admin/portfolio-lab/types";

export const runtime = "nodejs";

const VALID_STATUSES: SimOrderStatus[] = [
  "PLANNED",
  "WAITING_FOR_TRIGGER",
  "TRIGGERED",
  "FILLED_SIM",
  "CANCELLED",
  "EXPIRED",
  "INVALIDATED_BEFORE_FILL",
];

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const portfolio = await getDefaultPortfolio(admin.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) return NextResponse.json(wrapTruth({ orders: [] }, { source: "arca:orders", simulated: true }));

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const status: SimOrderStatus[] | undefined = statusParam
    ? statusParam.split(",").map((s) => s.trim() as SimOrderStatus).filter((s) => VALID_STATUSES.includes(s))
    : undefined;

  const orders = await listOrders(admin.workspaceId, portfolio.id, { status, limit: 200 });
  return NextResponse.json(
    wrapTruth({ orders }, { source: "arca:orders", simulated: true, freshness: "real-time", confidence: "high" }),
  );
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { orderId?: string; reason?: string };
  if (!body.orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const portfolio = await getDefaultPortfolio(admin.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) return NextResponse.json({ error: "No ARCA portfolio" }, { status: 404 });

  const all = await listOrders(admin.workspaceId, portfolio.id, { limit: 500 });
  const order = all.find((o) => o.id === body.orderId);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status === "FILLED_SIM" || order.status === "CANCELLED") {
    return NextResponse.json({ error: `Cannot cancel order in status ${order.status}` }, { status: 409 });
  }

  await cancelOrder({ portfolio, order, reason: body.reason || "manual_cancel" });
  return NextResponse.json(
    wrapTruth({ ok: true, orderId: body.orderId }, { source: "arca:orders:cancel", simulated: true, freshness: "real-time", confidence: "high" }),
  );
}
