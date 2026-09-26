import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gradeBasis } from '@/lib/scoring/canonical/display';
import { isNoSetupRow, noSetupRankedReason, rankedBiasTitle, rankedClaimedDirection, rankedScoreLabel } from '@/lib/scanner/rankedDisplay';
import type { CanonicalResult } from '@/lib/scoring/canonical/types';

const NO_SETUP_MSG = 'No setup type is eligible on this bar (closest: Trend continuation long — counter-trend: −DI ≥ +DI)';
function c(over: Partial<CanonicalResult>): CanonicalResult {
  return {
    permission: 'WATCH', grade: 'C', score: 10, factorScore: 60, direction: 'short', setupType: 'EXHAUSTION_FADE',
    scoreBasis: 'calibrated_expectancy_percentile', calibration: { percentile: 10 } as any, thresholds: null,
    blockReasons: [], watchReasons: [{ code: 'NO_VALIDATED_EDGE', message: 'no edge' }], flags: [], ...over,
  } as unknown as CanonicalResult;
}
const noSetup = (direction: string) => ({
  direction,
  canonical: c({ permission: 'BLOCK', grade: 'F', score: 0, direction: 'neutral', setupType: 'NONE' as any, blockReasons: [{ code: 'NO_SETUP', message: NO_SETUP_MSG }] }),
});

describe('grade basis tooltip', () => {
  it('SUI-USD case: Setup score 10 is the 10th percentile, and C covers everything below 60', () => {
    const t = gradeBasis(c({}));
    expect(t).toContain('Grade C from the Setup score 10 (10th percentile of calibrated expected R): A ≥ 85, B ≥ 60, C below.');
    expect(t).toContain('The MSP composite does not set the grade.');
  });
  it('names the caps (caution, low reward:risk, snapshot)', () => {
    const capped = gradeBasis(c({ score: 72, calibration: { percentile: 72 } as any, direction: 'long', watchReasons: [{ code: 'AT_OPPOSING_LEVEL', message: 'x' }, { code: 'RR_BELOW_MIN', message: 'y' }] }));
    expect(capped).toContain('Capped at C: at resistance.');
    expect(capped).toContain('Capped at C: reward:risk below 1.');
    const snap = gradeBasis(c({ grade: 'B', score: 90, calibration: null, scoreBasis: 'factor_alignment_uncalibrated', thresholds: { pass: 70, watch: 50, gradeA: 80, gradeB: 65 } as any, flags: [{ code: 'SNAPSHOT_GRADE_CAP', message: 'Capped at B: snapshot data, no swing structure' }] }));
    expect(snap).toContain('raw factor alignment, uncalibrated): A ≥ 80, B ≥ 65, C below.');
    expect(snap).toContain('Capped at B: snapshot data');
  });
  it('is the same text for long and short (apart from support/resistance wording)', () => {
    expect(gradeBasis(c({ direction: 'long' }))).toBe(gradeBasis(c({ direction: 'short' })));
  });
  it('F reads as not graded', () => {
    expect(gradeBasis(noSetup('bullish').canonical)).toMatch(/^Grade F: no setup/);
  });
});

describe('Ranked no-setup rows', () => {
  it('claim no direction, bullish or bearish', () => {
    for (const d of ['bullish', 'bearish']) {
      const r = noSetup(d);
      expect(isNoSetupRow(r)).toBe(true);
      expect(rankedClaimedDirection(r)).toBe('neutral');
      expect(rankedBiasTitle(r)).toContain(`factor lean: ${d}`);
    }
  });
  it('show the engine reason instead of "Trend supportive · Momentum supportive"', () => {
    expect(noSetupRankedReason(noSetup('bullish'))).toBe('No setup: Trend continuation long — counter-trend: −DI ≥ +DI');
  });
  it('setup rows keep their side and reason path', () => {
    const r = { direction: 'bearish', canonical: c({}) };
    expect(rankedClaimedDirection(r)).toBe('bearish');
    expect(noSetupRankedReason(r)).toBeNull();
    expect(rankedBiasTitle(r)).toBeUndefined();
    expect(rankedScoreLabel(r)).toBe('Setup');
    expect(rankedScoreLabel({ direction: 'bullish' })).toBe('MSP');
  });
});

describe('page and Pro table wiring', () => {
  const page = readFileSync('app/tools/scanner/page.tsx', 'utf8');
  const table = readFileSync('components/scanner/ScreenerTable.tsx', 'utf8');
  it('Ranked tabs count only claimed directions; reason and grade use the helpers', () => {
    expect(page).toContain("case 'Bullish': items = items.filter(r => rankedClaimedDirection(r) === 'bullish')");
    expect(page).toContain("Bearish: allResults.filter(r => rankedClaimedDirection(r) === 'bearish').length");
    expect(page).toContain('const noSetup = noSetupRankedReason(r);');
    expect(page).toContain('title={gradeBasis(r.canonical)}');
  });
  it('Pro table labels both numbers: "MSP 58/100" and "Setup 10 · sets grade"', () => {
    expect(table).toContain('>MSP</span>{r.confidence}');
    expect(table).toContain('Setup {r.canonical.score} · sets grade');
  });
});
