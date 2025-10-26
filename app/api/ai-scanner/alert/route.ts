import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // simple shared-secret check
    if (body?.secret !== process.env.AI_SECRET) {
      return NextResponse.json({ ok: false, error: "bad secret" }, { status: 401 });
    }

    // do whatever you want with the payload here
    console.log("Alert received:", body);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
}

export async function GET() {
  // health check
  return NextResponse.json({ ok: true });
}
