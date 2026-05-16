/**
 * app/api/admin/info-edge/route.ts — score and persist an Information Edge value.
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { scoreInformationEdge } from "@/lib/admin/arca-brain/informationEdge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const required = ["packetId", "symbol", "inputs"];
  for (const k of required) {
    if (!(k in (body ?? {}))) {
      return NextResponse.json({ error: `${k} required` }, { status: 400 });
    }
  }
  const score = await scoreInformationEdge({
    workspaceId: auth.workspaceId,
    packetId: String(body.packetId),
    symbol: String(body.symbol),
    playbookId: body.playbookId ?? null,
    inputs: body.inputs,
  });
  return NextResponse.json({ ok: true, score });
}
