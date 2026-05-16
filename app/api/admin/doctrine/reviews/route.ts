/**
 * app/api/admin/doctrine/reviews/route.ts — propose / approve reviews.
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  approveDoctrineReview,
  listDoctrineReviews,
  proposeDoctrineReview,
} from "@/lib/admin/arca-brain/doctrineEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const ruleId = url.searchParams.get("ruleId") ?? undefined;
  const reviews = await listDoctrineReviews(auth.workspaceId, ruleId ?? undefined);
  return NextResponse.json({ ok: true, reviews });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));

  if (body?.action === "approve") {
    if (!body?.reviewId) {
      return NextResponse.json({ error: "reviewId required" }, { status: 400 });
    }
    const review = await approveDoctrineReview({
      workspaceId: auth.workspaceId,
      reviewId: String(body.reviewId),
      approvedBy: auth.cid ?? "admin",
    });
    return NextResponse.json({ ok: true, review });
  }

  // Default: propose
  if (!body?.ruleId || !body?.reviewType || !body?.proposedAction || !body?.finding || !body?.arcaReasoning) {
    return NextResponse.json(
      { error: "ruleId, reviewType, proposedAction, finding, arcaReasoning required" },
      { status: 400 },
    );
  }
  const review = await proposeDoctrineReview({
    workspaceId: auth.workspaceId,
    ruleId: String(body.ruleId),
    reviewType: body.reviewType,
    proposedAction: body.proposedAction,
    finding: String(body.finding),
    arcaReasoning: String(body.arcaReasoning),
    newRuleText: body.newRuleText ? String(body.newRuleText) : undefined,
    evidenceJson: body.evidenceJson ?? {},
  });
  return NextResponse.json({ ok: true, review });
}
