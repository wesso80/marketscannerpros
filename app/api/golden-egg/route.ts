import { publicQuotaEnabled, publicQuota, resolvePublicActor, publicInstrumentKey } from '@/lib/publicQuotaAccess';
import type { QuotaReservation } from '@/lib/publicDailyQuota';
/**
 * Golden Egg Live Data API
 *
 * GET /api/golden-egg?symbol=AAPL&timeframe=daily&type=equity
 *
 * Thin wrapper around lib/goldenEgg/engine — the same canonical packet is consumed by /api/deep-analysis, so the
 * Evidence tab and the Symbol AI summary can never disagree on price, indicators, options or levels.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { detectAssetClass } from '@/lib/goldenEggFetchers';
import { computeGoldenEgg, tfLabelFor, buildLocalDemoGoldenEggPayload, goldenEggDemoDataQuality, isLocalGoldenEggDemoAllowed } from '@/lib/goldenEgg/engine';
import { toPublicSymbolPacket } from '@/lib/research/publicSymbolPacket';
import { buildMarketDataProviderStatus, emitProductionDemoDataAlert, isLocalDemoMarketDataAllowed } from '@/lib/scanner/providerStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let reservation: QuotaReservation | undefined;
  let produced = false;
  const quotaOn = publicQuotaEnabled();
  let quotaMeta: { day: string; resetsAt: string; limit: number | null; used: number } | undefined;
  let access: Awaited<ReturnType<typeof resolvePublicActor>> | undefined;
  let fallbackSymbol = 'AAPL';
  let fallbackAssetClass: 'equity' | 'crypto' | 'forex' = 'equity';
  let fallbackTfLabel = '1D';
  try {
    const session = await getSessionFromCookie();
    if (!quotaOn && !session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Please log in' }, { status: 401 });
    }
    if (!quotaOn && !hasPaidSessionAccess(session)) {
      return NextResponse.json({ success: false, error: 'Pro access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || '').trim().toUpperCase();
    if (!symbol) {
      return NextResponse.json({ success: false, error: 'Missing symbol parameter' }, { status: 400 });
    }
    const timeframe = (searchParams.get('timeframe') || 'daily').toLowerCase();
    const assetClass = detectAssetClass(symbol, searchParams.get('type') || undefined);
    // Optional options expiry (equities). Used only if listed; an unlisted expiry is reported, never replaced.
    const expiryParam = searchParams.get('expiry');
    if (expiryParam && !/^\d{4}-\d{2}-\d{2}$/.test(expiryParam)) {
      return NextResponse.json({ success: false, error: 'Invalid expiry (expected YYYY-MM-DD)' }, { status: 400 });
    }
    if (quotaOn) {
      let resource: string;
      try { resource = publicInstrumentKey(symbol,assetClass); }
      catch { return NextResponse.json({success:false,error:'Invalid or unmapped symbol identity'},{status:400,headers:{'Cache-Control':'private, no-store'}}); }
      try {
        access = await resolvePublicActor(request,session);
        if(!access)return NextResponse.json({success:false,error:'Choose Try one report or sign in'},{status:401,headers:{'Cache-Control':'private, no-store'}});
        if (!access.bypass) {
          const admission = await publicQuota.reserve({subject:access.subject,plan:access.plan,kind:'symbol',resource,fingerprint:resource});
          quotaMeta = {day:admission.day,resetsAt:admission.resetsAt,limit:admission.limit,used:admission.used};
          if (admission.status !== 'reserved' && admission.status !== 'completed') return NextResponse.json({success:false,code:admission.status === 'limited' ? 'SYMBOL_DAILY_LIMIT' : admission.status === 'pending' ? 'SYMBOL_REPORT_PENDING' : 'SYMBOL_REPORT_CONFLICT',plan:access.plan,error:admission.status === 'limited' ? 'Daily Symbol report limit reached' : 'This report is already being prepared',quota:quotaMeta},{status:admission.status === 'limited' ? 429 : 409,headers:{'Cache-Control':'private, no-store'}});
          if (admission.status === 'reserved') reservation = admission.reservation;
        }
      } catch { return NextResponse.json({success:false,error:'Report access temporarily unavailable'},{status:503,headers:{'Cache-Control':'private, no-store'}}); }
    }
    fallbackSymbol = symbol;
    fallbackAssetClass = assetClass;
    fallbackTfLabel = tfLabelFor(timeframe);

    const result = await computeGoldenEgg({ symbol, timeframe, assetClass, workspaceId: session?.workspaceId, fresh: searchParams.get('fresh') === '1', expiry: expiryParam });
    // Provider status is reported at the route boundary so consumers see source/freshness alongside the packet.
    const providerStatus = result.cached
      ? buildMarketDataProviderStatus({ source: 'memory_cache', provider: 'memory_cache' })
      : result.dataQuality;
    const publicData = toPublicSymbolPacket(result.payload);
    produced = true;
    if (reservation) {
      const settled = await publicQuota.settle(reservation,result.localDemo || !publicData.canonical ? 'released' : 'completed');
      if (!settled) throw Error('Report quota completion could not be confirmed');
      if ((result.localDemo || !publicData.canonical) && quotaMeta) quotaMeta.used = Math.max(0,quotaMeta.used-1);
    }
    return NextResponse.json({
      success: true,
      // W3: the public contract is built from an allow-list; the internal packet (cached, private consumers) is untouched.
      data: publicData,
      quota: quotaMeta,
      reportUnlocked: quotaOn && Boolean(access) && !result.localDemo && Boolean(publicData.canonical),
      cached: result.cached || undefined,
      localDemo: result.localDemo || undefined,
      warnings: result.warnings.length ? result.warnings : undefined,
      dataQuality: providerStatus,
      providerStatus,
    },{headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    if (reservation && !produced) {
      try { await publicQuota.settle(reservation,'released'); }
      catch { return NextResponse.json({success:false,error:'Report access temporarily unavailable'},{status:503,headers:{'Cache-Control':'private, no-store'}}); }
    }
    if (quotaOn && produced) return NextResponse.json({success:false,error:'Report completion could not be confirmed. Please retry later.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
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
        data: toPublicSymbolPacket(buildLocalDemoGoldenEggPayload(fallbackSymbol, fallbackAssetClass, fallbackTfLabel, message)),
        localDemo: true,
        warnings: dq.warnings,
        dataQuality: dq,
        providerStatus: dq,
      });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
