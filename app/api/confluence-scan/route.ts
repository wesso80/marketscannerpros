/**
 * AI Confluence Forecast API Endpoint
 * Scans any symbol using Time Confluence Windows + GPT-4 for market forecasting
 */

import { NextRequest, NextResponse } from 'next/server';
import { confluenceAgent, type Forecast, type ConfluenceState } from '@/lib/ai-confluence-agent';

export const maxDuration = 60; // Allow up to 60 seconds for analysis

interface ScanRequest {
  symbol: string;
  mode?: 'full' | 'quick' | 'state-only';
}

interface ScanResponse {
  success: boolean;
  data?: Forecast | ConfluenceState | { isHigh: boolean; stack: number; hasCluster: boolean; isHotZone: boolean };
  error?: string;
  cached?: boolean;
}

// Simple in-memory cache (in production use Redis)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): any | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export async function POST(request: NextRequest): Promise<NextResponse<ScanResponse>> {
  try {
    const body: ScanRequest = await request.json();
    const { symbol, mode = 'full' } = body;

    if (!symbol || typeof symbol !== 'string') {
      return NextResponse.json({ 
        success: false, 
        error: 'Symbol is required' 
      }, { status: 400 });
    }

    // Normalize symbol
    const normalizedSymbol = symbol.toUpperCase().trim();
    const cacheKey = `${normalizedSymbol}-${mode}`;

    // Check cache
    const cachedData = getCached(cacheKey);
    if (cachedData) {
      return NextResponse.json({
        success: true,
        data: cachedData,
        cached: true,
      });
    }

    let result: any;

    switch (mode) {
      case 'quick':
        // Quick check for high confluence (no AI, fast)
        result = await confluenceAgent.isHighConfluence(normalizedSymbol);
        break;

      case 'state-only':
        // Just get current confluence state (no AI, no historical analysis)
        result = await confluenceAgent.getConfluenceState(normalizedSymbol);
        break;

      case 'full':
      default:
        // Full AI-powered forecast
        result = await confluenceAgent.scan(normalizedSymbol);
        break;
    }

    // Cache the result
    setCache(cacheKey, result);

    return NextResponse.json({
      success: true,
      data: result,
      cached: false,
    });

  } catch (error) {
    console.error('Confluence scan error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');
  const mode = searchParams.get('mode') as 'full' | 'quick' | 'state-only' | null;

  if (!symbol) {
    return NextResponse.json({ 
      success: false, 
      error: 'Symbol query parameter is required. Usage: /api/confluence-scan?symbol=AAPL&mode=full' 
    }, { status: 400 });
  }

  // Forward to POST handler
  const mockRequest = {
    json: async () => ({ symbol, mode: mode || 'full' }),
  } as NextRequest;

  return POST(mockRequest);
}
