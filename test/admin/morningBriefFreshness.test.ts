/** A saved Morning Brief older than 6 h is stale on the API truth stamp and gets a visible warning on the page. */
import { expect, it } from 'vitest';
import { BRIEF_STALE_SEC, morningBriefFreshness, staleBriefWarning } from '@/lib/admin/morningBriefFreshness';

it('grades age the same way the API truth stamp always has', () => {
  expect(morningBriefFreshness(0)).toBe('real-time');
  expect(morningBriefFreshness(900)).toBe('real-time');
  expect(morningBriefFreshness(901)).toBe('delayed');
  expect(morningBriefFreshness(BRIEF_STALE_SEC)).toBe('delayed');
  expect(morningBriefFreshness(BRIEF_STALE_SEC + 1)).toBe('stale');
  expect(morningBriefFreshness(Number.NaN)).toBe('stale');
});

it('warns on a stale saved brief, says it will not refresh while paused, and stays quiet when fresh', () => {
  const old = { ageSec: 3 * 86_400, ageLabel: '3 days ago', generatedAt: '2026-10-06T20:15:00Z' };
  const paused = staleBriefWarning(old, true)!;
  expect(paused).toMatch(/^Stale: this brief was built 3 days ago \(Tue, 06 Oct 2026 20:15:00 GMT\)/);
  expect(paused).toMatch(/describe that time, not now/);
  expect(paused).toMatch(/will not refresh until discovery-only is lifted/);
  expect(staleBriefWarning(old, false)).toMatch(/Rebuild before acting on it/);
  expect(staleBriefWarning({ ...old, ageSec: 600 }, true)).toBeNull();
  expect(staleBriefWarning(null, true)).toBeNull();
});
