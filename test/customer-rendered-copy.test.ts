import { describe, expect, it } from 'vitest';
import { PHRASE_ALLOWLIST, SCAN_EXCLUSIONS, scanCustomerCopy } from './customerRenderedCopy';

describe('customer-rendered copy has no scores, grades, verdicts, or banned words', () => {
  it('fails when banned words appear outside the documented allowlist', () => {
    const hits = scanCustomerCopy();
    expect(hits.map((hit) => `${hit.file}:${hit.line} [${hit.word}] ${hit.text}`)).toEqual([]);
  });

  it('documents a small allowlist and the admin and homepage exclusions', () => {
    expect(PHRASE_ALLOWLIST.length).toBeLessThanOrEqual(12);
    expect(PHRASE_ALLOWLIST.every((entry) => entry.reason.length > 20)).toBe(true);
    expect(SCAN_EXCLUSIONS.map((entry) => entry.reason).join('\n')).toMatch(/Admin pages/);
    expect(SCAN_EXCLUSIONS.map((entry) => entry.reason).join('\n')).toMatch(/separate PR/);
  });
});
