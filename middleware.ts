import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  // hard redirect ANY NextAuth sign-in URL to /signin
  if (url.pathname.startsWith("/api/auth/signin")) {
    url.pathname = "/signin";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };
