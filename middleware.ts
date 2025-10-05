import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';

const APP_SIGNING_SECRET = process.env.APP_SIGNING_SECRET!;

function verify(token: string) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", APP_SIGNING_SECRET).update(body).digest("base64url");
  if (sig !== expected) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload as { cid: string; tier: string; workspaceId: string; exp: number };
}

function signToken(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", APP_SIGNING_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();

  // Handle subdomain redirect to Streamlit
  if (host === "app.marketscannerpros.app") {
    const url = new URL(req.url);
    const target = new URL("https://market-scanner-1-wesso80.replit.app" + url.pathname + url.search);
    return NextResponse.redirect(target, 308);
  }

  // Handle cookie refresh for authenticated users
  const cookie = req.cookies.get('ms_auth')?.value;
  
  if (cookie) {
    const session = verify(cookie);
    
    if (session) {
      // Check if cookie expires in less than 3 days - refresh it
      const daysUntilExpiry = (session.exp - Math.floor(Date.now() / 1000)) / (60 * 60 * 24);
      
      if (daysUntilExpiry < 3) {
        // Refresh the cookie with new 7-day expiry
        const newExp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
        const newToken = signToken({ 
          cid: session.cid, 
          tier: session.tier, 
          workspaceId: session.workspaceId, 
          exp: newExp 
        });
        
        const response = NextResponse.next();
        response.cookies.set("ms_auth", newToken, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 7,
        });
        
        return response;
      }
    }
  }

  return NextResponse.next();
}

// Match everything so we can catch the host and refresh cookies
export const config = {
  matcher: "/:path*",
};
