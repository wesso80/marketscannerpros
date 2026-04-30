import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { getAdminResearchPacket, getAdminResearchPacketsForSymbols } from "@/lib/admin/getAdminResearchPacket";

export const runtime = "nodejs";

async function authorize(req: NextRequest) {
  const adminAuth = await requireAdmin(req);
  if (adminAuth.ok) return true;
  const session = await getSessionFromCookie();
  return Boolean(session && isOperator(session.cid, session.workspaceId));
}

export async function GET(req: NextRequest) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const symbol = (req.nextUrl.searchParams.get("symbol") || "").trim().toUpperCase();
  const market = (req.nextUrl.searchParams.get("market") || "CRYPTO").toUpperCase();
  const timeframe = req.nextUrl.searchParams.get("timeframe") || "15m";
  const symbols = (req.nextUrl.searchParams.get("symbols") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbol) {
    const packet = await getAdminResearchPacket({ symbol, market, timeframe });
    return NextResponse.json({ ok: true, packet });
  }

  if (symbols.length > 0) {
    const packets = await getAdminResearchPacketsForSymbols({ symbols, market, timeframe });
    return NextResponse.json({ ok: true, packets });
  }

  return NextResponse.json({ error: "Provide symbol or symbols" }, { status: 400 });
}
