import { expect, it } from 'vitest';
import { buildPayload } from '../lib/goldenEgg/engine';
import { now, price, ind, tc } from './fixtures/goldenEggTiming';
import type { TimeConfluenceData } from '../lib/goldenEggFetchers';
it('strong opposing timing is a nice-to-know warning, never a verdict gate', () => {
  const build = (timing: TimeConfluenceData | null) => buildPayload('BTC', 'crypto', price, ind, null, null, '1D', null, timing, null, { nowMs: now });
  const base = build(null), conflict = build(tc);
  expect(base.layer1.assessment).toBe('ALIGNED');
  expect(conflict.layer1.assessment).toBe(base.layer1.assessment);
  expect(conflict.layer1.primaryBlocker).toBe(base.layer1.primaryBlocker);
  expect(conflict.canonical?.timing.eligibleForHardGate).toBe(false);
  expect(conflict.canonical?.timing.warning).toMatch(/no tested edge/);
  expect(conflict.layer1.flipConditions.find(f => f.id === 'f6')?.severity).toBe('nice');
});
