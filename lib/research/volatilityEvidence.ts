import { bbwpBasisNote, PRICE_EVIDENCE, type PriceEvidence } from '@/lib/research/priceEvidence';
import { releaseStatement, type VolatilityRelease } from '@/lib/research/researchSnapshot';

/**
 * The Volatility section of the Symbol page (Phase 3): realised measures from completed daily bars, options-implied
 * measures from the chain with their own quote date, and the release reading in words. Each row names its basis;
 * implied and realised volatility are compared as numbers, not as a signal.
 */
export type VolatilityRow = { id: string; label: string; value: string; basis: string };
export type VolatilityEvidence = { rows: VolatilityRow[]; summary: string[]; notes: string[] };
export type VolatilityOptions = { expiry: string; snapshotTs: string; daysToExpiry: number; avgIvPct: number | null; expectedMovePct: number | null } | null;

const NA = 'Not available';

export function buildVolatilityEvidence(input: {
  assetClass: 'equity' | 'crypto' | 'forex';
  priceEvidence: PriceEvidence | null | undefined;
  options?: VolatilityOptions;
  release?: VolatilityRelease;
  /** The Volatility reading's own BBWP, when loaded, to explain a difference from the completed-bar value. */
  dveBbwp?: number | null;
}): VolatilityEvidence {
  const pe = input.priceEvidence ?? null, o = input.options ?? null, P = PRICE_EVIDENCE;
  const bar = pe?.basis.lastCompletedBar ?? null;
  const daily = bar ? `completed daily bar ${bar}` : 'no completed daily bars';
  const rows: VolatilityRow[] = [
    { id: 'atr', label: 'ATR14', value: pe?.atr14 != null ? `${pe.atr14} (${pe.atrPct}% of close)` : NA, basis: daily },
    { id: 'realised', label: 'Realised volatility (20 days, annualised)', value: pe?.realisedVol20 != null ? `${pe.realisedVol20}%` : NA, basis: `daily log returns, ${daily}` },
    { id: 'bbwp', label: 'BBWP (band-width percentile, 1 year)', value: pe?.bbwp != null ? `${pe.bbwp}${pe.states.volatility ? ` (${pe.states.volatility})` : ''}` : NA, basis: `below ${P.bbwp.compressed} compressed, above ${P.bbwp.expanded} expanded; ${daily}` },
  ];
  if (input.assetClass === 'equity') {
    const q = o ? `expiry ${o.expiry}, quotes ${o.snapshotTs.slice(0, 10)}` : 'options chain not collected';
    rows.push(
      { id: 'iv', label: 'Options implied volatility (mean across strikes)', value: o?.avgIvPct != null ? `${o.avgIvPct}%` : NA, basis: q },
      { id: 'expected-move', label: 'Options-implied move to expiry (±1 standard deviation)', value: o?.expectedMovePct != null ? `±${o.expectedMovePct}%` : NA, basis: o ? `${q}, ${o.daysToExpiry} days; a size, not a direction` : q },
    );
  }

  const summary: string[] = [];
  if (pe?.states.volatility) summary.push(`Daily volatility is ${pe.states.volatility} (BBWP ${pe.bbwp}).`);
  const rel = releaseStatement(input.release, pe?.states.volatility ?? null, true);
  if (rel) summary.push(rel);
  if (o?.avgIvPct != null && pe?.realisedVol20 != null) {
    const d = Math.round((o.avgIvPct - pe.realisedVol20) * 10) / 10;
    summary.push(`Options implied volatility (${o.avgIvPct}%, quotes ${o.snapshotTs.slice(0, 10)}) is ${Math.abs(d) < 0.5 ? 'close to' : `${Math.abs(d)} points ${d > 0 ? 'above' : 'below'}`} 20-day realised volatility (${pe.realisedVol20}%, bar ${bar}).`);
  }
  const notes: string[] = [];
  const bn = bbwpBasisNote(input.dveBbwp, pe);
  if (bn) notes.push(bn);
  if (input.assetClass === 'equity' && o && o.snapshotTs.slice(0, 10) !== bar) notes.push(`Options quotes (${o.snapshotTs.slice(0, 10)}) and the daily bar (${bar ?? 'n/a'}) are from different dates.`);
  return { rows, summary, notes };
}
