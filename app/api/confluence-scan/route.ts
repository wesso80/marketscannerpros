/**
 * AI Confluence Forecast API Endpoint v2
 * 
 * NEW FEATURES:
 * - Full history scanning with LEARNING
 * - Decompression timing analysis (when does price start moving)
 * - Per-symbol pattern memory
 * - Predicts upcoming confluence windows
 */

import { NextRequest, NextResponse } from 'next/server';
import { confluenceLearningAgent } from '@/lib/confluence-learning-agent';
import { confluenceAgent, type Forecast, type ConfluenceState } from '@/lib/ai-confluence-agent';
import { q } from '@/lib/db';

export const maxDuration = 120; // Allow up to 2 minutes for full history scan

interface ScanRequest {
  symbol: string;
  mode?: 'full' | 'quick' | 'state-only' | 'learn' | 'forecast';
}

interface ScanResponse {
  success: boolean;
  data?: any;
  error?: string;
  cached?: boolean;
  mode?: string;
}

// Simple in-memory cache (in production use Redis)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const LEARNING_CACHE_TTL = 60 * 60 * 1000; // 1 hour for learned patterns

function getCached(key: string, ttl: number = CACHE_TTL): any | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
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
    const { symbol, mode = 'forecast' } = body;

    if (!symbol || typeof symbol !== 'string') {
      return NextResponse.json({ 
        success: false, 
        error: 'Symbol is required' 
      }, { status: 400 });
    }

    // Normalize symbol
    const normalizedSymbol = symbol.toUpperCase().trim();
    const cacheKey = `${normalizedSymbol}-${mode}`;

    // Check cache (except for learn mode which should always refresh)
    if (mode !== 'learn') {
      const cachedData = getCached(cacheKey, mode === 'forecast' ? LEARNING_CACHE_TTL : CACHE_TTL);
      if (cachedData) {
        return NextResponse.json({
          success: true,
          data: cachedData,
          cached: true,
          mode,
        });
      }
    }

    let result: any;

    switch (mode) {
      case 'learn':
        // Full history scan with learning - builds symbol profile
        console.log(`📚 Learning mode for ${normalizedSymbol}...`);
        result = await confluenceLearningAgent.scanFullHistory(normalizedSymbol);
        setCache(`${normalizedSymbol}-learning`, result.learning);
        break;

      case 'forecast':
        // AI forecast with learned patterns + decompression timing
        console.log(`🔮 Forecast mode for ${normalizedSymbol}...`);
        result = await confluenceLearningAgent.generateForecast(normalizedSymbol);
        break;

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
        // Legacy: Full AI-powered forecast (old agent)
        result = await confluenceAgent.scan(normalizedSymbol);
        break;
    }

    // Log prediction for learning machine (forecast only)
    if (process.env.DATABASE_URL && mode === 'forecast' && result?.prediction && result?.currentState) {
      try {
        await q(
          `INSERT INTO learning_predictions (
            symbol, asset_type, mode, current_price,
            prediction_direction, confidence, expected_decomp_mins,
            target_price, stop_loss,
            stack, active_tfs, hot_zone, hot_zone_tfs, clusters, mid50_levels
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            normalizedSymbol,
            normalizedSymbol.includes('USD') ? 'crypto' : 'stock',
            mode,
            result.currentPrice || 0,
            result.prediction.direction || 'neutral',
            Math.round(result.prediction.confidence || 0),
            Math.round(result.prediction.expectedDecompMins || 0),
            result.prediction.targetPrice || null,
            result.prediction.stopLoss || null,
            result.currentState.stack || 0,
            JSON.stringify(result.currentState.activeTFs || []),
            !!result.currentState.isHotZone,
            JSON.stringify(result.currentState.hotZoneTFs || []),
            result.currentState.clusters || 0,
            JSON.stringify(result.currentState.mid50Levels || [])
          ]
        );
      } catch (dbErr) {
        console.error('Learning prediction log failed:', dbErr);
      }
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
