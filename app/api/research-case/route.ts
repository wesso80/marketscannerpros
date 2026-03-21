import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { computeCapitalFlowEngine } from '@/lib/capitalFlowEngine';
import { computeProbabilityMatrixEngine } from '@/lib/probability-matrix';
import { computeFlowEngine } from '@/lib/flow-engine';
import { computeRegimeEngine } from '@/lib/regime-engine';
import { buildExecutionPlan } from '@/lib/plan-builder';
import { fetchMPE } from '@/lib/goldenEggFetchers';
import { classifyBestDoctrine } from '@/lib/doctrine/classifier';
import { getIndicators, getQuote } from '@/lib/onDemandFetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol');
  const assetClass = url.searchParams.get('assetClass') || 'equity';
  if (!symbol) {
    return NextResponse.json({ error: 'symbol required' }, { status: 400 });
  }

  try {
    // Fetch data in parallel
    const [indicators, quote, mpe] = await Promise.all([
      getIndicators(symbol).catch(() => null),
      getQuote(symbol).catch(() => null),
      fetchMPE(symbol, assetClass).catch(() => null),
    ]);

    const price = quote?.price ?? 0;
    const atr = indicators?.atr14 ?? 0;
    const rsi = indicators?.rsi14 ?? 50;
    const adx = indicators?.adx14 ?? 20;
    const macdHist = indicators?.macdHist ?? 0;

    // Compute Capital Flow Engine
    let cfe = null;
    try {
      cfe = computeCapitalFlowEngine({
        symbol,
        spot: price,
        atr: atr || undefined,
        trendMetrics: indicators ? {
          adx: adx,
          emaAligned: indicators.ema200 ? price > indicators.ema200 : undefined,
        } : undefined,
      });
    } catch { /* CFE may fail without full data */ }

    // Probability Matrix
    let probMatrix = null;
    if (cfe?.probability_matrix) {
      probMatrix = computeProbabilityMatrixEngine({
        pTrend: (cfe.probability_matrix.continuation ?? 33) / 100,
        pPin: (cfe.probability_matrix.pinReversion ?? 33) / 100,
        pExpansion: (cfe.probability_matrix.expansion ?? 34) / 100,
        conviction: cfe.conviction ?? 50,
        expectedMove: atr ? (atr / price) * 100 : 2,
      });
    }

    // Regime Engine
    let regime = null;
    if (cfe) {
      regime = computeRegimeEngine({
        marketMode: cfe.market_mode ?? 'chop',
        gammaState: cfe.gamma_state ?? 'Mixed',
        atrPercent: atr ? (atr / price) * 100 : 2,
        expansionProbability: (cfe.probability_matrix?.expansion ?? 30) / 100,
        dataHealthScore: 80,
      });
    }

    // Flow Engine
    let flow = null;
    if (cfe) {
      flow = computeFlowEngine({
        symbol,
        bias: cfe.bias ?? 'neutral',
        flowScore: cfe.flow_state?.confidence ?? 50,
        liquidityScore: 50,
        pTrend: (cfe.probability_matrix?.continuation ?? 33) / 100,
        pPin: (cfe.probability_matrix?.pinReversion ?? 33) / 100,
        pExpansion: (cfe.probability_matrix?.expansion ?? 34) / 100,
      });
    }

    // Execution Plan
    let plan = null;
    if (cfe?.brain_decision) {
      plan = buildExecutionPlan({
        symbol,
        bias: cfe.bias ?? 'neutral',
        permission: cfe.brain_decision.permission ?? 'BLOCK',
        flowState: cfe.brain_decision_v1?.state_machine?.state
          ? mapStateToFlowState(cfe.brain_decision_v1.state_machine.state)
          : 'POSITIONING',
        stopStyle: 'atr',
        finalSize: cfe.brain_decision.plan?.size ?? 1,
      });
    }

    // Doctrine
    const doctrine = classifyBestDoctrine({
      dveRegime: 'unknown',
      bbwp: null,
      rsi: rsi ?? null,
      adx: adx ?? null,
      macdHist: macdHist ?? null,
      stochK: indicators?.stochK ?? null,
      priceVsSma20Pct: null,
      priceVsSma50Pct: null,
      volumeRatio: null,
      permission: cfe?.brain_decision?.permission === 'ALLOW' ? 'TRADE' : 'WATCH',
      direction: cfe?.bias === 'bullish' ? 'LONG' : cfe?.bias === 'bearish' ? 'SHORT' : 'NEUTRAL',
      confidence: cfe?.brain_decision?.score ?? 50,
    });

    // Technical evidence
    const technicals = {
      price,
      rsi,
      adx,
      macdHist,
      atr,
      ema200: indicators?.ema200 ?? null,
      ema200Distance: indicators?.ema200
        ? ((price - indicators.ema200) / indicators.ema200) * 100
        : null,
      slowK: indicators?.stochK ?? null,
      slowD: indicators?.stochD ?? null,
      cci: indicators?.cci20 ?? null,
      mfi: indicators?.mfi14 ?? null,
      obv: indicators?.obv ?? null,
      squeeze: indicators?.inSqueeze ?? false,
    };

    // Assemble Research Case
    const researchCase = {
      symbol,
      generatedAt: new Date().toISOString(),
      thesis: buildThesis(symbol, cfe, regime, flow, probMatrix, doctrine),
      technicals,
      mpe: mpe ? {
        composite: mpe.composite,
        time: mpe.time,
        volatility: mpe.volatility,
        liquidity: mpe.liquidity,
        options: mpe.options,
      } : null,
      capitalFlow: cfe ? {
        marketMode: cfe.market_mode,
        gammaState: cfe.gamma_state,
        bias: cfe.bias,
        conviction: cfe.conviction,
        brainPermission: cfe.brain_decision?.permission,
        brainMode: cfe.brain_decision?.mode,
        probabilityMatrix: cfe.probability_matrix,
      } : null,
      regime,
      flow,
      probMatrix,
      doctrine: doctrine ? { name: doctrine.doctrineId, confidence: doctrine.matchConfidence } : null,
      executionPlan: plan,
      invalidation: plan?.stopRule ?? null,
    };

    return NextResponse.json({ success: true, researchCase });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate research case';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function mapStateToFlowState(state: string): 'ACCUMULATION' | 'POSITIONING' | 'LAUNCH' | 'EXHAUSTION' {
  switch (state) {
    case 'SCAN': case 'WATCH': return 'ACCUMULATION';
    case 'STALK': case 'ARMED': return 'POSITIONING';
    case 'EXECUTE': case 'MANAGE': return 'LAUNCH';
    case 'COOLDOWN': case 'BLOCKED': return 'EXHAUSTION';
    default: return 'POSITIONING';
  }
}

