import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { optionsAnalyzer } from '@/lib/options-confluence-analyzer';
import type { ScanMode } from '@/lib/confluence-learning-agent';
import { hasProTraderAccess } from '@/lib/proTraderAccess';
import { buildDealerIntelligence, calculateDealerGammaSnapshot } from '@/lib/options-gex';

const VALID_SCAN_MODES: ScanMode[] = [
  'scalping',
  'intraday_30m',
  'intraday_1h',
  'intraday_4h',
  'swing_1d',
  'swing_3d',
  'swing_1w',
  'macro_monthly',
  'macro_yearly',
];

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Please log in to use GEX' }, { status: 401 });
    }
    if (!hasProTraderAccess(session.tier)) {
      return NextResponse.json({ success: false, error: 'Pro Trader subscription required for GEX' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const symbol = String(searchParams.get('symbol') || '').trim().toUpperCase();
    const scanModeRaw = String(searchParams.get('scanMode') || 'intraday_1h') as ScanMode;
    const expirationDate = searchParams.get('expirationDate') || undefined;

    if (!symbol) {
      return NextResponse.json({ success: false, error: 'Symbol is required' }, { status: 400 });
    }

    const scanMode: ScanMode = VALID_SCAN_MODES.includes(scanModeRaw) ? scanModeRaw : 'intraday_1h';
    const analysis = await optionsAnalyzer.analyzeForOptions(symbol, scanMode, expirationDate);
    const dealerGamma = calculateDealerGammaSnapshot(analysis.openInterestAnalysis, analysis.currentPrice);
    const dealerIntelligence = buildDealerIntelligence({
      snapshot: dealerGamma,
      currentPrice: analysis.currentPrice,
      baseScore: Number(analysis.compositeScore?.confidence ?? 50),
      setupDescriptor: `${analysis.strategyRecommendation?.strategy || ''} ${analysis.tradeSnapshot?.oneLine || ''}`,
      direction: analysis.direction,
    });

    return NextResponse.json({
      success: true,
      data: {
        symbol: analysis.symbol,
        currentPrice: analysis.currentPrice,
        expirationDate: analysis.openInterestAnalysis?.expirationDate || null,
        dealerGamma,
        dealerIntelligence,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate GEX',
    }, { status: 500 });
  }
}
