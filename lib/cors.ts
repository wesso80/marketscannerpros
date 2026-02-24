import { NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://marketscannerpros.app',
  'https://www.marketscannerpros.app',
  'https://app.marketscannerpros.app',
];

if (process.env.NODE_ENV === 'development') {
  ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:3001');
}

/**
 * Attach standard CORS headers to a NextResponse.
 */
export function withCors(
  res: NextResponse,
  origin?: string | null,
): NextResponse {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.headers.set('Access-Control-Allow-Origin', allowed);
  res.headers.set('Access-Control-Allow-Credentials', 'true');
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret, x-cron-secret');
  return res;
}

/**
 * Helper to create an OPTIONS preflight response.
 */
export function corsOptions(origin?: string | null): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }), origin);
}
