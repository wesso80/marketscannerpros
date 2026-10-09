import { describe, it, expect } from 'vitest';
import { computeBBWP, computeDVE } from '@/lib/directionalVolatilityEngine';
import { BBWP } from '@/lib/directionalVolatilityEngine.constants';
import { bbwpDisplay, breakoutConditions, measuredBbwp, phaseDuration, pinnedCompressionDescription, projectionStudy, stretchDescription } from '@/lib/research/volatilityDescriptions';
import { publicObservation } from '@/lib/research/publicDve';

const closes = (n: number) => Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 5) * 3 + i * 0.05);

describe('BBWP basis (Phase 4: the 50 placeholder is never shown as a measurement)', () => {
  it('too few closes: placeholder flagged unavailable', () => {
    const r = computeBBWP(closes(BBWP.BB_LENGTH - 2));
    expect(r.available).toBe(false);
    expect(bbwpDisplay({ bbwp: r.bbwp, bbwpBasis: { available: r.available, window: r.window, lookback: BBWP.LOOKBACK, fullYear: false } }).value).toBeNull();
    expect(measuredBbwp({ bbwp: 50, bbwpBasis: { available: false } })).toBeNull();
  });
  it('less than a year: value shown with its window', () => {
    const r = computeBBWP(closes(100));
    expect(r.available).toBe(true);
    expect(r.window).toBe(100 - BBWP.BB_LENGTH + 1);
    const d = bbwpDisplay({ bbwp: r.bbwp, bbwpBasis: { available: true, window: r.window, lookback: BBWP.LOOKBACK, fullYear: false } });
    expect(d.note).toBe(`Ranked over ${r.window} band widths, not a full year (${BBWP.LOOKBACK}).`);
  });
  it('the engine reading carries the basis, flags a missing BBWP and words its summary without the placeholder', () => {
    const short = computeDVE({ price: { closes: closes(10), currentPrice: 100, changePct: 0, volume: 1, avgVolume: 1 } } as any, 'X');
    expect(short.volatility.bbwpBasis?.available).toBe(false);
    expect(short.dataQuality.missing).toContain('bbwp');
    expect(short.summary).toContain('BBWP not available');
    const year = computeDVE({ price: { closes: closes(400), currentPrice: 120, changePct: 0, volume: 1, avgVolume: 1 } } as any, 'X');
    expect(year.volatility.bbwpBasis?.fullYear).toBe(true);
    expect(year.summary).not.toMatch(/\/100|hit rate/);
  });
});

describe('Volatility wording', () => {
  it('breakout readiness becomes setting conditions, with max pain named as such', () => {
    // W3: the public reading carries the conditions as present/absent and the details without points (lib/research/publicDve).
    const b = breakoutConditions({ conditions: { volCompression: true, timeAlignment: true, gammaWall: true, adxRising: true }, details: ['BBWP < 15: extreme compression (40/40)', 'Squeeze active (+10)'].map((d) => publicObservation(d)!) });
    expect(b.headline).toBe('4 of 4 setting conditions present. They describe the setting; they are not a breakout or a signal.');
    expect(b.conditions.find((c) => c.id === 'gammaWall')!.label).toBe('Price near max pain');
    expect(b.details).toEqual(['BBWP < 15: extreme compression', 'Squeeze active']);
    // W3 DVE v2: an input that was not collected is null, never "not present".
    const na = breakoutConditions({ conditions: { volCompression: true, timeAlignment: null, gammaWall: null, adxRising: false }, details: [] });
    expect(na.headline).toBe('1 of 2 setting conditions present (2 not collected). They describe the setting; they are not a breakout or a signal.');
    expect(na.conditions.find((c) => c.id === 'timeAlignment')!.present).toBeNull();
  });
  it('phase persistence is stated as lengths, not probabilities', () => {
    expect(phaseDuration('contraction', { currentBars: 12, averageBars: 9.44, medianBars: 8, maxBars: 20, agePercentile: 78.6, episodeCount: 14 }))
      .toBe('This contraction phase has lasted 12 bars. Earlier contraction phases on this symbol (14): median 8, average 9.4, longest 20 bars. 79% of them were this long or shorter.');
    expect(phaseDuration('expansion', { currentBars: 0, averageBars: 0, medianBars: 0, maxBars: 0, agePercentile: 0, episodeCount: 0 })).toBe('No expansion phase is active.');
  });
  it('the past-case study states its sample and limits', () => {
    const period = { from: '2025-06-02', to: '2026-10-06', bars: 340, timeframe: 'daily', forwardBars: 20 };
    const s = projectionStudy({ signalType: 'compression_release_up', sampleSize: 8, minimumSample: 5, stats: { meanReturnPct: 2.1, medianReturnPct: 1.4, dispersionPct: 3.3, largestMoveInRuleDirectionPct: 6.2, averageBarsToLargestMove: 9.5, casesInDirection: 5 }, period, note: '' })!;
    expect(s.lines[0]).toBe('Sample: 8 past cases, daily bars 2025-06-02 to 2026-10-06 (340 bars searched).');
    expect(s.lines[2]).toBe('5 of 8 closed higher.');
    expect(s.method).toMatch(/^Historical return statistics, in-sample on this symbol's own history \(daily bars 2025-06-02 to 2026-10-06/);
    // Too few cases: no statistics, the note says so.
    const thin = projectionStudy({ signalType: 'compression_release_up', sampleSize: 3, minimumSample: 5, stats: null, period, note: 'Too few past cases (3 of the 5 needed), so no statistics are shown.' })!;
    expect(thin.lines).toEqual(['Too few past cases (3 of the 5 needed), so no statistics are shown.']);
    expect(s.method).toContain('not a forecast or a win rate');
    expect(projectionStudy({ signalType: 'none' } as any, 20)).toBeNull();
  });
  it('compression near a large OI strike is conditions without a trap verdict; stretch is observations without a label', () => {
    expect(pinnedCompressionDescription({ conditions: { compressed: true, nearLargeOiStrike: null, timeframeClosesClustered: null }, observations: [] }))
      .toBe('BBWP below 20: yes · Price near a large open-interest strike: not collected · Several timeframe closes together: not collected');
    expect(stretchDescription({ observations: ['StochK 88 > 80'] })).toBe('StochK 88 > 80');
    expect(stretchDescription({ observations: [] })).toBe('No stretch observations recorded');
    expect(['Time cluster 12/30 (display only; not included in score)', 'BBWP 12 compressed (+25)'].map(publicObservation)).toEqual([null, 'BBWP 12 compressed']);
  });
});
