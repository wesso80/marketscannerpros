import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gradeBasis, gradeRelativeNote, priceChangeBasisLabel } from '@/lib/scoring/canonical/display';

const calibrated = (direction: 'long' | 'short', expectedR: number) => ({
  score: 95, grade: 'A' as const, permission: 'WATCH' as const, direction, setupType: 'EXHAUSTION_FADE',
  scoreBasis: 'calibrated_expectancy_percentile' as const,
  calibration: { expectedR, pTargetFirst: 0.27, sample: 3122, validatedEdge: false } as never,
});

describe('RS-17: calibrated grade is relative within its direction', () => {
  it('META-style A short with negative expected R says it is the relative best, not a positive edge', () => {
    const note = gradeRelativeNote(calibrated('short', -0.17))!;
    expect(note).toContain('Grade is relative within direction');
    expect(note).toContain('other short setups, not against zero');
    expect(note).toContain('Expected R is still -0.17R');
    expect(note).toContain('not a positive edge');
  });
  it('positive expected R gets only the relative sentence', () => {
    const note = gradeRelativeNote(calibrated('long', 0.12))!;
    expect(note).toContain('other long setups');
    expect(note).not.toContain('Expected R is still');
  });
  it('no note for uncalibrated results or no setup', () => {
    expect(gradeRelativeNote({ score: 70, permission: 'WATCH', scoreBasis: 'factor_alignment_uncalibrated' } as never)).toBeNull();
    expect(gradeRelativeNote({ ...calibrated('long', 0.1), setupType: 'NONE' })).toBeNull();
    expect(gradeRelativeNote(null)).toBeNull();
  });
  it('the grade tooltip (gradeBasis) carries the same sentence; the grade itself is unchanged (no cap)', () => {
    const c = calibrated('short', -0.17);
    expect(gradeBasis(c)).toContain('Grade A from the Setup score 95');
    expect(gradeBasis(c)).toContain('Grade is relative within direction');
  });
});

describe('RS-19: labelled change basis and IV definitions', () => {
  it('equities read vs prior close; crypto names its basis', () => {
    expect(priceChangeBasisLabel('equity', 'rolling_24h')).toBe('vs prior close');
    expect(priceChangeBasisLabel('crypto', 'rolling_24h')).toBe('24h');
    expect(priceChangeBasisLabel('crypto', { barInterval: '1d' })).toBe('since 00:00 UTC');
    expect(priceChangeBasisLabel('crypto', { barInterval: '1w' })).toBe('since Mon 00:00 UTC');
    expect(priceChangeBasisLabel('crypto', { barInterval: '1h' })).toBe('since last 1h bar close');
    expect(priceChangeBasisLabel('crypto', { barInterval: null })).toBe('since last bar close');
  });
  it('Golden Egg options evidence shows ATM IV and labels the all-strike mean', () => {
    const engine = readFileSync('lib/goldenEgg/engine.ts', 'utf8');
    expect(engine).toContain("label: 'ATM IV (strikes within 2% of spot)', value: c.atmIv");
    expect(engine).toContain("label: 'Mean IV, all strikes', value: c.avgIv");
    expect(engine).not.toContain("'Avg IV (chain)'");
  });
  it('Golden Egg and Deep Analysis label their % change', () => {
    const ge = readFileSync('app/tools/golden-egg/page.tsx', 'utf8');
    expect(ge).toContain("toFixed(2)}% {priceChangeBasisLabel(ge.meta.assetClass, 'rolling_24h')}");
    const da = readFileSync('app/tools/deep-analysis/page.tsx', 'utf8');
    expect(da).toContain('priceChangeBasisLabel(result.assetType, { barInterval: ge.barInterval })');
    expect(da).not.toContain("{ge ? 'vs prior close' : '24h'}");
  });
});
