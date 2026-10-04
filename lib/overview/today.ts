import type { MarketStatusItem } from '@/components/market/MarketStatusStrip';
import { COPY } from '@/components/visual/copy';
export type SectorInput = { symbol: string; name: string; changePercent: number | null };
const tones = {
  up: { color: 'var(--msp-bull)', opacity: 0.18 }, strongUp: { color: 'var(--msp-bull)', opacity: 0.38 },
  down: { color: 'var(--msp-bear)', opacity: 0.18 }, strongDown: { color: 'var(--msp-bear)', opacity: 0.38 },
  flat: { color: 'var(--msp-flat)', opacity: 0.12 },
} as const;
export function sectorTone(value: number | null) {
  return tones[value == null || !Number.isFinite(value) || value === 0 ? 'flat' : value > 0 ? value >= 1 ? 'strongUp' : 'up' : value <= -1 ? 'strongDown' : 'down'];
}
export function sectorCells(sectors: SectorInput[]) {
  return sectors.map(s => ({ ...s, changePercent: typeof s.changePercent === 'number' && Number.isFinite(s.changePercent) ? s.changePercent : null }))
    .sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity))
    .map(s => ({ ...s, valueLabel: s.changePercent === null ? COPY.today.na : `${s.changePercent > 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`, tone: sectorTone(s.changePercent) }));
}
/** Health and observation time are separate: Unknown health can still carry a dated observation. */
export function dataStatusSummary(items: MarketStatusItem[]) {
  return items.reduce((counts, item) => {
    const label = item.statusLabel?.toLowerCase();
    if (item.status?.degraded || item.status?.simulated || label === 'degraded') counts.degraded++;
    if (item.status?.stale || label === 'stale') counts.stale++;
    const hasTime = Boolean(item.computedAt && Number.isFinite(new Date(item.computedAt).getTime()))
      || (item.notes ?? []).some(note => !/time unknown/i.test(note) && /\b(?:\d{4}-\d{2}-\d{2}|\d{2}:\d{2})\b/.test(note));
    if (!hasTime) counts.notTimed++;
    return counts;
  }, { degraded: 0, stale: 0, notTimed: 0 });
}
