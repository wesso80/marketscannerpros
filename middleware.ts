import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const APP_SIGNING_SECRET = process.env.APP_SIGNING_SECRET!;

// Use Web Crypto API (Edge Runtime compatible)
async function hmacSha256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function verify(token: string) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmacSha256(APP_SIGNING_SECRET, body);
  if (sig !== expected) return null;
  const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload as { cid: string; tier: string; workspaceId: string; exp: number };
}

async function signToken(payload: object) {
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const sig = await hmacSha256(APP_SIGNING_SECRET, body);
  return `${body}.${sig}`;
}

export async function middleware(req: NextRequest) {
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
