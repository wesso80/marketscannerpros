import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { edgeProfileLock, EDGE_PROFILE_UNLOCK_TRADES } from '@/lib/intelligence/edgeProfileUnlock';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Edge Profile unlock rule (TR-11)', () => {
  it('stays locked from 0 to 9 closed trades with a real counter', () => {
    expect(EDGE_PROFILE_UNLOCK_TRADES).toBe(10);
    expect(edgeProfileLock(0)).toMatchObject({ locked: true, progressLabel: '0/10 closed trades' });
    expect(edgeProfileLock(1)).toMatchObject({ locked: true, closedTrades: 1, progressLabel: '1/10 closed trades' });
    expect(edgeProfileLock(9)).toMatchObject({ locked: true, progressLabel: '9/10 closed trades' });
  });

  it('unlocks at 10 and treats missing counts as 0', () => {
    expect(edgeProfileLock(10).locked).toBe(false);
    expect(edgeProfileLock(42)).toMatchObject({ locked: false, progressLabel: '10/10 closed trades' });
    expect(edgeProfileLock(null)).toMatchObject({ locked: true, closedTrades: 0 });
    expect(edgeProfileLock(undefined).locked).toBe(true);
    expect(edgeProfileLock(Number.NaN).locked).toBe(true);
  });

  it('the card uses the lock instead of the old exactly-zero check and hard-coded 0/10', () => {
    const card = read('components/intelligence/EdgeInsightCards.tsx');
    expect(card).not.toContain('0/10 closed trades');
    expect(card).toContain('lock.locked');
    expect(card).toContain('lock.progressLabel');
    const hook = read('hooks/useEdgeProfile.ts');
    expect(hook).toContain('edgeProfileLock(data?.totalOutcomes)');
    // One threshold for the stats engine and the card.
    expect(read('lib/intelligence/edgeProfile.ts')).toContain('MIN_SAMPLE_SIZE = EDGE_PROFILE_UNLOCK_TRADES');
  });
});
