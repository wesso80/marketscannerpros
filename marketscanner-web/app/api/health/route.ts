import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // avoid caches

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "MarketScanner Pros",
    env: process.env.NODE_ENV,
    vercel: {
      env: process.env.VERCEL_ENV,
      commit: process.env.VERCEL_GIT_COMMIT_SHA,
      url: process.env.VERCEL_URL,
    },
    ts: new Date().toISOString(),
  });
}
