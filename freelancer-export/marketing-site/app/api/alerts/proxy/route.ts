import { NextResponse } from "next/server";
import { sendAlertEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const { to, subject, html } = await req.json();
    if (!to || !subject || !html) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    // server-side call; no shared secret needed
    const res = await sendAlertEmail({ to, subject, html });
    return NextResponse.json({ ok: true, id: (res as any)?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
