import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";

  // Only redirect the subdomain to Streamlit (preserve path + query)
  if (host.toLowerCase() === "app.marketscannerpros.app") {
    const url = new URL(req.url);
    const target = new URL(\`https://market-scanner-1-wesso80.replit.app\${url.pathname}\${url.search}\`);
    return NextResponse.redirect(target, 308);
  }

  return NextResponse.next();
}

// Match everything so we can catch the host early
export const config = {
  matcher: "/:path*",
};
