import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const SECRET = process.env.TRADINGVIEW_WEBHOOK_SECRET || process.env.SECRET;
    
    if (!SECRET) {
      return NextResponse.json({ 
        error: "Server not configured - add SECRET to environment variables" 
      }, { status: 500 });
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
    const baseUrl = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const alertUrl = `${protocol}://${baseUrl}/api/ai-scanner/alert`;

    const response = await fetch(alertUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });

    const result = await response.json();

    return NextResponse.json({
      test: "complete",
      alertResponse: result,
      status: response.status,
      testPayload
    });

  } catch (error: any) {
    return NextResponse.json({ 
      error: error?.message || "Test failed" 
    }, { status: 500 });
  }
}
