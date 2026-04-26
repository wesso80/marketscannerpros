/**
 * GET /api/quant/evidence/[symbol] — Deep evidence drill-down for a symbol
 *
 * PRIVATE — requires admin authentication.
 * Shows all engine outputs for a specific symbol — the full forensic view.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';
import { requireAdmin } from '@/lib/adminAuth';
import { getBulkCachedScanData } from '@/lib/scannerCache';
import { computeDirectionalPressure } from '@/lib/directionalVolatilityEngine';
import { computeCapitalFlowEngine } from '@/lib/capitalFlowEngine';
import { computeInstitutionalFilter } from '@/lib/institutionalFilter';
import { extractMRI } from '@/lib/quant/extractMRI';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  // Auth gate: operators only (ms_auth cookie OR admin secret)
  const adminAuth = (await requireAdmin(req)).ok;
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  const { symbol } = await params;
  if (!symbol || symbol.length > 10) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }

  const upperSymbol = symbol.toUpperCase();

  try {
    // Determine asset type from known universes
    const cryptoSymbols = new Set(['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'DOT']);
    const assetType = cryptoSymbols.has(upperSymbol) ? 'crypto' : 'equity';

    // Fetch cached data
    const cachedMap = await getBulkCachedScanData([upperSymbol]);
    const data = cachedMap.get(upperSymbol);

    if (!data || !data.price) {
      return NextResponse.json({ error: 'No data available for symbol', symbol: upperSymbol }, { status: 404 });
    }

    // Build evidence from all available engines
    const evidence: Record<string, unknown> = {
      symbol: upperSymbol,
      assetType,
      price: data.price,
      timestamp: new Date().toISOString(),
    };

    // Scanner indicators
    evidence.indicators = {
      rsi: data.rsi,
      macdLine: data.macdLine,
      macdSignal: data.macdSignal,
      macdHist: data.macdHist,
      adx: data.adx,
      atr: data.atr,
      atrPercent: data.atrPercent,
      stochK: data.stochK,
      stochD: data.stochD,
      cci: data.cci,
      ema200: data.ema200,
      vwap: data.vwap,
      volume: data.volume,
    };

    // DVE — directional pressure from available indicators
    try {
      const dveInput = {
        indicators: {
          stochK: data.stochK ?? null,
          stochD: data.stochD ?? null,
          macd: data.macdLine ?? null,
          macdSignal: data.macdSignal ?? null,
          macdHist: data.macdHist ?? null,
          sma20: null,
          sma50: null,
          adx: data.adx ?? null,
          atr: data.atr ?? null,
        },
        options: {},
        liquidity: {},
        price: { closes: [data.price], currentPrice: data.price, changePct: 0, volume: data.volume ?? 0 },
      };
      const dirPressure = computeDirectionalPressure(dveInput);

      evidence.dve = {
        directionalBias: dirPressure.bias,
        directionalScore: dirPressure.score,
        directionalConfidence: dirPressure.confidence,
        directionalComponents: dirPressure.components,
        componentDetails: dirPressure.componentDetails,
      };
    } catch (e: any) {
      evidence.dve = { error: e.message };
    }

    // Capital Flow
    try {
      const cfResult = computeCapitalFlowEngine({
        symbol: upperSymbol,
        marketType: assetType,
        spot: data.price,
        vwap: data.vwap,
        atr: data.atr,
      });
      evidence.capitalFlow = {
        mode: cfResult.market_mode,
        bias: cfResult.bias,
        conviction: cfResult.conviction,
        gammaState: cfResult.gamma_state,
        flowState: cfResult.flow_state,
        probabilityMatrix: cfResult.probability_matrix,
        flipZones: cfResult.flip_zones,
        keyStrikes: cfResult.key_strikes,
      };
    } catch (e: any) {
      evidence.capitalFlow = { error: e.message };
    }

    // Institutional Filter
    try {
      const filterResult = computeInstitutionalFilter({
        baseScore: 50,
        strategy: 'momentum',
        regime: 'unknown',
        volatility: { atrPercent: data.atrPercent },
        dataHealth: { freshness: 'CACHED' },
      });
      evidence.institutionalFilter = {
        grade: filterResult.finalGrade,
        score: filterResult.finalScore,
        recommendation: filterResult.recommendation,
        filters: filterResult.filters,
      };
    } catch (e: any) {
      evidence.institutionalFilter = { error: e.message };
    }

    // MRI (extracted)
    try {
      const dveEvidence = evidence.dve as { directionalScore?: number; directionalBias?: string } | undefined;
      if (dveEvidence && typeof dveEvidence.directionalScore === 'number') {
        const mri = extractMRI({
          directionScore: dveEvidence.directionalScore,
          signalAlignment: 50,
          ivRank: 50,
          conflictCount: 0,
          direction: (dveEvidence.directionalBias as 'bullish' | 'bearish' | 'neutral') ?? 'neutral',
        });
        evidence.mri = mri;
      }
    } catch (e: any) {
      evidence.mri = { error: e.message };
    }

    return NextResponse.json(evidence);
  } catch (err: any) {
    console.error(`[quant:evidence] Error for ${upperSymbol}:`, err);
    return NextResponse.json(
      { error: 'Evidence retrieval failed', detail: err.message },
      { status: 500 },
    );
  }
}
