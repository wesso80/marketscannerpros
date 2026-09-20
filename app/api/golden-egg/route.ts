/**
 * Golden Egg Live Data API
 *
 * GET /api/golden-egg?symbol=AAPL&timeframe=daily&type=equity
 *
 * Thin wrapper around lib/goldenEgg/engine — the same canonical packet is consumed by /api/deep-analysis, so the
 * Verdict tab and the Deep Analyst can never disagree on price, indicators, options or levels.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasProTraderAccess } from '@/lib/proTraderAccess';
import { detectAssetClass } from '@/lib/goldenEggFetchers';
import { computeGoldenEgg, tfLabelFor, buildLocalDemoGoldenEggPayload, goldenEggDemoDataQuality, isLocalGoldenEggDemoAllowed } from '@/lib/goldenEgg/engine';
import { buildMarketDataProviderStatus, emitProductionDemoDataAlert, isLocalDemoMarketDataAllowed } from '@/lib/scanner/providerStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let fallbackSymbol = 'AAPL';
  let fallbackAssetClass: 'equity' | 'crypto' | 'forex' = 'equity';
  let fallbackTfLabel = '1D';
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Please log in' }, { status: 401 });
    }
    if (!hasProTraderAccess(session.tier)) {
      return NextResponse.json({ success: false, error: 'Pro Trader access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || '').trim().toUpperCase();
    if (!symbol) {
      return NextResponse.json({ success: false, error: 'Missing symbol parameter' }, { status: 400 });
    }
    const timeframe = (searchParams.get('timeframe') || 'daily').toLowerCase();
    const assetClass = detectAssetClass(symbol, searchParams.get('type') || undefined);
    fallbackSymbol = symbol;
    fallbackAssetClass = assetClass;
    fallbackTfLabel = tfLabelFor(timeframe);

    const result = await computeGoldenEgg({ symbol, timeframe, assetClass, workspaceId: session.workspaceId, fresh: searchParams.get('fresh') === '1' });
    // Provider status is reported at the route boundary so consumers see source/freshness alongside the packet.
    const providerStatus = result.cached
      ? buildMarketDataProviderStatus({ source: 'memory_cache', provider: 'memory_cache' })
      : result.dataQuality;
    return NextResponse.json({
      success: true,
      data: result.payload,
      cached: result.cached || undefined,
      localDemo: result.localDemo || undefined,
      warnings: result.warnings.length ? result.warnings : undefined,
      dataQuality: providerStatus,
      providerStatus,
    });
  } catch (error) {
    console.error('[Golden Egg API] Error:', error);
    const message = error instanceof Error ? error.message : 'Analysis failed';
    if (/Unable to fetch price data/.test(message)) {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }
    if (isLocalGoldenEggDemoAllowed()) {
      const demoPolicy = isLocalDemoMarketDataAllowed({ nodeEnv: process.env.NODE_ENV, localDemoMarketData: process.env.LOCAL_DEMO_MARKET_DATA });
      if (demoPolicy.productionDemoEnabled) emitProductionDemoDataAlert('golden-egg', message, { symbol: fallbackSymbol, assetClass: fallbackAssetClass, timeframe: fallbackTfLabel });
      const dq = goldenEggDemoDataQuality(message, { symbol: fallbackSymbol, assetClass: fallbackAssetClass, timeframe: fallbackTfLabel });
      return NextResponse.json({
        success: true,
        data: buildLocalDemoGoldenEggPayload(fallbackSymbol, fallbackAssetClass, fallbackTfLabel, message),
        localDemo: true,
        warnings: dq.warnings,
        dataQuality: dq,
        providerStatus: dq,
      });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
