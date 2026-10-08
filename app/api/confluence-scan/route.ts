/**
 * Time Confluence API (Pro).
 *
 * Public modes only:
 * - "hierarchical": candle-close timing and prior-candle midpoints for one symbol, serialized through the public
 *   Time Confluence contract (lib/research/publicTimeConfluence). The internal scan's direction, confidence, target,
 *   trade setup, signal strength, scores, entry window and structure are not published.
 * - "calendar": forward candle-close calendar (pure schedule computation, no price data), serialized through the public
 *   Close Calendar contract (lib/research/publicCloseCalendar): no timeframe weight or window score, windows in time order.
 *
 * The former "full" (AI forecast with levels and risk parameters), "quick", "state-only", "learn" and "forecast" modes
 * are not available on this public endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { confluenceLearningAgent, type ScanMode, type CloseCalendarAnchor, type SessionMode, type HierarchicalScanResult } from '@/lib/confluence-learning-agent';
import { getSessionFromCookie } from '@/lib/auth';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { toPublicTimeConfluence } from '@/lib/research/publicTimeConfluence';
import { toPublicCloseCalendar } from '@/lib/research/publicCloseCalendar';

export const maxDuration = 120;

interface ScanRequest {
  symbol: string;
  assetType?: 'equity' | 'crypto';
  mode?: string;
  scanMode?: ScanMode;
  sessionMode?: SessionMode; // regular | extended | full (equity session hours)
  forceRefresh?: boolean;
  // Forward Close Calendar params
  anchor?: CloseCalendarAnchor;
  anchorTime?: string;   // ISO-8601 for CUSTOM anchor
  horizonDays?: number;  // 1-30
}

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
const SCAN_MODES: ScanMode[] = ['scalping', 'intraday_30m', 'intraday_1h', 'intraday_4h', 'swing_1d', 'swing_3d', 'swing_1w', 'macro_monthly', 'macro_yearly'];
const SESSION_MODES: SessionMode[] = ['regular', 'extended', 'full'];

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });

// In-process cache of the INTERNAL scan (symbol-level market data, no workspace data). Every response is serialized
// through the public contract, on the cold and the cached path alike.
const cache = new Map<string, { result: HierarchicalScanResult; observedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) return json({ success: false, error: 'Please log in to use Time Confluence' }, 401);
    if (!hasPaidSessionAccess(session)) return json({ success: false, error: 'Pro subscription required' }, 403);

    const body: ScanRequest = await request.json().catch(() => ({} as ScanRequest));
    const { symbol, mode = 'hierarchical', forceRefresh = false } = body;
    if (!symbol || typeof symbol !== 'string') return json({ success: false, error: 'Symbol is required' }, 400);
    if (mode !== 'hierarchical' && mode !== 'calendar') return json({ success: false, error: 'This scan mode is not available.' }, 400);
    if (body.assetType != null && body.assetType !== 'equity' && body.assetType !== 'crypto') return json({ success: false, error: 'Unsupported asset type' }, 400);

    // Normalize symbol — strip leading slash from CME-style futures tickers (e.g. /ES → ES, /NQ → NQ)
    const normalizedSymbol = symbol.toUpperCase().trim().replace(/^\//, '');
    const sessionMode: SessionMode = SESSION_MODES.includes(body.sessionMode as SessionMode) ? body.sessionMode as SessionMode : 'extended';

    if (mode === 'calendar') {
      // Forward Close Calendar — no price data needed, pure schedule computation, never cached.
      const anchor = (body.anchor || 'NOW') as CloseCalendarAnchor;
      const horizonDays = Math.max(1, Math.min(30, Number(body.horizonDays) || 7));
      const calendarAsset = body.assetType || confluenceLearningAgent.detectAssetClass(normalizedSymbol);
      const calendar = confluenceLearningAgent.computeForwardCloseCalendar(anchor, horizonDays, body.anchorTime || undefined, calendarAsset, sessionMode);
      return json({ success: true, data: toPublicCloseCalendar(calendar), cached: false });
    }

    const scanMode: ScanMode = body.scanMode ?? 'intraday_1h';
    if (!SCAN_MODES.includes(scanMode)) return json({ success: false, error: 'Unsupported scan mode' }, 400);
    const assetClass = body.assetType || confluenceLearningAgent.detectAssetClass(normalizedSymbol);
    const cacheKey = `${body.assetType || 'auto'}-${normalizedSymbol}-hierarchical-${scanMode}-${sessionMode}`;

    let entry = cache.get(cacheKey);
    const cached = !!entry && !forceRefresh && Date.now() - entry.observedAt < CACHE_TTL;
    if (!cached) {
      const result = await confluenceLearningAgent.scanHierarchical(normalizedSymbol, scanMode, sessionMode, body.assetType);
      entry = { result, observedAt: Date.now() };
      cache.set(cacheKey, entry);
    }
    const data = toPublicTimeConfluence(entry!.result, { symbol: normalizedSymbol, assetClass, observedAt: entry!.observedAt });
    return json({ success: true, data, cached, ...(cached ? { cacheAgeMs: Date.now() - entry!.observedAt } : {}) });
  } catch (error) {
    console.error('Confluence scan error:', error);
    return json({ success: false, error: 'Time confluence could not be computed for this symbol right now.' }, 500);
  }
}

export async function GET(): Promise<NextResponse> {
  return json({ success: false, error: 'Use POST with mode "hierarchical" or "calendar".' }, 405);
}
