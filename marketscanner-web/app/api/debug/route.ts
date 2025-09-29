import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, source: "Next.js API debug", ts: new Date().toISOString() });
}
