/**
 * PNG responses for the public share cards, with a small in-process cache so repeated fetches (Metricool, X's
 * crawler, retries) don't re-query the database or re-render. Bounded: at most MAX_ENTRIES images.
 */
import { ImageResponse } from 'next/og';
import type { ReactElement } from 'react';
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from './validate';
import { shareCardFonts } from './font';

const MAX_ENTRIES = 48;
const cache = new Map<string, { at: number; ttlMs: number; body: ArrayBuffer; headers: Record<string, string> }>();

/** Browser / CDN caching. Dated cards change only if the stored row is regenerated; "latest" rolls over daily. */
export const CACHE_DATED = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
export const CACHE_LATEST = 'public, max-age=900, s-maxage=900, stale-while-revalidate=3600';
export const CACHE_M2 = 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400';

export function cachedPng(key: string, now = Date.now()): Response | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.at > hit.ttlMs) { cache.delete(key); return null; }
  return new Response(hit.body.slice(0), { status: 200, headers: { ...hit.headers, 'X-Share-Cache': 'hit' } });
}

export async function renderPng(
  key: string,
  element: ReactElement,
  opts: { cacheControl: string; filename: string; ttlMs: number },
): Promise<Response> {
  const img = new ImageResponse(element, { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, fonts: shareCardFonts() });
  const body = await img.arrayBuffer();
  const headers = {
    'Content-Type': 'image/png',
    'Cache-Control': opts.cacheControl,
    'Content-Disposition': `inline; filename="${opts.filename.replace(/[^A-Za-z0-9._-]/g, '')}"`,
    'X-Content-Type-Options': 'nosniff',
  };
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), ttlMs: opts.ttlMs, body, headers });
  return new Response(body.slice(0), { status: 200, headers: { ...headers, 'X-Share-Cache': 'miss' } });
}

/** Plain-text error (never an image, so a publisher can't attach an "unavailable" card by mistake). */
export function shareError(status: 400 | 404 | 500 | 503, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': status === 400 ? 'public, max-age=3600' : 'public, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Test hook. */
export function clearShareCache(): void {
  cache.clear();
}
export function shareCacheSize(): number {
  return cache.size;
}
