import { NextResponse } from "next/server";
import { sendAlertEmail } from "../../../../lib/email";

export async function POST(req: Request) {
  const key = req.headers.get("x-alerts-test-key");
  if (!key || key !== process.env.ALERTS_TEST_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { to, symbol = "BTCUSDT", price = "—" } = await req.json();
  if (!to) {
    return NextResponse.json({ error: "`to` email required" }, { status: 400 });
  }

  try {
    const r = await sendAlertEmail({
      to,
      subject: `📈 Test Alert for ${symbol}`,
      html: `<h2>MarketScanner Test</h2><p>Your alert for <b>${symbol}</b> would have triggered at <b>${price}</b>.</p>`,
    });
    // @ts-ignore
    return NextResponse.json({ ok: true, id: r?.data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Send failed" }, { status: 500 });
  }
}
