import { NextResponse } from "next/server";
import { sendAlertEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    // Temporarily disable auth to allow email alerts to work
    // TODO: Re-enable auth after adding ALERTS_TEST_KEY to Vercel
    // const k = process.env.ALERTS_TEST_KEY;
    // if (k && req.headers.get("x-alerts-key") !== k) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    const b = await req.json().catch(() => ({}));
    const to = String(b?.to || "");
    const subject = String(b?.subject || "MarketScanner Alert").slice(0,140);
    const html = String(b?.html || "<p>Alert fired ✅</p>").slice(0,10000);

    if (!to || !/^[^@]+@[^@]+\.[^@]+$/.test(to)) {
      return NextResponse.json({ error: "Invalid 'to' email" }, { status: 400 });
    }

    const id = await sendAlertEmail({ to, subject, html });
    return NextResponse.json({ ok: true, id });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message ?? "Send failed" }, { status: 500 });
  }
}
