import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionCookieOptions, ADMIN_SESSION_COOKIE, verifyAdminRequest } from '@/lib/adminAuth';
import { retiredRouteResponse } from '@/lib/api/retiredRoute';

// Session check for the admin layout. Admin access comes from the admin session cookie (set by /admin/login) or an
// admin app session. The legacy admin-secret login is retired: a secret header no longer counts here and no longer
// mints an ms_admin cookie (middleware already refused cookie-free /api/admin calls, so it could not be used).
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.ok || auth.source === 'admin_secret') {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, source: auth.source });
}

export async function POST() {
  return retiredRouteResponse();
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  const options = getAdminSessionCookieOptions(req);
  res.cookies.set(ADMIN_SESSION_COOKIE, '', { ...options, maxAge: 0 });
  return res;
}
