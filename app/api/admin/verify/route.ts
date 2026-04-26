import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminSessionCookieOptions,
  verifyAdminAuth,
  verifyAdminRequest,
} from '@/lib/adminAuth';

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, source: auth.source });
  if (auth.source === 'admin_secret') {
    res.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(), getAdminSessionCookieOptions(req));
  }
  return res;
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, source: 'admin_secret' });
  res.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(), getAdminSessionCookieOptions(req));
  return res;
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  const options = getAdminSessionCookieOptions(req);
  res.cookies.set(ADMIN_SESSION_COOKIE, '', { ...options, maxAge: 0 });
  return res;
}
