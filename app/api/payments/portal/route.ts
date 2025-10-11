import { NextResponse } from "next/server";
import { createPortal } from "@/lib/payments";
import { getCustomer } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const wid = String(b.workspaceId || "");
    
    if (!wid) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });
    }

    const customer = await getCustomer(wid);
    
    if (!customer?.stripe_customer_id) {
      return NextResponse.json({ error: "No active subscription" }, { status: 404 });
    }

    const { url } = await createPortal({
      customerId: customer.stripe_customer_id,
      returnUrl: process.env.PORTAL_RETURN_URL || `${process.env.NEXT_PUBLIC_APP_URL}/account?wid=${wid}`
    });

    return NextResponse.json({ url });
  } catch (e: any) {
    console.error("Portal error:", e);
    return NextResponse.json({ error: e.message || "portal failed" }, { status: 500 });
  }
}
