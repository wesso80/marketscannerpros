import { independence, INPUT_LABEL, type EvidenceInput, type TaggedPoint } from '@/lib/research/evidenceInputs';
import { OI_BASIS, putCallTilt } from '@/lib/options/oiSummary';
import { PRICE_EVIDENCE, type PriceEvidence } from '@/lib/research/priceEvidence';
import type { TimingEvidence } from '@/lib/research/timingEvidence';
import type { ResearchSnapshot } from '@/lib/research/researchSnapshot';
import type { VolatilityEvidence } from '@/lib/research/volatilityEvidence';

/**
 * Evidence summary for the Symbol page (Phase 3): the observations grouped by the input they come from (so readings
 * of one price series are not counted as separate confirmations), where methods or dates differ, what is missing,
 * and what to check again when new data arrives. Descriptive only: no score and no conclusion is drawn.
 */
export type EvidenceGroup = { input: EvidenceInput; label: string; observations: string[] };
export type EvidenceSummary = { groups: EvidenceGroup[]; independenceNote: string;
  /** Short line for the closed fold: observations, independent inputs, differences and missing items. */
  headline: string; differences: string[]; missing: string[]; recheck: string[] };

const fmtUtc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

export function buildEvidenceSummary(input: {
  symbol: string;
  assetClass: 'equity' | 'crypto' | 'forex';
  snapshot: ResearchSnapshot;
  priceEvidence?: PriceEvidence | null;
  volatility?: VolatilityEvidence | null;
  timing?: TimingEvidence | null;
  options?: { expiry: string; snapshotTs: string; putCallOi: number | null; avgIvPct: number | null } | null;
  fundamentals?: { lastReportedQuarter: string | null; revenueGrowthYoy: number | null; earningsGrowthYoy: number | null } | null;
}): EvidenceSummary {
  const pe = input.priceEvidence ?? null, o = input.options ?? null, f = input.fundamentals ?? null, te = input.timing ?? null;
  const points: TaggedPoint[] = [];
  const add = (input: EvidenceInput, text: string | null | false | undefined) => { if (text) points.push({ input, text }); };

  if (pe) {
    const bar = pe.basis.lastCompletedBar;
    const la = pe.states.longerAverages;
    add('price-history', la && (la === 'mixed' ? `Close between the 50- and 200-day averages (${bar})` : `Close ${la} the 50- and 200-day averages (${bar})`));
    add('price-history', pe.states.trend && `Trend strength ${pe.states.trend} (ADX ${pe.adx.adx})`);
    add('price-history', pe.rsi14 != null && `RSI14 ${pe.rsi14}`);
    add('price-history', pe.states.volatility && `Volatility ${pe.states.volatility} (BBWP ${pe.bbwp})`);
    add('price-history', pe.realisedVol20 != null && `Realised volatility ${pe.realisedVol20}% (20 days)`);
    add('volume', pe.states.volume && `Volume ${pe.states.volume} (${pe.volumeRatio}× the prior ${PRICE_EVIDENCE.volumeLookback} sessions)`);
  }
  if (o) {
    const tilt = putCallTilt(o.putCallOi);
    add('options', o.putCallOi != null && `Put/call open interest ${o.putCallOi}${tilt ? `, ${tilt}` : ''} (${o.expiry} expiry, strikes within ±${OI_BASIS.ratioRangePct}% of spot, quotes ${o.snapshotTs.slice(0, 10)})`);
    add('options', o.avgIvPct != null && `Implied volatility ${o.avgIvPct}% (mean across strikes, ${o.expiry} expiry)`);
  }
  if (f) {
    const g = (v: number | null) => (v == null ? null : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
    add('fundamentals', (f.revenueGrowthYoy != null || f.earningsGrowthYoy != null) && `Revenue ${g(f.revenueGrowthYoy) ?? 'n/a'} and earnings ${g(f.earningsGrowthYoy) ?? 'n/a'} year on year (quarter ${f.lastReportedQuarter ?? 'not recorded'})`);
  }
  add('calendar', input.snapshot.nextEvent && `Next known event: ${input.snapshot.nextEvent}`);

  const order: EvidenceInput[] = ['price-history', 'volume', 'options', 'fundamentals', 'calendar'];
  const groups: EvidenceGroup[] = order.map((i) => ({ input: i, label: INPUT_LABEL[i], observations: points.filter((p) => p.input === i).map((p) => p.text) })).filter((g) => g.observations.length);
  const ind = independence(points, 'observations');

  const differences: string[] = [];
  if (pe?.quote && pe.close != null) {
    const d = Math.round(((pe.quote.price - pe.close) / pe.close) * 10000) / 100;
    if (Math.abs(d) >= 0.01) differences.push(`Latest price ${pe.quote.price}${pe.quote.at ? ` (${pe.quote.at.includes('T') ? fmtUtc(pe.quote.at) : pe.quote.at})` : ''} is ${d > 0 ? '+' : ''}${d}% from the ${pe.basis.lastCompletedBar} close (${pe.close}) used by the daily measures.`);
  }
  if (pe?.basis.excludedPartialBar) differences.push(`The unfinished ${pe.basis.excludedPartialBar} daily bar is not used; daily measures describe ${pe.basis.lastCompletedBar}.`);
  for (const n of input.volatility?.notes ?? []) differences.push(n);

  const missing: string[] = [];
  for (const s of input.snapshot.sections) if (s.status === 'missing' || s.status === 'partial') missing.push(`${s.label}: ${s.note}`);
  for (const m of pe?.missing ?? []) missing.push(m);

  const recheck: string[] = [];
  const dailyClose = te?.closes.find((c) => c.timeframe === 'daily');
  if (dailyClose) recheck.push(`Daily measures update after the next daily close (${fmtUtc(dailyClose.closesAtUtc)}).`);
  if (input.assetClass === 'equity' && o && pe?.basis.lastCompletedBar && o.snapshotTs.slice(0, 10) < pe.basis.lastCompletedBar) recheck.push(`Options quotes are from ${o.snapshotTs.slice(0, 10)}; check again when the chain refreshes.`);
  if (input.snapshot.nextEvent && !/^No /.test(input.snapshot.nextEvent)) recheck.push(`Review after the next known event: ${input.snapshot.nextEvent}.`);
  if (te?.releasesBasis?.status === 'unavailable') recheck.push('Scheduled releases were not checked (calendar unavailable); check again later.');

  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const headline = ind.points
    ? `${plural(ind.points, 'observation')} from ${plural(ind.independentInputs, 'independent input')} · ${plural(differences.length, 'difference')} · ${missing.length} missing or partial`
    : `No observations · ${missing.length} missing or partial`;
  return { groups, independenceNote: ind.note, headline, differences, missing, recheck };
}
