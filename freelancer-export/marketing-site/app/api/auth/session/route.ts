// app/api/auth/session/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

const ALLOWED = new Set([
  "https://app.marketscannerpros.app",
  "https://marketscannerpros.app",
  "https://www.marketscannerpros.app",
]);

function cors(origin: string | null) {
  const o = origin && ALLOWED.has(origin) ? origin : "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (o) {
    h["Access-Control-Allow-Origin"] = o;
    h["Access-Control-Allow-Credentials"] = "true";
  }
  return h;
}

export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const token = cookies().get("ms_auth")?.value; // <-- no await

  try {
    if (!token) {
      const res = NextResponse.json({ authenticated: false, tier: "free" }, { status: 200 });
      Object.entries(cors(origin)).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    }

    const payload = verifyToken(token) as { tier: string; workspaceId: string } | null;
    if (!payload) {
      const res = NextResponse.json({ authenticated: false, tier: "free" }, { status: 200 });
      Object.entries(cors(origin)).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    }

    const res = NextResponse.json({
      authenticated: true,
      tier: payload.tier,
      workspaceId: payload.workspaceId,
    });
    Object.entries(cors(origin)).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  } catch {
    const res = NextResponse.json({ authenticated: false, tier: "free" }, { status: 401 });
    Object.entries(cors(origin)).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req.headers.get("origin")) });
}
