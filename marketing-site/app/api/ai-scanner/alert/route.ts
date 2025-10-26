import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const SECRET = process.env.TRADINGVIEW_WEBHOOK_SECRET || process.env.SECRET;
    
    if (!SECRET) {
      return NextResponse.json({ 
        error: "Server not configured - SECRET env variable missing" 
      }, { status: 500 });
    }

    const payload = await req.json();
    
    // Verify secret
    if (!payload.secret || payload.secret !== SECRET) {
      return NextResponse.json({ 
        error: "Unauthorized - invalid secret" 
      }, { status: 401 });
    }

    // Log the alert (in production, you'd store this in DB or send notifications)
    console.log("[AI-SCANNER ALERT]", {
      symbol: payload.symbol,
      timeframe: payload.tf,
      side: payload.side,
      price: payload.price,
      timestamp: new Date(payload.time_ms).toISOString(),
      features: payload.features
    });

    // TODO: Store in database
    // TODO: Send push notification to user
    // TODO: Trigger email alert if user has alerts enabled

    return NextResponse.json({ 
      ok: true, 
      received: {
        symbol: payload.symbol,
        tf: payload.tf,
        side: payload.side,
        price: payload.price,
        timestamp: payload.time_ms
      }
    });

  } catch (error: any) {
    console.error("[AI-SCANNER ERROR]", error);
    return NextResponse.json({ 
      error: error?.message || "Invalid request" 
    }, { status: 400 });
  }
}
