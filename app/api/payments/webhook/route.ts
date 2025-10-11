import { NextResponse } from "next/server";
import { setSubscription, upsertCustomer } from "@/lib/db";
import type { Tier, Status } from "@/lib/db";

// TODO: Verify Paddle signature in production
export async function POST(req: Request) {
  try {
    const ev = await req.json();
    const wid = String(ev.workspaceId || "");
    
    if (!wid) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });
    }

    await upsertCustomer(wid, ev.paddleCustomerId);
    await setSubscription(
      wid,
      (ev.tier ?? "free") as Tier,
      (ev.status ?? "inactive") as Status,
      ev.currentPeriodEnd ? new Date(ev.currentPeriodEnd) : undefined,
      ev.paddleSubscriptionId
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Webhook error:", e);
    return NextResponse.json({ error: e.message || "webhook failed" }, { status: 500 });
  }
}
