import { NextRequest, NextResponse } from 'next/server';
import { optionsAnalyzer, OptionsSetup } from '@/lib/options-confluence-analyzer';
import { ScanMode } from '@/lib/confluence-learning-agent';

// Cache for options analysis (5 minute TTL)
const analysisCache = new Map<string, { data: OptionsSetup; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, scanMode = 'intraday_1h', forceRefresh = false } = body;
    
    if (!symbol) {
      return NextResponse.json({
        success: false,
        error: 'Symbol is required',
      }, { status: 400 });
    }
    
    // Validate scan mode
    const validModes: ScanMode[] = [
      'scalping', 'intraday_30m', 'intraday_1h', 'intraday_4h',
      'swing_1d', 'swing_3d', 'swing_1w', 'macro_monthly', 'macro_yearly'
    ];
    
    if (!validModes.includes(scanMode)) {
      return NextResponse.json({
        success: false,
        error: `Invalid scan mode: ${scanMode}`,
      }, { status: 400 });
    }
    
    // Check cache
    const cacheKey = `${symbol.toUpperCase()}_${scanMode}`;
    const cached = analysisCache.get(cacheKey);
    
    if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({
        success: true,
        data: cached.data,
        cached: true,
        cacheAge: Math.round((Date.now() - cached.timestamp) / 1000),
      });
    }
    
    // Perform options analysis
    console.log(`📊 Options scan for ${symbol.toUpperCase()} (${scanMode})`);
    const analysis = await optionsAnalyzer.analyzeForOptions(symbol.toUpperCase(), scanMode);
    
    // Cache the result
    analysisCache.set(cacheKey, { data: analysis, timestamp: Date.now() });
    
    return NextResponse.json({
      success: true,
      data: analysis,
      cached: false,
    });
    
  } catch (error) {
    console.error('Options scan error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Options analysis failed',
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Options Confluence Scanner API',
    endpoints: {
      POST: {
        description: 'Analyze a symbol for options trading using Time Confluence',
        body: {
          symbol: 'string (required)',
          scanMode: 'scalping | intraday_30m | intraday_1h | intraday_4h | swing_1d | swing_3d | swing_1w | macro_monthly | macro_yearly',
          forceRefresh: 'boolean (optional)',
        },
      },
    },
  });
}
