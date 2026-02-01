import { NextRequest, NextResponse } from 'next/server';
import { optionsAnalyzer, OptionsSetup } from '@/lib/options-confluence-analyzer';
import { ScanMode } from '@/lib/confluence-learning-agent';
import { getSessionFromCookie } from '@/lib/auth';

// NOTE: In-memory cache doesn't persist across serverless invocations
// Each request fetches fresh data (75 calls/min on premium is sufficient)

export async function POST(request: NextRequest) {
  try {
    // Pro Trader tier required
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Please log in to use the Options Scanner' }, { status: 401 });
    }
    if (session.tier !== 'pro_trader') {
      return NextResponse.json({ success: false, error: 'Pro Trader subscription required for Options Scanner' }, { status: 403 });
    }

    const body = await request.json();
    const { symbol, scanMode = 'intraday_1h', expirationDate } = body;
    
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
    
    // Always fetch fresh data - serverless doesn't maintain state between requests
    const expiryInfo = expirationDate ? ` expiry=${expirationDate}` : ' (auto-select expiry)';
    console.log(`📊 Options scan for ${symbol.toUpperCase()} (${scanMode})${expiryInfo} at ${new Date().toISOString()}`);
    
    const analysis = await optionsAnalyzer.analyzeForOptions(symbol.toUpperCase(), scanMode, expirationDate);
    
    console.log(`✅ Options scan complete: ${symbol.toUpperCase()} - ${analysis.direction} signal, Grade: ${analysis.tradeQuality}`);
    
    return NextResponse.json({
      success: true,
      data: analysis,
      timestamp: new Date().toISOString(),
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
