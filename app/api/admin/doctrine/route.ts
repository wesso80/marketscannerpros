/**
 * app/api/admin/doctrine/route.ts — list / create doctrine rules.
 * Admin-only. No public exposure.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { createDoctrineRule, listDoctrineRules } from "@/lib/admin/arca-brain/doctrineEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const rules = await listDoctrineRules({
    workspaceId: auth.workspaceId,
    status: status as never,
    category,
  });
  return NextResponse.json({ ok: true, rules });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (!body?.name || !body?.ruleText || !body?.category) {
    return NextResponse.json({ error: "name, category, and ruleText are required" }, { status: 400 });
  }
  const rule = await createDoctrineRule({
    workspaceId: auth.workspaceId,
    name: String(body.name),
    category: String(body.category),
    ruleText: String(body.ruleText),
    appliesToPlaybooks: Array.isArray(body.appliesToPlaybooks) ? body.appliesToPlaybooks.map(String) : [],
    appliesToAssetClasses: Array.isArray(body.appliesToAssetClasses) ? body.appliesToAssetClasses.map(String) : [],
    status: body.status,
    evidenceConfidence: body.evidenceConfidence,
    bradApprovalRequired: body.bradApprovalRequired !== false,
    arcaReasoning: body.arcaReasoning ? String(body.arcaReasoning) : undefined,
  });
  return NextResponse.json({ ok: true, rule });
}
