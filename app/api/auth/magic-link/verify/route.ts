import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : "";

    if (!token) {
      return NextResponse.json({ error: "Missing token." }, { status: 400 });
    }

    const payload = verifyToken(token) as { purpose?: string; email?: string };
    if (payload?.purpose !== "magic_login" || !payload?.email) {
      return NextResponse.json({ error: "Invalid sign-in link." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, email: payload.email });
  } catch {
    return NextResponse.json({ error: "Sign-in link is invalid or expired." }, { status: 400 });
  }
}
