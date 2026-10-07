import { PRICE_EVIDENCE, type PriceEvidence } from '@/lib/research/priceEvidence';
import type { VolatilityRelease } from '@/lib/research/researchSnapshot';
import { VOL_REGIME } from '@/lib/directionalVolatilityEngine.constants';

/**
 * Descriptive states for the Symbol page (ticker research page, Phase 4). They replace grades, readiness scores and
 * permission verdicts: each state is a plain description of one measurement, shown beside the definition that
 * produced it. None of them is a probability or a recommendation.
 */
export type DescriptiveState = { id: 'averages' | 'trend' | 'volatility' | 'volume' | 'release'; label: string; state: string; definition: string };

export function describeStates(pe: PriceEvidence | null | undefined, release?: VolatilityRelease): DescriptiveState[] {
  const P = PRICE_EVIDENCE, out: DescriptiveState[] = [];
  const bar = pe?.basis.lastCompletedBar ? ` on the completed ${pe.basis.lastCompletedBar} bar` : '';
  const la = pe?.states.longerAverages ?? null;
  out.push({ id: 'averages', label: 'Longer averages', state: la == null ? 'not measured' : la === 'mixed' ? 'mixed or at the 50- and 200-day' : `${la} the 50- and 200-day`, definition: `Close compared with the 50- and 200-day simple averages${bar}.` });
  out.push({ id: 'trend', label: 'Trend strength', state: pe?.states.trend ? `${pe.states.trend} (ADX ${pe.adx.adx})` : 'not measured', definition: `ADX14: below ${P.adx.developing} weak, ${P.adx.developing}–${P.adx.strong} developing, ${P.adx.strong} or more strong. Strength only, not direction.` });
  out.push({ id: 'volatility', label: 'Volatility', state: pe?.states.volatility ? `${pe.states.volatility} (BBWP ${pe.bbwp})` : 'not measured', definition: `BBWP (band-width percentile over one year): below ${P.bbwp.compressed} compressed, above ${P.bbwp.expanded} expanded.` });
  out.push({ id: 'volume', label: 'Volume', state: pe?.states.volume ? `${pe.states.volume} (${pe.volumeRatio}×)` : 'not measured', definition: `Last completed bar ÷ mean of the prior ${P.volumeLookback}: below ${P.volume.below}× below average, above ${P.volume.above}× above average.` });
  if (release !== undefined) {
    const s = release === null ? 'not available' : /release/.test(release.type) && release.state === 'fired' ? `recorded (${release.type.endsWith('_up') ? 'upward' : 'downward'})` : release.state === 'armed' ? 'condition watched, not met' : 'not recorded';
    out.push({ id: 'release', label: 'Volatility release', state: s, definition: `Volatility engine rule on its latest reading: BBWP was at or below ${VOL_REGIME.COMPRESSION_THRESHOLD} in recent bars and is now above it and either above its five-bar mean or accelerating, with momentum and the engine's direction agreeing. The engine's compression line (${VOL_REGIME.COMPRESSION_THRESHOLD}) differs from this page's (${PRICE_EVIDENCE.bbwp.compressed}).` });
  }
  return out;
}
