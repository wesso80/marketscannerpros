import { describe, expect, it } from 'vitest';
import { BANNED_PATTERNS, DISCLAIMER_NEGATIONS, PHRASE_ALLOWLIST, SCAN_EXCLUSIONS, disclaimerCovers, isCompositeFraction, scanCompositeFractions, scanCustomerCopy } from './customerRenderedCopy';

describe('customer-rendered copy has no scores, grades, verdicts, or banned words', () => {
  it('fails when banned words appear outside the documented allowlist', () => {
    const hits = scanCustomerCopy();
    expect(hits.map((hit) => `${hit.file}:${hit.line} [${hit.word}] ${hit.text}`)).toEqual([]);
  });

  it('documents a small allowlist and the admin and homepage exclusions', () => {
    expect(PHRASE_ALLOWLIST.length).toBeLessThanOrEqual(12);
    expect(PHRASE_ALLOWLIST.every((entry) => entry.reason.length > 20)).toBe(true);
    expect(SCAN_EXCLUSIONS.map((entry) => entry.reason).join('\n')).toMatch(/Admin pages/);
    expect(SCAN_EXCLUSIONS.some((entry) => entry.test('app/page.tsx'))).toBe(false);
    expect(SCAN_EXCLUSIONS.some((entry) => entry.test('components/public-design/ResearchHome.tsx'))).toBe(false);
    expect(BANNED_PATTERNS.some((entry) => entry.id === 'expected-r')).toBe(true);
    expect(DISCLAIMER_NEGATIONS).toEqual([
      'not a rating',
      'not a ranking',
      'not a probability of profit',
      'not a promised result',
    ]);
    const ranking = 'These rows are not a ranking of symbols.';
    const at = ranking.toLowerCase().indexOf('ranking');
    expect(disclaimerCovers(ranking, at, 'ranking'.length)).toBe(true);
    const score = 'This is not a score.';
    const scoreAt = score.toLowerCase().indexOf('score');
    expect(disclaimerCovers(score, scoreAt, 'score'.length)).toBe(false);
    expect(isCompositeFraction('😱 EXTREME FEAR: 12/100 (Extreme Fear)')).toBe(false);
    expect(isCompositeFraction('MPE 80/100')).toBe(true);
    expect(isCompositeFraction('/100 (threshold: ')).toBe(true);
  });

  it('fails when customer copy prints a composite N/100', () => {
    const hits = scanCompositeFractions();
    expect(hits.map((hit) => `${hit.file}:${hit.line} ${hit.text}`)).toEqual([]);
  });
});
