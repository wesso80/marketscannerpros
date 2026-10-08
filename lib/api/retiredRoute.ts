import { NextResponse } from 'next/server';

/**
 * Response for a public API route that has been retired because it produced trade instructions (entries, stops,
 * targets, sizing, order proposals) and had no caller in the app. Access checks still run first, so a retired route
 * tells an unauthenticated caller nothing new. 410 Gone, private, no body detail.
 */
export function retiredRouteResponse(): NextResponse {
  return NextResponse.json(
    { error: 'This endpoint has been retired.', retired: true },
    { status: 410, headers: { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' } },
  );
}
