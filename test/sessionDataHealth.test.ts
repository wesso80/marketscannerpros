import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assessEvidenceQuality } from '../lib/analysis/evidenceQuality';
import { applyFeedHealth, assessSessionFreshness, degradedFeedList, layerFreshness } from '../lib/analysis/sessionDataHealth';
import { calendarDataWarning } from '../lib/calendarPresentation';

const NOW = Date.parse('2026-09-25T17:20:00Z'); // 03:20 AEST, during the audit
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe('OV-3: one freshness rule', () => {
  it('calls a layer live only with a provider as-of time inside its cadence', () => {
    expect(layerFreshness({ name: 'x', available: true, asOf: minutesAgo(3), cadenceMinutes: 15 }, NOW)).toBe('live');
    expect(layerFreshness({ name: 'x', available: true, asOf: minutesAgo(40), cadenceMinutes: 15 }, NOW)).toBe('stale');
    expect(layerFreshness({ name: 'x', available: true, asOf: null }, NOW)).toBe('unknown');
    expect(layerFreshness({ name: 'x', available: true, asOf: minutesAgo(1), stale: true }, NOW)).toBe('stale');
    expect(layerFreshness({ name: 'x', available: false, asOf: minutesAgo(1) }, NOW)).toBe('missing');
  });

  it('takes the worst available layer and names the ones holding it back', () => {
    const f = assessSessionFreshness([
      { name: 'regime', available: true, asOf: minutesAgo(5), stale: false },
      { name: 'sectors', available: true, asOf: null },
      { name: 'crypto', available: true, asOf: null },
      { name: 'movers', available: true, asOf: null },
      { name: 'unused', available: false },
    ], NOW);
    expect(f.freshness).toBe('unknown');
    expect(f.notes.join(' ')).toContain('sectors, crypto, movers');
    expect(assessSessionFreshness([{ name: 'a', available: true, asOf: minutesAgo(5), cadenceMinutes: 15 }, { name: 'b', available: true, asOf: minutesAgo(90), cadenceMinutes: 15 }], NOW).freshness).toBe('stale');
    expect(assessSessionFreshness([{ name: 'a', available: true, asOf: minutesAgo(5), cadenceMinutes: 15 }], NOW)).toEqual({ freshness: 'live', notes: [] });
  });
});

describe('OV-3: audit scenario (4 of 5 layers, 3 degraded feeds on the dashboard)', () => {
  const events = Array.from({ length: 28 }, () => ({ timingConfirmed: false, dataStatus: 'UNCONFIRMED' }));
  const calendarWarning = calendarDataWarning(events);

  it('no longer says HIGH / "market data is current"', () => {
    // What the page did before: freshness 'live' because 4 of 5 layers existed.
    const before = assessEvidenceQuality({ availableFactors: 4, totalFactors: 5, freshness: 'live' });
    expect(before.level).toBe('HIGH');
    expect(before.reasons).toContain('Market data is current within expected provider cadence.');

    const freshness = assessSessionFreshness([
      { name: 'regime', available: true, asOf: '2026-09-25', stale: false },
      { name: 'sectors', available: true, asOf: null },
      { name: 'crypto', available: true, asOf: null },
      { name: 'movers', available: true, asOf: null },
    ], NOW);
    const degraded = degradedFeedList({ feeds: [{ label: 'Movers', error: null }, { label: 'Calendar', error: null }], calendarWarning });
    const base = assessEvidenceQuality({ availableFactors: 4, totalFactors: 5, freshness: freshness.freshness });
    const after = applyFeedHealth({ ...base, reasons: [...base.reasons, ...freshness.notes] }, degraded);
    expect(after.level).toBe('MEDIUM');
    expect(after.reasons.join(' ')).not.toContain('current within expected provider cadence');
    expect(after.reasons).toContain('Market data recency is unknown.');
    expect(after.reasons.join(' ')).toContain('Degraded feeds: Calendar: 28/28 events have unconfirmed timing');
  });

  it('caps HIGH at MEDIUM whenever a feed is degraded, and leaves clean evidence alone', () => {
    const high = assessEvidenceQuality({ availableFactors: 5, totalFactors: 5, freshness: 'live' });
    expect(applyFeedHealth(high, ['Movers']).level).toBe('MEDIUM');
    expect(applyFeedHealth(high, [])).toBe(high);
    const low = assessEvidenceQuality({ availableFactors: 1, totalFactors: 5, freshness: 'live' });
    expect(applyFeedHealth(low, ['Movers']).level).toBe('INSUFFICIENT');
  });

  it('builds the dashboard list with the same wording and order as before', () => {
    const list = degradedFeedList({
      scanner: { warnings: ['Equity scan data incomplete (4 weak rows)', 'Crypto scan data incomplete'], error: null, stale: true, ageMinutes: 42 },
      feeds: [{ label: 'Movers', error: 'x' }, { label: 'News', error: null }, { label: 'Calendar', error: null }],
      calendarWarning,
    });
    expect(list).toEqual([
      'Equity scan data incomplete (4 weak rows)',
      'Crypto scan data incomplete',
      'Scanner data stale (42m old)',
      'Movers',
      'Calendar: 28/28 events have unconfirmed timing', // OV-6: missing consensus is no longer lumped in
    ]);
    expect(degradedFeedList({ scanner: { warnings: [], error: 'boom', stale: true, ageMinutes: null }, feeds: [] })).toEqual(['Scanner queue', 'Scanner data stale (age unknown)']);
  });

  it('both pages use the shared rule (no layer-count "live")', () => {
    const read = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');
    const cc = read('app/tools/command-center/page.tsx');
    expect(cc).not.toMatch(/availableFactors >= 4 \? 'live'/);
    expect(cc).toMatch(/freshness: sessionFreshness\.freshness/);
    expect(cc).toMatch(/applyFeedHealth\(/);
    expect(cc).toMatch(/degradedFeedList\(/);
    expect(read('app/tools/dashboard/page.tsx')).toMatch(/const degradedFeeds = degradedFeedList\(/);
  });
});
