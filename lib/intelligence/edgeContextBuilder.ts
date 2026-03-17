/**
 * Edge Context Builder — v3.2 Adaptive Intelligence
 *
 * Builds a human-readable edge profile summary for injection into
 * AI analyst system prompts. Fetches edge summary from the database
 * and formats it as a context block for the LLM.
 *
 * Guardrail: AI should use history as context, NOT override market signals.
 */

import { computeEdgeProfile } from '@/lib/intelligence/edgeProfile';
import type { EdgeSummary, SoftEdgeHints } from '@/lib/intelligence/edgeProfile';

export interface EdgeContext {
  /** System message to inject into AI analyst prompt. Null if insufficient data. */
  systemMessage: string | null;
  /** Raw summary for programmatic use. */
  summary: EdgeSummary | null;
  /** Hints for scanner. */
  hints: SoftEdgeHints;
}

/**
 * Fetch edge profile and build AI-ready context for the analyst.
 * Returns null systemMessage if the trader has insufficient data.
 * Non-blocking: catches all errors and returns empty context on failure.
 */
export async function getEdgeContext(workspaceId: string): Promise<EdgeContext> {
  const empty: EdgeContext = { systemMessage: null, summary: null, hints: { preferredAssets: [], preferredSides: [], preferredStrategies: [], preferredRegimes: [], hasEnoughData: false } };

  try {
    const profile = await computeEdgeProfile(workspaceId, {
      dimensions: ['overall', 'asset_class', 'side', 'strategy', 'regime'],
    });

    const { edgeSummary, softEdgeHints } = profile;
    if (!edgeSummary) return { ...empty, hints: softEdgeHints };

    const lines: string[] = [
      'Trader Edge Profile (from closed trade history):',
    ];

    if (edgeSummary.strongestStrategy) {
      lines.push(`- Historically performs best with "${edgeSummary.strongestStrategy}" strategies.`);
    }
    if (edgeSummary.strongestRegime) {
      lines.push(`- Best regime: ${edgeSummary.strongestRegime.replace(/_/g, ' ')}.`);
    }
    if (edgeSummary.strongestAssetClass) {
      lines.push(`- Preferred asset class: ${edgeSummary.strongestAssetClass}.`);
    }
    if (edgeSummary.preferredSide) {
      lines.push(`- Preferred direction: ${edgeSummary.preferredSide.toLowerCase()}.`);
    }

    lines.push(`- Overall win rate: ${(edgeSummary.overallWinRate * 100).toFixed(0)}%.`);
    lines.push(`- Average R: ${edgeSummary.avgR.toFixed(2)}.`);
    lines.push(`- Expectancy: ${edgeSummary.expectancy.toFixed(2)}R per trade.`);

    if (edgeSummary.profitFactor < 999) {
      lines.push(`- Profit factor: ${edgeSummary.profitFactor.toFixed(2)}.`);
    }

    lines.push(`- Profile confidence: ${(edgeSummary.confidence * 100).toFixed(0)}%.`);
    lines.push('');
    lines.push('Use this history to tailor analysis and highlight setups that align with the trader\'s proven edges.');
    lines.push('IMPORTANT: Do NOT override current market signals based solely on trader history. Market data takes priority.');

    return {
      systemMessage: lines.join('\n'),
      summary: edgeSummary,
      hints: softEdgeHints,
    };
  } catch {
    return empty;
  }
}
