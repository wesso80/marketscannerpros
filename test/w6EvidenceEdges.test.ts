import { describe, expect, it } from 'vitest';
import { buildPriceEvidence, type EvidenceBar } from '@/lib/research/priceEvidence';
import { buildResearchSnapshot, type SnapshotCanonical } from '@/lib/research/researchSnapshot';
import { describeStates } from '@/lib/research/descriptiveStates';
import { independence } from '@/lib/research/evidenceInputs';

const now = Date.parse('2026-10-08T12:00:00Z');
const canonical: SnapshotCanonical = {
  symbol: 'BTC', assetClass: 'crypto', priceTs: null,
  lastCompletedBarAt: '2026-10-08T11:00:00Z', source: 'fixture',
  dataTrust: { level: 'GOOD', label: 'Good', reasons: [] }, options: null, fundamentals: null,
};
function evidence(volume: number, lastVolume = volume, lastClose = 100) {
  const bars: EvidenceBar[] = Array.from({ length: 300 }, (_, i) => ({
    date: new Date(now - (301 - i) * 86400000).toISOString().slice(0, 10),
    close: i === 299 ? lastClose : 100, high: 102, low: 98,
    volume: i === 299 ? lastVolume : volume,
  }));
  return buildPriceEvidence({ symbol: 'BTC', assetClass: 'crypto', bars, nowMs: now });
}

describe('W6 evidence boundaries', () => {
  it('never uses an intraday canonical bar as the daily evidence date', () => {
    const s = buildResearchSnapshot({ canonical });
    expect(s.dates.find(d => d.id === 'bar')).toMatchObject({ value: null, basis: 'daily evidence unavailable' });
    const pe = evidence(100);
    expect(buildResearchSnapshot({ canonical, priceEvidence: pe }).dates.find(d => d.id === 'bar')?.value).toBe(pe.basis.lastCompletedBar);
  });
  it('counts only applicable volatility inputs for crypto', () => {
    const state = (pe?: ReturnType<typeof evidence>) => buildResearchSnapshot({ canonical, priceEvidence: pe }).sections.find(s => s.id === 'volatility')!.status;
    expect(state()).toBe('missing');
    const pe = evidence(100);
    expect(state({ ...pe, atr14: null, bbwp: null, realisedVol20: null })).toBe('missing');
    expect(state({ ...pe, bbwp: null, realisedVol20: null })).toBe('partial');
    expect(state(pe)).toBe('available');
  });
  it.each([0, 100])('zero prior volume with last volume %s is unavailable in JSON and state', last => {
    const pe = evidence(0, last);
    expect(pe.volumeRatio).toBeNull();
    expect(pe.states.volume).toBeNull();
    expect(pe.missing.join(' ')).toContain('positive mean');
    expect(JSON.parse(JSON.stringify(pe)).states.volume).toBeNull();
  });
  it('observed zero last volume with a positive baseline remains zero', () => {
    const pe = evidence(100, 0);
    expect(pe.volumeRatio).toBe(0);
    expect(pe.states.volume).toBe('below average');
  });
  it.each([100, 100.01])('does not call at-average/tolerance relations strictly between (%s)', close => {
    const pe = evidence(100, 100, close);
    expect(pe.states.longerAverages).toBe('mixed');
    expect(describeStates(pe)[0].state).toContain('at');
    expect(pe.summary.join(' ')).not.toContain('between');
    expect(buildResearchSnapshot({ canonical, priceEvidence: pe }).summary.join(' ')).not.toContain('between');
  });
  it('describes the actual OR condition for release, not mandatory widening', () => {
    const release = describeStates(evidence(100), { type: 'compression_release_up', state: 'fired' }).find(s => s.id === 'release')!;
    expect(release.definition).toContain('either above its five-bar mean or accelerating');
    expect(release.definition).not.toContain('while widening');
  });
  it('counts distinct families without claiming statistical independence', () => {
    const result = independence([{ text: 'SMA', input: 'price-history' }, { text: 'RSI', input: 'price-history' }, { text: 'volume', input: 'volume' }]);
    expect(result.independentInputs).toBe(2); // existing wire field remains compatible
    expect(result.note).toContain('2 distinct input families');
    expect(result.note).not.toContain('independent inputs');
  });
});
