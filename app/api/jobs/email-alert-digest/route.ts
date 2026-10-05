import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/adminAuth";
import { sendDueAlertDigests } from "@/lib/alerts/emailControls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Daily alert summary. Fired by the existing worker scheduler
 * (`daily-alert-digest` in lib/worker/schedule.ts) at 21:00 UTC,
 * which is 08:00 Sydney during AEDT and 07:00 during AEST.
 * Sends the previous Sydney day's queued alerts. No new Render service.
 */
export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const result = await sendDueAlertDigests();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[jobs:email-alert-digest]", err instanceof Error ? err.message : "digest failed");
    return NextResponse.json({ error: "Alert digest failed" }, { status: 500 });
  }
}
