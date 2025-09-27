import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "AAPL";
  const interval = req.nextUrl.searchParams.get("interval") ?? "1d";

  if (!process.env.MARKET_API_URL) {
    // mock data so UI works during setup
    return NextResponse.json([{ timestamp:"2024-09-27", open:100, high:110, low:95, close:108, volume:12345 }]);
  }

  const url = `${process.env.MARKET_API_URL}/api/ohlcv/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return NextResponse.json({ error: "Market API error" }, { status: 500 });
  return NextResponse.json(await res.json());
}
