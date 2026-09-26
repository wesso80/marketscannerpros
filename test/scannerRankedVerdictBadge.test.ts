import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rankedVerdictBadge } from '@/lib/scanner/rankedVerdict';
import type { CanonicalResult } from '@/lib/scoring/canonical/types';

function canonical(over: Partial<CanonicalResult>): CanonicalResult {
  return {
    permission: 'WATCH', grade: 'A', score: 98, factorScore: 70, direction: 'long', setupType: 'EXHAUSTION_FADE',
    blockReasons: [], watchReasons: [], flags: [], ...over,
  } as unknown as CanonicalResult;
}

describe('Ranked verdict badge', () => {
  it('BAC case: canonical WATCH (grade A) reads WATCH with its reasons, not the legacy "Gated"', () => {
    const b = rankedVerdictBadge({
      canonical: canonical({ watchReasons: [{ code: 'NO_VALIDATED_EDGE', message: 'EXHAUSTION_FADE long: no out-of-sample edge after costs' }] }),
      // legacy flag still present on the payload; must be ignored
      ...({ scoreV2: { regimeScore: { gated: true } } } as object),
    });
    expect(b.label).toBe('WATCH');
    expect(b.tone).toBe('watch');
    expect(b.title).toContain('no out-of-sample edge');
  });

  it('PASS, hard BLOCK and No setup', () => {
    expect(rankedVerdictBadge({ canonical: canonical({ permission: 'PASS' }) }).label).toBe('PASS');
    const blocked = rankedVerdictBadge({ canonical: canonical({ permission: 'BLOCK', grade: 'F', blockReasons: [{ code: 'STALE_DATA', message: 'Last bar is 3 days old' }] }) });
    expect(blocked.label).toBe('BLOCK');
    expect(blocked.title).toContain('Last bar is 3 days old');
    const none = rankedVerdictBadge({ canonical: canonical({ permission: 'BLOCK', grade: 'F', score: 0, blockReasons: [{ code: 'NO_SETUP', message: 'No eligible setup (closest: Pullback long — not at EMA20)' }] }) });
    expect(none.label).toBe('No setup');
    expect(none.tone).toBe('neutral');
    expect(none.title).toContain('Pullback long');
  });

  it('is symmetric for long and short setups', () => {
    const w = [{ code: 'NO_VALIDATED_EDGE', message: 'no edge' }];
    const long = rankedVerdictBadge({ canonical: canonical({ direction: 'long', watchReasons: w }) });
    const short = rankedVerdictBadge({ canonical: canonical({ direction: 'short', watchReasons: w }) });
    expect(short).toEqual(long);
  });

  it('falls back to the v2.4 contract permission for rows without a canonical verdict', () => {
    expect(rankedVerdictBadge({ compositeV2: { permission: 'BLOCK', blockReasons: [{ code: 'LIQUIDITY_MIN', message: 'Thin' }] } }).label).toBe('BLOCK');
    expect(rankedVerdictBadge({}).label).toBe('—');
  });
});

describe('scanner page no longer reads the legacy gate flag', () => {
  it('has no scoreV2.regimeScore.gated reads and renders the verdict badge', () => {
    const src = readFileSync('app/tools/scanner/page.tsx', 'utf8');
    expect(src).not.toMatch(/regimeScore\?\.gated/);
    expect(src).not.toContain("'Gated by regime'");
    expect(src).toContain('rankedVerdictBadge(r)');
  });
});
