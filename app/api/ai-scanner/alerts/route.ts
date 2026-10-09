import { NextResponse } from "next/server";
import { Pool } from "pg";
import { requireAdmin } from "@/lib/adminAuth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false
});

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
const MAX_LIMIT = 200;

/** Stored TradingView alerts (side, price, indicator features) are private: admin session, operator or admin secret only. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  try {
    const { searchParams } = new URL(req.url);
    const requested = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_LIMIT) : 50;
    const symbol = searchParams.get('symbol');

    let query = `
      SELECT 
        id, symbol, timeframe, side, price, alert_timestamp,
        received_at, ema9, ema21, ema50, ema200, rsi14,
        macd, macd_sig, macd_hist, atr14, vol_z
      FROM tradingview_alerts
    `;

    const params: any[] = [];
    
    if (symbol) {
      query += ` WHERE symbol = $1`;
      params.push(symbol);
      query += ` ORDER BY received_at DESC LIMIT $2`;
      params.push(limit);
    } else {
      query += ` ORDER BY received_at DESC LIMIT $1`;
      params.push(limit);
    }

    const result = await pool.query(query, params);

    return NextResponse.json({
      ok: true,
      count: result.rows.length,
      alerts: result.rows.map(row => ({
        id: row.id,
        symbol: row.symbol,
        timeframe: row.timeframe,
        side: row.side,
        price: parseFloat(row.price),
        alertTime: new Date(parseInt(row.alert_timestamp)).toISOString(),
        receivedAt: row.received_at,
        features: {
          ema9: row.ema9 ? parseFloat(row.ema9) : null,
          ema21: row.ema21 ? parseFloat(row.ema21) : null,
          ema50: row.ema50 ? parseFloat(row.ema50) : null,
          ema200: row.ema200 ? parseFloat(row.ema200) : null,
          rsi14: row.rsi14 ? parseFloat(row.rsi14) : null,
          macd: row.macd ? parseFloat(row.macd) : null,
          macd_sig: row.macd_sig ? parseFloat(row.macd_sig) : null,
          macd_hist: row.macd_hist ? parseFloat(row.macd_hist) : null,
          atr14: row.atr14 ? parseFloat(row.atr14) : null,
          vol_z: row.vol_z ? parseFloat(row.vol_z) : null
        }
      }))
    }, { headers: PRIVATE_HEADERS });

  } catch (error: any) {
    console.error("[AI-SCANNER ALERTS ERROR]", error);
    return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
