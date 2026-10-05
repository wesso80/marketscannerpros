import { NextRequest, NextResponse } from "next/server";
import { setAlertEmailMode } from "@/lib/alerts/emailControls";
import { verifyAlertUnsubscribeToken } from "@/lib/alerts/emailPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, body: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin: 0; background: #0b1220; color: #e5e7eb; font-family: Arial, Helvetica, sans-serif; }
    main { max-width: 32rem; margin: 0 auto; padding: 32px 20px; }
    h1 { font-size: 1.25rem; margin: 0 0 12px; }
    p { line-height: 1.5; color: #cbd5e1; }
    button { min-height: 44px; padding: 10px 16px; border: 0; border-radius: 10px; background: #10b981; color: #06281f; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    ${body}
  </main>
</body>
</html>`;
  return new NextResponse(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("t") || "";
  const verified = verifyAlertUnsubscribeToken(token);
  if (!verified) {
    return page("Unsubscribe", "<p>This unsubscribe link is not valid.</p>");
  }
  const action = `/api/email/unsubscribe?t=${encodeURIComponent(token)}`;
  return page(
    "Unsubscribe from alert emails",
    `<p>This stops the daily alert summary and individual alert emails. It does not stop sign-in emails.</p>
     <form method="POST" action="${action}">
       <button type="submit">Unsubscribe</button>
     </form>`,
  );
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  let token = url.searchParams.get("t") || "";
  const raw = await req.text().catch(() => "");
  if (!token) {
    token = new URLSearchParams(raw).get("t") || "";
  }
  const verified = verifyAlertUnsubscribeToken(token);
  if (!verified) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const saved = await setAlertEmailMode(verified.userId, "off");
  if (saved === "missing") {
    return new NextResponse("Unsubscribe could not be saved yet. Try again later.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const oneClick = raw.includes("List-Unsubscribe=One-Click");
  if (oneClick) {
    return new NextResponse("Unsubscribed", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return page(
    "Unsubscribed",
    "<p>You are unsubscribed from alert emails and the daily summary. Sign-in emails will still arrive.</p>",
  );
}
