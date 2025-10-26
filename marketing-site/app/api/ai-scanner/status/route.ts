import { NextResponse } from "next/server";

export async function GET() {
  const features = [
    'ema9',
    'ema21', 
    'ema50',
    'ema200',
    'rsi14',
    'macd',
    'macd_sig',
    'macd_hist',
    'atr14',
    'vol_z'
  ];

  return NextResponse.json({
    ok: true,
    features,
    ts: Date.now(),
    endpoint: '/api/ai-scanner/alert'
  });
}
