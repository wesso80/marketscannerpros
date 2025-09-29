import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // <-- adjust if your auth options live elsewhere
import { sendAlertEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    // Must be authenticated
    const session = await getServerSession(authOptions as any);
    const userEmail = session?.user?.email?.toString().trim();

    if (!userEmail) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Pull non-sensitive content only; ignore any 'to' sent by client
    const { subject, html } = await req.json().catch(() => ({} as any));

    const safeSubject =
      (subject?.toString() || "MarketScanner Pros Alert").slice(0, 140);
    const safeHtml = (html?.toString() || "").slice(0, 10000);

    if (!safeHtml) {
      return NextResponse.json({ error: "Missing html" }, { status: 400 });
    }

    // No logging of recipient; no persistence
    const res = await sendAlertEmail({
      to: userEmail,
      subject: safeSubject,
      html: safeHtml,
    });

    return NextResponse.json({ ok: true, id: (res as any)?.id ?? null });
  } catch (err) {
    // Avoid leaking addresses in logs
    console.error("alerts/send error");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
