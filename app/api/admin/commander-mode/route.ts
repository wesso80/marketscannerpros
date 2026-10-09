/**
 * app/api/admin/commander-mode/route.ts — Commander Mode aggregate.
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { buildCommanderSnapshot } from "@/lib/admin/arca-brain/commanderMode";

import { adminErrorText } from '@/lib/admin/errorResponse';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const snapshot = await buildCommanderSnapshot({ workspaceId: auth.workspaceId });
    return NextResponse.json({ ok: true, snapshot });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: adminErrorText(err, '/api/admin/commander-mode') },
      { status: 500 },
    );
  }
}
