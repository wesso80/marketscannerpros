/**
 * Unified Intelligence Context for AI routes
 * 
 * Fetches MPE, Doctrine Classifier, and CFE summary to inject into
 * MSP-Analyst and Copilot system messages.
 */

import { fetchMPE, type TimeConfluenceData } from '@/lib/goldenEggFetchers';
import { classifyBestDoctrine, type ClassifierInput } from '@/lib/doctrine/classifier';
import { getIndicators, getQuote } from '@/lib/onDemandFetch';

export interface IntelligenceContextResult {
  /** Formatted system message for AI injection, or null if no symbol */
  systemMessage: string | null;
  /** Raw MPE data */
  mpe: { composite: number; label: string; direction: string; time: number; volatility: number; liquidity: number; options: number; summary: string } | null;
  /** Raw doctrine match */
  doctrine: { id: string; confidence: number; reasons: string[]; regimeCompatible: boolean } | null;
}

/**
 * Gather MPE + Doctrine intelligence for a symbol to inject into AI context.
 * Gracefully returns nulls if any data source fails.
 */
export async function fetchIntelligenceContext(
  symbol: string | undefined,
  opts?: {
    assetClass?: string;
    scanData?: Record<string, any>;
    tcData?: TimeConfluenceData | null;
  }
): Promise<IntelligenceContextResult> {
  if (!symbol) return { systemMessage: null, mpe: null, doctrine: null };

  const assetClass = opts?.assetClass || inferAssetClass(symbol);

  // Fetch MPE and indicators in parallel
  const [mpeResult, indicators] = await Promise.all([
    fetchMPE(symbol, assetClass, opts?.tcData).catch(() => null),
    getIndicators(symbol, 'daily').catch(() => null),
  ]);

  // Build MPE context
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

  // Build Doctrine context from available indicators + scan data
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

  // Build system message
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

  if (mpe || doctrine) {
    parts.push(`
INTELLIGENCE INSTRUCTIONS:
- Reference the MPE composite score when discussing trade timing and position sizing.
- If MPE < 25, recommend standing aside regardless of other signals.
- Name the active doctrine playbook when framing the trade setup type.
- If doctrine is not regime-compatible, flag this as a risk factor.`);
  }

  const systemMessage = parts.length > 1 ? parts.join('\n') : null;

  return { systemMessage, mpe, doctrine };
}

function inferAssetClass(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.includes('USDT') || s.includes('-USD') || s.endsWith('BTC') ||
      ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'ADA', 'AVAX', 'LINK', 'MATIC', 'LTC', 'DOT'].includes(s.replace(/[-/].*$/, ''))) {
    return 'crypto';
  }
  return 'equity';
}
