import { NextRequest, NextResponse } from "next/server";

/** Old /login URLs land on the sign-in page. Query values stay on /auth. */
export function GET(req: NextRequest) {
  const dest = req.nextUrl.clone();
  dest.pathname = "/auth";
  return NextResponse.redirect(dest, 308);
}
