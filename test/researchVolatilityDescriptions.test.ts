import { describe, it, expect } from 'vitest';
import { computeBBWP, computeDVE } from '@/lib/directionalVolatilityEngine';
import { BBWP } from '@/lib/directionalVolatilityEngine.constants';
import { bbwpDisplay, breakoutConditions, measuredBbwp, phaseDuration, projectionStudy, trapDescription } from '@/lib/research/volatilityDescriptions';

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
    const b = breakoutConditions({ score: 100, label: 'HIGH', components: { volCompression: 40, timeAlignment: 30, gammaWall: 20, adxRising: 10 }, componentDetails: ['BBWP < 15: extreme compression (40/40)', 'Squeeze active (+10)'] });
    expect(b.headline).toBe('4 of 4 setting conditions present. They describe the setting; they are not a breakout or a signal.');
    expect(b.conditions.find((c) => c.id === 'gammaWall')!.label).toBe('Price near max pain');
    expect(b.details).toEqual(['BBWP < 15: extreme compression', 'Squeeze active']);
    const na = breakoutConditions({ score: 40, label: 'LOW', components: { volCompression: 40, timeAlignment: 0, gammaWall: 0, adxRising: 3 }, componentDetails: [] }, ['options', 'time']);
    expect(na.headline).toBe('1 of 2 setting conditions present (2 not collected). They describe the setting; they are not a breakout or a signal.');
  });
  it('phase persistence is stated as lengths, not probabilities', () => {
    expect(phaseDuration('contraction', { currentBars: 12, averageBars: 9.44, medianBars: 8, maxBars: 20, agePercentile: 78.6, episodeCount: 14 }))
      .toBe('This contraction phase has lasted 12 bars. Earlier contraction phases on this symbol (14): median 8, average 9.4, longest 20 bars. 79% of them were this long or shorter.');
    expect(phaseDuration('expansion', { currentBars: 0, averageBars: 0, medianBars: 0, maxBars: 0, agePercentile: 0, episodeCount: 0 })).toBe('No expansion phase is active.');
  });
  it('the past-case study states its sample and limits', () => {
    const s = projectionStudy({ signalType: 'compression_release_up', expectedMovePct: 2.1, medianMovePct: 1.4, maxHistoricalMovePct: 6.2, averageBarsToMove: 9.5, hitRate: 62.5, sampleSize: 8, dispersionPct: 3.3, projectionQuality: 'low', projectionQualityScore: 20, projectionWarning: '' } as any, 20)!;
    expect(s.lines[1]).toBe('5 of 8 closed higher.');
    expect(s.method).toContain('not a forecast or a win rate');
    expect(projectionStudy({ signalType: 'none' } as any, 20)).toBeNull();
  });
  it('trap text lists observations without a score', () => {
    expect(trapDescription({ detected: false, candidate: true, score: 55, components: ['BBWP 12 compressed (+25)'], compressionLevel: 12, gammaLockDetected: false, timeClusterApproaching: true })).toBe('Some trap conditions present: BBWP 12 compressed.');
  });
});
