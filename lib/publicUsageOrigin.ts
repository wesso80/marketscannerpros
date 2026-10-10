import type { NextRequest } from 'next/server';

const PUBLIC_SITE_ORIGINS = [
  'https://marketscannerpros.app',
  'https://www.marketscannerpros.app',
] as const;

const SITE_URL_ENV_KEYS = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_BASE_URL',
  'WEB_URL',
  'RENDER_EXTERNAL_URL',
] as const;

function firstHeader(value: string | null): string | null {
  const item = value?.split(',')[0]?.trim() ?? '';
  return item || null;
}

function exactHttpOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  return url.origin;
}

function allowedOrigins(): Set<string> {
  const allowed = new Set<string>(PUBLIC_SITE_ORIGINS);
  for (const key of SITE_URL_ENV_KEYS) {
    const origin = exactHttpOrigin(process.env[key]);
    if (origin) allowed.add(origin);
  }
  return allowed;
}

function browserOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (origin !== null) return exactHttpOrigin(origin);
  return exactHttpOrigin(request.headers.get('referer'));
}

function builtPublicOrigin(request: NextRequest, host: string): string | null {
  const proto = (firstHeader(request.headers.get('x-forwarded-proto')) || request.nextUrl.protocol.replace(/:$/, '')).toLowerCase();
  if (proto !== 'http' && proto !== 'https') return null;
  if (!host || /[\s/@\\]/.test(host)) return null;
  return exactHttpOrigin(`${proto}://${host}`);
}

/**
 * Render's nextUrl is the internal bind address. The browser Origin, or Referer
 * when Origin is absent, must exactly equal the public origin or the site allowlist.
 * x-forwarded-host and a Host that disagrees with nextUrl do not widen trust.
 */
export function acceptedPublicOrigin(request: NextRequest): string | null {
  const browser = browserOrigin(request);
  if (!browser) return null;
  const allowed = allowedOrigins();
  const forwardedHost = firstHeader(request.headers.get('x-forwarded-host'));
  const hostHeader = firstHeader(request.headers.get('host'));
  const host = forwardedHost || hostHeader || request.nextUrl.host;
  const built = builtPublicOrigin(request, host);
  const directHost = !forwardedHost && (!hostHeader || hostHeader === request.nextUrl.host);
  if (built && browser === built && (directHost || allowed.has(built))) return browser;
  if (allowed.has(browser)) return browser;
  return null;
}
