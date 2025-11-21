import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ ok: true, env: {
    EMAIL_FROM: process.env.EMAIL_FROM ? "set" : "missing",
    RESEND_API_KEY: process.env.RESEND_API_KEY ? "set" : "missing",
  }});
}
