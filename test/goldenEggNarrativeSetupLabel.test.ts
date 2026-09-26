/** RS-3 residual: the Golden Egg narrative names the setup in words, not as the raw engine code. */
import { describe, expect, it } from 'vitest';
import { canonicalNarrativeSummary } from '@/lib/goldenEgg/canonicalVerdict';
import type { CanonicalResult } from '@/lib/scoring/canonical/types';

const c = (over: Partial<CanonicalResult>): CanonicalResult => ({
  permission: 'WATCH', grade: 'A', direction: 'short', setupType: 'EXHAUSTION_FADE', score: 95, blockReasons: [], watchReasons: [], levels: null,
  ...over,
} as unknown as CanonicalResult);
const l1 = { confluenceScore: 40, direction: 'SHORT' as const };

describe('Golden Egg narrative: setup code in plain words', () => {
  it('WATCH reason "EXHAUSTION_FADE short: …" reads "exhaustion fade (short): …" (was "eXHAUSTION_FADE short")', () => {
    const s = canonicalNarrativeSummary('META', c({ watchReasons: [{ code: 'NO_VALIDATED_EDGE', message: 'EXHAUSTION_FADE short: no out-of-sample edge after costs (historical -0.174R per trade, target-first 27%, n=3122) — factors only' }] }), l1);
    expect(s).toMatch(/^META: a short exhaustion fade setup is forming but is on watch \(grade A\) because exhaustion fade \(short\): no out-of-sample edge after costs/);
    expect(s).not.toMatch(/EXHAUSTION_FADE|eXHAUSTION/);
  });
  it('BLOCK reason with a code reads in words too; unknown codes lose their underscores', () => {
    const s = canonicalNarrativeSummary('X', c({ permission: 'BLOCK', grade: 'F', setupType: 'TREND_CONTINUATION', direction: 'long', blockReasons: [{ code: 'NO_STRUCTURAL_STOP', message: 'TREND_CONTINUATION long: no confirmed swing' }] }), l1);
    expect(s).toContain('blocked — trend continuation (long): no confirmed swing');
    const u = canonicalNarrativeSummary('X', c({ watchReasons: [{ code: 'Z', message: 'NEW_THING short: detail' }] }), l1);
    expect(u).toContain('because new thing (short): detail');
  });
  it('does not mangle reasons that start with an acronym, and still lower-cases ordinary sentences', () => {
    const a = canonicalNarrativeSummary('X', c({ watchReasons: [{ code: 'Z', message: 'EMA200 is flat' }] }), l1);
    expect(a).toContain('because EMA200 is flat.');
    const b = canonicalNarrativeSummary('X', c({ watchReasons: [{ code: 'Z', message: 'Earnings in 3 days' }] }), l1);
    expect(b).toContain('because earnings in 3 days.');
  });
});
