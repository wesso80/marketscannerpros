import type { ZoneDurationStats } from '@/lib/directionalVolatilityEngine.types';
import type { BreakoutConditionId, PublicBreakout, PublicPinnedCompression, PublicProjection, PublicStretch } from '@/lib/research/publicDve';

/**
 * Words for the Volatility engine's outputs (ticker research page, Phase 4). The engine keeps its internal weights;
 * the page shows what was measured instead of heuristic points presented as scores or probabilities:
 *   • breakout "readiness" → which setting conditions are present (not a breakout, not a signal);
 *   • continuation / exit "probabilities" (additive points) → the phase's length against this symbol's past phases;
 *   • exhaustion and trap scores → their label and the observations behind it;
 *   • the historical projection → a described study of past BBWP crossings, with its sample and limits.
 */
// W3: the public /api/dve reading already carries observations without points and conditions as present/absent.

export type BreakoutCondition = { id: BreakoutConditionId; label: string; present: boolean | null; definition: string };
export function breakoutConditions(b: PublicBreakout, missingInputs: string[] = []): { conditions: BreakoutCondition[]; headline: string; details: string[] } {
  // A condition whose input was not collected is null in the public reading; the missing-input list is a fallback.
  const na = (key: BreakoutConditionId) => b.conditions[key] === null || (key === 'gammaWall' && missingInputs.includes('options'));
  const conditions: BreakoutCondition[] = [
    { id: 'volCompression', label: 'Volatility compressed', present: b.conditions.volCompression ?? null, definition: 'BBWP below 35 on the Volatility engine reading, or the squeeze flag from the indicator feed.' },
    { id: 'timeAlignment', label: 'Several timeframes closing together', present: na('timeAlignment') ? null : b.conditions.timeAlignment, definition: 'Two or more timeframe bars due to close in the same window.' },
    { id: 'gammaWall', label: 'Price near max pain', present: na('gammaWall') ? null : b.conditions.gammaWall, definition: 'Within 2% of the options max-pain strike, or unusual options activity. Max pain is an open-interest calculation, not observed dealer positioning.' },
    { id: 'adxRising', label: 'Trend strength not yet high', present: b.conditions.adxRising ?? null, definition: 'ADX14 at or below 25.' },
  ];
  const known = conditions.filter((c) => c.present !== null), n = known.filter((c) => c.present).length;
  const headline = `${n} of ${known.length} setting conditions present${known.length < conditions.length ? ` (${conditions.length - known.length} not collected)` : ''}. They describe the setting; they are not a breakout or a signal.`;
  return { conditions, headline, details: b.details };
}

export function phaseDuration(label: string, s: ZoneDurationStats): string {
  if (!s.currentBars) return `No ${label} phase is active.`;
  if (!s.episodeCount) return `This ${label} phase has lasted ${s.currentBars} bars; no earlier ${label} phases were found in the history.`;
  return `This ${label} phase has lasted ${s.currentBars} bars. Earlier ${label} phases on this symbol (${s.episodeCount}): median ${Math.round(s.medianBars * 10) / 10}, average ${Math.round(s.averageBars * 10) / 10}, longest ${s.maxBars} bars. ${Math.round(s.agePercentile)}% of them were this long or shorter.`;
}

/** Stretch observations (the engine's exhaustion inputs), without its points or LOW…EXTREME label. */
export function stretchDescription(e: PublicStretch): string {
  return e.observations.length ? e.observations.join('; ') : 'No stretch observations recorded';
}

const PINNED_LABEL: Record<keyof PublicPinnedCompression['conditions'], string> = {
  compressed: 'BBWP below 20',
  nearLargeOiStrike: 'Price near a large open-interest strike',
  timeframeClosesClustered: 'Several timeframe closes together',
};
/** Compression next to a large open-interest strike, as conditions (no "trap" verdict). */
export function pinnedCompressionDescription(t: PublicPinnedCompression): string {
  return (Object.keys(PINNED_LABEL) as Array<keyof typeof PINNED_LABEL>)
    .map((k) => `${PINNED_LABEL[k]}: ${t.conditions[k] === null ? 'not collected' : t.conditions[k] ? 'yes' : 'no'}`).join(' · ');
}
export const pinnedConditionLabel = (k: keyof PublicPinnedCompression['conditions']) => PINNED_LABEL[k];

/** The past-case study, with its sample size, dated period and forward window; null when there is no recorded rule. */
export function projectionStudy(p: PublicProjection, forwardBars: number = p.period?.forwardBars ?? 20): { lines: string[]; method: string; period: string | null } | null {
  if (p.signalType === 'none') return null;
  const up = p.signalType.endsWith('_up'), release = p.signalType.startsWith('compression_release');
  const event = release ? 'BBWP rose back above the compression line' : 'BBWP entered the climax zone';
  const period = p.period ? `${p.period.timeframe} bars ${p.period.from ?? 'date not recorded'} to ${p.period.to ?? 'date not recorded'} (${p.period.bars} bars searched)` : null;
  const method = `Historical return statistics, in-sample on this symbol's own history${period ? ` (${period})` : ''}: each past bar where ${event}, and the close ${forwardBars} bars later. `
    + `The event is simpler than the full rule (no momentum or direction check), windows can overlap, and the sample is small. It describes this symbol's past, not a forecast or a win rate.`;
  const s = p.stats;
  if (!s) return { lines: [p.note], method, period };
  return {
    lines: [
      `Sample: ${p.sampleSize} past cases${period ? `, ${period}` : ''}.`,
      `Close ${forwardBars} bars later: mean ${s.meanReturnPct >= 0 ? '+' : ''}${s.meanReturnPct}%, median ${s.medianReturnPct >= 0 ? '+' : ''}${s.medianReturnPct}%, spread (standard deviation) ${s.dispersionPct}%.`,
      `${s.casesInDirection} of ${p.sampleSize} closed ${up ? 'higher' : 'lower'}.`,
      `Largest move in the rule's direction within ${forwardBars} bars: ${s.largestMoveInRuleDirectionPct}%, reached after ${s.averageBarsToLargestMove} bars on average.`,
    ],
    method, period,
  };
}

/** BBWP as shown: never the placeholder; a partial-window value says so. */
export function bbwpDisplay(v: { bbwp: number | null; bbwpBasis?: { available: boolean; window: number; lookback: number; fullYear: boolean } }): { value: string | null; note: string | null } {
  const b = v.bbwpBasis;
  if (v.bbwp == null || (b && !b.available)) return { value: null, note: 'BBWP not available: too few closes to compute a band width.' };
  if (b && !b.fullYear) return { value: v.bbwp.toFixed(1), note: `Ranked over ${b.window} band widths, not a full year (${b.lookback}).` };
  return { value: v.bbwp.toFixed(1), note: null };
}

/** The Volatility engine's BBWP as a measurement, or null when it is the placeholder. */
export function measuredBbwp(v: { bbwp: number | null; bbwpBasis?: { available: boolean } } | null | undefined): number | null {
  if (!v || v.bbwp == null || !Number.isFinite(v.bbwp)) return null;
  return v.bbwpBasis && !v.bbwpBasis.available ? null : v.bbwp;
}
