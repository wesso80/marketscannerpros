/**
 * app/api/admin/debates/route.ts — list recent adversarial debates.
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { listRecentDebates } from "@/lib/admin/arca-brain/adversarialDebate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? "50");
  const debates = await listRecentDebates(auth.workspaceId, Number.isFinite(limit) ? limit : 50);
  return NextResponse.json({ ok: true, debates });
}
