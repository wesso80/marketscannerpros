/**
 * app/api/admin/regime-matrix/route.ts
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { listRegimeMatrix, upsertRegimeMatrix } from "@/lib/admin/arca-brain/regimePlaybookMatrix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, matrix: await listRegimeMatrix(auth.workspaceId) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body?.regime) return NextResponse.json({ error: "regime required" }, { status: 400 });
  const row = await upsertRegimeMatrix({
    workspaceId: auth.workspaceId,
    regime: String(body.regime),
    enabledPlaybooks: Array.isArray(body.enabledPlaybooks) ? body.enabledPlaybooks.map(String) : [],
    reducedSizePlaybooks: Array.isArray(body.reducedSizePlaybooks) ? body.reducedSizePlaybooks.map(String) : [],
    disabledPlaybooks: Array.isArray(body.disabledPlaybooks) ? body.disabledPlaybooks.map(String) : [],
    preferredAssetClasses: Array.isArray(body.preferredAssetClasses) ? body.preferredAssetClasses.map(String) : [],
    avoidedAssetClasses: Array.isArray(body.avoidedAssetClasses) ? body.avoidedAssetClasses.map(String) : [],
    requiredConfirmations: Array.isArray(body.requiredConfirmations) ? body.requiredConfirmations.map(String) : [],
    notes: body.notes ? String(body.notes) : null,
    updatedBy: auth.cid ?? "admin",
  });
  return NextResponse.json({ ok: true, row });
}
