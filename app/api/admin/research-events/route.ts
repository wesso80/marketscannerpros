import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { appendResearchEvent, listResearchEvents, type ResearchEventType } from "@/lib/admin/researchEventTape";

export const runtime = "nodejs";

async function authorize(req: NextRequest): Promise<{ ok: boolean; workspaceId: string }> {
  const adminAuth = await requireAdmin(req);
  if (adminAuth.ok) return { ok: true, workspaceId: adminAuth.workspaceId || "admin" };
  const session = await getSessionFromCookie();
  if (!session || !isOperator(session.cid, session.workspaceId)) return { ok: false, workspaceId: "" };
  return { ok: true, workspaceId: session.workspaceId };
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const limit = Math.max(1, Math.min(500, Number(req.nextUrl.searchParams.get("limit") || 100)));
  const symbol = req.nextUrl.searchParams.get("symbol") || undefined;
  const eventType = (req.nextUrl.searchParams.get("eventType") || undefined) as ResearchEventType | undefined;

  const events = await listResearchEvents({
    workspaceId: auth.workspaceId,
    limit,
    symbol,
    eventType,
  });

  return NextResponse.json({ ok: true, events });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body?.eventType || !body?.message) {
    return NextResponse.json({ error: "eventType and message are required" }, { status: 400 });
  }

  await appendResearchEvent({
    workspaceId: auth.workspaceId,
    symbol: body.symbol || null,
    market: body.market || null,
    eventType: body.eventType,
    severity: body.severity || "INFO",
    message: String(body.message),
    payload: body.payload || {},
  });

  return NextResponse.json({ ok: true });
}
