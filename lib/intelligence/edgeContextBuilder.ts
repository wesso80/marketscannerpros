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

    const confPct = Math.round(edgeSummary.confidence * 100);
    const confLabel = confPct >= 70 ? 'high' : confPct >= 40 ? 'moderate' : 'low';

    const lines: string[] = [
      `Trader Edge Profile (${confLabel} confidence, ${profile.totalOutcomes} closed trades):`,
    ];

    if (edgeSummary.strongestStrategy) {
      lines.push(`- Best strategy: "${edgeSummary.strongestStrategy}".`);
    }
    if (edgeSummary.strongestRegime) {
      lines.push(`- Best regime: ${edgeSummary.strongestRegime.replace(/_/g, ' ')}.`);
    }
    if (edgeSummary.preferredSide) {
      lines.push(`- Preferred direction: ${edgeSummary.preferredSide.toLowerCase()}.`);
    }
    lines.push(`- Win rate: ${(edgeSummary.overallWinRate * 100).toFixed(0)}%, Avg R: ${edgeSummary.avgR.toFixed(2)}, Expectancy: ${edgeSummary.expectancy.toFixed(2)}R.`);

    if (confLabel === 'low') {
      lines.push('NOTE: This profile has low statistical confidence. Treat these edges as preliminary patterns, not proven advantages.');
    }

    lines.push('');
    lines.push('When analyzing setups, mention alignment or conflict with these edges if relevant. Keep it brief.');
    lines.push('IMPORTANT: Current market data and signals always take priority over historical edge patterns. Do not recommend trades solely because they match the trader\'s historical profile.');

    return {
      systemMessage: lines.join('\n'),
      summary: edgeSummary,
      hints: softEdgeHints,
    };
  } catch {
    return empty;
  }
}
