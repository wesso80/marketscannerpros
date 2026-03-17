/**
 * Unified Intelligence Context for AI routes
 *
 * Bridges the gap between the platform's 15+ intelligence engines and what
 * the AI actually sees. Gathers: MPE, Doctrine, Capital Flow Engine,
 * confluence component breakdown, and formats them for system message
 * injection into both MSP-Analyst and Copilot routes.
 */

import { fetchMPE, type TimeConfluenceData } from '@/lib/goldenEggFetchers';
import { classifyBestDoctrine, type ClassifierInput } from '@/lib/doctrine/classifier';
import { getIndicators, getQuote } from '@/lib/onDemandFetch';
import { computeCapitalFlowEngine, type CapitalFlowResult, type CapitalFlowInput } from '@/lib/capitalFlowEngine';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface IntelligenceContextResult {
  /** Formatted system message for AI injection, or null if no symbol */
  systemMessage: string | null;
  /** Raw MPE data */
  mpe: { composite: number; label: string; direction: string; time: number; volatility: number; liquidity: number; options: number; summary: string } | null;
  /** Raw doctrine match */
  doctrine: { id: string; confidence: number; reasons: string[]; regimeCompatible: boolean } | null;
  /** Raw CFE summary (subset for AI) */
  cfe: CFESummary | null;
}

export interface CFESummary {
  marketMode: string;
  gammaState: string;
  bias: string;
  conviction: number;
  brainPermission: string;
  brainMode: string;
  probabilityRegime: string;
  flowState: string;
  riskMode: string;
  sizeMultiplier: number;
  stateMachineState?: string;
  nextBestAction?: string;
}

export interface ConfluenceComponentsInput {
  SQ?: number;
  TA?: number;
  VA?: number;
  LL?: number;
  MTF?: number;
  FD?: number;
  weightedScore?: number;
}

/* ------------------------------------------------------------------ */
/*  Main function                                                      */
/* ------------------------------------------------------------------ */

/**
 * Gather MPE + Doctrine + CFE intelligence for a symbol.
 * Gracefully returns nulls if any data source fails.
 */
