import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

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

    // Store in database
    const query = `
      INSERT INTO tradingview_alerts (
        symbol, timeframe, side, price, alert_timestamp,
        ema9, ema21, ema50, ema200, rsi14,
        macd, macd_sig, macd_hist, atr14, vol_z
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, received_at
    `;

    const values = [
      payload.symbol,
      payload.tf,
      payload.side,
      payload.price,
      payload.time_ms,
      payload.features?.ema9,
      payload.features?.ema21,
      payload.features?.ema50,
      payload.features?.ema200,
      payload.features?.rsi14,
      payload.features?.macd,
      payload.features?.macd_sig,
      payload.features?.macd_hist,
      payload.features?.atr14,
      payload.features?.vol_z
    ];

    const result = await pool.query(query, values);
    const alertId = result.rows[0]?.id;

    console.log("[AI-SCANNER ALERT STORED]", {
      id: alertId,
      symbol: payload.symbol,
      timeframe: payload.tf,
      side: payload.side,
      price: payload.price
    });

    // TODO: Send push notification to user
    // TODO: Trigger email alert if user has alerts enabled

    return NextResponse.json({ 
      ok: true, 
      id: alertId,
      stored: {
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
