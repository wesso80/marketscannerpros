import { describe, expect, it } from 'vitest';
import { BANNED_PATTERNS, PHRASE_ALLOWLIST, SCAN_EXCLUSIONS, scanCustomerCopy } from './customerRenderedCopy';

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
  });
});