export async function fetchIntelligenceContext(
  symbol: string | undefined,
  opts?: {
    assetClass?: string;
    scanData?: Record<string, any>;
    tcData?: TimeConfluenceData | null;
    /** Pre-computed CFE result (from scanner/flow API). When provided, skips CFE computation. */
    precomputedCFE?: CapitalFlowResult | null;
    /** Confluence component breakdown (SQ/TA/VA/LL/MTF/FD) from regime scoring */
    confluenceComponents?: ConfluenceComponentsInput | null;
  }
): Promise<IntelligenceContextResult> {
  if (!symbol) return { systemMessage: null, mpe: null, doctrine: null, cfe: null };

  const assetClass = opts?.assetClass || inferAssetClass(symbol);

  // Fetch MPE and indicators in parallel
  const [mpeResult, indicators, quote] = await Promise.all([
    fetchMPE(symbol, assetClass, opts?.tcData).catch(() => null),
    getIndicators(symbol, 'daily').catch(() => null),
    getQuote(symbol).catch(() => null),
  ]);

  // ---- MPE ----
  let mpe: IntelligenceContextResult['mpe'] = null;
  if (mpeResult) {
    const composite = mpeResult.composite ?? 0;
    const label = composite >= 75 ? 'HIGH_PRESSURE' : composite >= 50 ? 'BUILDING' : composite >= 25 ? 'LOW_PRESSURE' : 'NO_PRESSURE';
    mpe = {
      composite,
      label,
      direction: composite >= 50 ? 'ACTIVE' : 'NEUTRAL',
      time: mpeResult.time ?? 0,
      volatility: mpeResult.volatility ?? 0,
      liquidity: mpeResult.liquidity ?? 0,
      options: mpeResult.options ?? 0,
      summary: `MPE ${Math.round(composite)}/100 — ${label.replace('_', ' ')}`,
    };
  }

  // ---- Doctrine ----
  let doctrine: IntelligenceContextResult['doctrine'] = null;
  try {
    const sd = opts?.scanData || {};
    const classifierInput: ClassifierInput = {
      dveRegime: sd.dveRegime || (indicators as any)?.regime || 'neutral',
      bbwp: sd.bbwp ?? null,
      rsi: sd.rsi ?? (indicators as any)?.rsi14 ?? null,
      macdHist: sd.macd_hist ?? null,
      adx: sd.adx ?? (indicators as any)?.adx14 ?? null,
      stochK: sd.stoch_k ?? null,
      priceVsSma20Pct: null,
      priceVsSma50Pct: null,
      volumeRatio: sd.volumeRatio ?? null,
      permission: sd.permission || 'WATCH',
      direction: sd.direction || 'NEUTRAL',
      confidence: sd.confidence ?? sd.score ?? 50,
      inSqueeze: sd.in_squeeze ?? (indicators as any)?.inSqueeze ?? false,
    };

    const match = classifyBestDoctrine(classifierInput);
    if (match) {
      doctrine = {
        id: match.doctrineId,
        confidence: match.matchConfidence,
        reasons: match.reasons,
        regimeCompatible: match.regimeCompatible,
      };
    }
  } catch {
    // Non-critical
  }

  // ---- Capital Flow Engine ----
  let cfe: CFESummary | null = null;
  try {
    if (opts?.precomputedCFE) {
      cfe = summarizeCFE(opts.precomputedCFE);
    } else if (quote && typeof (quote as any).price === 'number') {
      // Lightweight CFE computation from available data
      const sd = opts?.scanData || {};
      const ind = indicators as any;
      const spot = (quote as any).price as number;
      if (spot > 0) {
        const cfeInput: CapitalFlowInput = {
          symbol,
          marketType: assetClass === 'crypto' ? 'crypto' : 'equity',
          spot,
          atr: sd.atr ?? ind?.atr14 ?? undefined,
          trendMetrics: {
            adx: sd.adx ?? ind?.adx14 ?? undefined,
            emaAligned: sd.ema200 ? spot > Number(sd.ema200) : undefined,
          },
          cryptoPositioning: assetClass === 'crypto' ? {
            fundingRate: sd.fundingRate ?? undefined,
            longShortRatio: sd.longShortRatio ?? undefined,
            oiChangePercent: sd.oiChange24h ?? undefined,
          } : undefined,
        };
        const cfeResult = computeCapitalFlowEngine(cfeInput);
        cfe = summarizeCFE(cfeResult);
      }
    }
  } catch {
    // CFE computation is non-critical
  }

  // ---- Build system message ----
  const parts: string[] = [];
  parts.push('=== UNIFIED INTELLIGENCE CONTEXT (Live) ===');

  if (mpe) {
    parts.push(`
MARKET PRESSURE ENGINE (MPE):
- Composite: ${Math.round(mpe.composite)}/100 — ${mpe.label.replace('_', ' ')}
- Time Pressure: ${Math.round(mpe.time)}/100
- Volatility Pressure: ${Math.round(mpe.volatility)}/100
- Liquidity Pressure: ${Math.round(mpe.liquidity)}/100
- Options Pressure: ${Math.round(mpe.options)}/100
- Sizing Guide: ${mpe.composite >= 75 ? 'Full size — high pressure environment' : mpe.composite >= 50 ? 'Reduced size — pressure building' : mpe.composite >= 25 ? 'Probe only — low pressure' : 'No trade — insufficient pressure'}`);
  }

  if (doctrine) {
    parts.push(`
DOCTRINE CLASSIFIER (Active Playbook):
- Playbook: ${doctrine.id.replace(/_/g, ' ')}
- Match Confidence: ${doctrine.confidence}%
- Regime Compatible: ${doctrine.regimeCompatible ? 'YES' : 'NO — playbook may underperform'}
- Evidence: ${doctrine.reasons.slice(0, 4).join(' | ')}`);
  }

  if (cfe) {
    parts.push(`
CAPITAL FLOW ENGINE (CFE):
- Market Mode: ${cfe.marketMode.toUpperCase()} ${cfe.marketMode === 'pin' ? '(range-bound, mean reversion favored)' : cfe.marketMode === 'launch' ? '(directional breakout likely)' : '(choppy, reduce size)'}
- Gamma State: ${cfe.gammaState} ${cfe.gammaState === 'Positive' ? '(supportive — dips bought)' : cfe.gammaState === 'Negative' ? '(resistive — rallies sold, accelerates moves)' : '(mixed signals)'}
- Flow Bias: ${cfe.bias.toUpperCase()}
- Institutional Conviction: ${cfe.conviction}% ${cfe.conviction >= 70 ? '(HIGH — strong institutional alignment)' : cfe.conviction >= 40 ? '(MODERATE)' : '(LOW — weak/conflicting flow)'}
- Brain Decision: ${cfe.brainPermission} — Mode: ${cfe.brainMode}
- Probability Regime: ${cfe.probabilityRegime}
- Flow State: ${cfe.flowState}
- Risk Governor: ${cfe.riskMode} — Size Multiplier: ×${cfe.sizeMultiplier.toFixed(2)}${cfe.stateMachineState ? `\n- State Machine: ${cfe.stateMachineState}${cfe.nextBestAction ? ` → Next: ${cfe.nextBestAction}` : ''}` : ''}`);
  }

  // Confluence component breakdown (if provided)
  const cc = opts?.confluenceComponents;
  if (cc && cc.weightedScore !== undefined) {
    parts.push(`
CONFLUENCE COMPONENT BREAKDOWN:
- Weighted Score: ${Math.round(cc.weightedScore)}/100
- SQ (Signal Quality): ${cc.SQ !== undefined ? Math.round(cc.SQ) : 'N/A'}/100
- TA (Technical Alignment): ${cc.TA !== undefined ? Math.round(cc.TA) : 'N/A'}/100
- VA (Volume/Activity): ${cc.VA !== undefined ? Math.round(cc.VA) : 'N/A'}/100
- LL (Liquidity Level): ${cc.LL !== undefined ? Math.round(cc.LL) : 'N/A'}/100
- MTF (Multi-Timeframe): ${cc.MTF !== undefined ? Math.round(cc.MTF) : 'N/A'}/100
- FD (Fundamentals/Deriv.): ${cc.FD !== undefined ? Math.round(cc.FD) : 'N/A'}/100`);
  }

  if (mpe || doctrine || cfe || cc) {
    parts.push(`
INTELLIGENCE INSTRUCTIONS:
- Reference the MPE composite score when discussing trade timing and position sizing.
- If MPE < 25, recommend standing aside regardless of other signals.
- Name the active doctrine playbook when framing the trade setup type.
- If doctrine is not regime-compatible, flag this as a risk factor.
- Reference CFE market mode (pin/launch/chop) when discussing trade style selection.
- If CFE brain permission is BLOCK, this overrides other bullish signals — stand aside.
- If conviction < 40%, note weak institutional alignment and recommend smaller size.
- When explaining confluence score, break it down by component — identify which factors are strong/weak.
- If any component scores below 30, flag it as the "weak link" limiting the setup.`);
  }

  const systemMessage = parts.length > 1 ? parts.join('\n') : null;

  return { systemMessage, mpe, doctrine, cfe };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function summarizeCFE(result: CapitalFlowResult): CFESummary {
  return {
    marketMode: result.market_mode,
    gammaState: result.gamma_state,
    bias: result.bias,
    conviction: Math.round(result.conviction),
    brainPermission: result.brain_decision.permission,
    brainMode: result.brain_decision.mode,
    probabilityRegime: result.probability_matrix.regime,
    flowState: result.flow_state?.state || 'unknown',
    riskMode: result.institutional_risk_governor.riskMode,
    sizeMultiplier: result.institutional_risk_governor.sizing.finalSize,
    stateMachineState: result.brain_decision_v1?.state_machine?.state,
    nextBestAction: result.brain_decision_v1?.state_machine?.next_best_action?.action,
  };
}

function inferAssetClass(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.includes('USDT') || s.includes('-USD') || s.endsWith('BTC') ||
      ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'ADA', 'AVAX', 'LINK', 'MATIC', 'LTC', 'DOT'].includes(s.replace(/[-/].*$/, ''))) {
    return 'crypto';
  }
  return 'equity';
}