function buildThesis(
  symbol: string,
  cfe: any,
  regime: any,
  flow: any,
  probMatrix: any,
  doctrine: any,
): string {
  const parts: string[] = [];
  if (cfe) {
    parts.push(`${symbol} is in ${cfe.market_mode?.toUpperCase() ?? 'UNKNOWN'} mode with ${cfe.gamma_state ?? 'mixed'} gamma.`);
    parts.push(`Capital flow bias: ${cfe.bias ?? 'neutral'}, conviction: ${cfe.conviction ?? 0}/100.`);
    if (cfe.brain_decision) {
      parts.push(`Brain status: ${cfe.brain_decision.permission}, operating in ${cfe.brain_decision.mode} mode.`);
    }
  }
  if (regime) {
    parts.push(`Regime: ${regime.regime}, risk mode: ${regime.riskMode}, vol: ${regime.volState}.`);
  }
  if (flow) {
    parts.push(`Flow bias: ${flow.flowBias}, strength: ${flow.flowStrength}/100.`);
  }
  if (probMatrix) {
    parts.push(`Probability: ${(probMatrix.pUp * 100).toFixed(0)}% up / ${(probMatrix.pDown * 100).toFixed(0)}% down. Best framework: ${probMatrix.bestPlaybook}.`);
  }
  if (doctrine) {
    parts.push(`Doctrine: ${doctrine.name} (${(doctrine.confidence * 100).toFixed(0)}% confidence).`);
  }
  return parts.join(' ') || `No sufficient data to build thesis for ${symbol}.`;
}
