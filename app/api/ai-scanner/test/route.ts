import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };

/**
 * Sends one synthetic alert through /api/ai-scanner/alert to check the webhook. Admin only: it signs the request with
 * the server's webhook secret and writes a row. The secret is never returned in the response.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  try {
    const SECRET = process.env.TRADINGVIEW_WEBHOOK_SECRET || process.env.SECRET;
    
    if (!SECRET) {
      return NextResponse.json({ 
        error: "Server not configured - add SECRET to environment variables" 
      }, { status: 500, headers: PRIVATE_HEADERS });
    }

    // Test payload
    const testPayload = {
      secret: SECRET,
      symbol: "BTC-USD",
      tf: "1h",
      time_ms: Date.now(),
      price: 42000.50,
      side: "LONG",
      features: {
        ema9: 41950,
        ema21: 41800,
        ema50: 41500,
        ema200: 40000,
        rsi14: 65.5,
        macd: 150,
        macd_sig: 120,
        macd_hist: 30,
        atr14: 500,
        vol_z: 1.5
      }
    };

    // Call the alert endpoint
    // Use APP_BASE_URL env var so the protocol is not sourced from the (potentially spoofed) request.
    const baseUrl = process.env.APP_BASE_URL || `https://${req.headers.get('host')}`;
    const alertUrl = `${baseUrl}/api/ai-scanner/alert`;

    const response = await fetch(alertUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });

    const result = await response.json().catch(() => null);
    const { secret: _secret, ...sentPayload } = testPayload;

    return NextResponse.json({
      test: "complete",
      alertResponse: result,
      status: response.status,
      testPayload: sentPayload
    }, { headers: PRIVATE_HEADERS });

  } catch (error: any) {
    console.error("[AI-SCANNER TEST ERROR]", error);
    return NextResponse.json({ error: "Test failed" }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
