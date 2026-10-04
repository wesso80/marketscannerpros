import { describe, expect, it } from 'vitest';
import { radarCardModel } from '@/lib/overview/radarCard';
const now = new Date('2026-10-04T12:00:00Z');
const report = { sessionDate: '2026-10-02', status: 'COMPLETE', healthStatus: 'NORMAL', generatedAt: '2026-10-02T21:05:00Z', report: { candidates: Array(12).fill({ symbol: 'PRIVATE' }) }, headline: 'PRIVATE headline', ops: { runId: 'secret-id' } };
describe('Radar card model', () => {
  it('projects only date, status, health, count and time', () => {
    expect(radarCardModel(report, now)).toMatchObject({ sessionDate: '2026-10-02', status: 'COMPLETE', count: 12, older: false, health: null });
    expect(JSON.stringify(radarCardModel(report, now))).not.toMatch(/PRIVATE|secret-id|headline|ops/);
  });
  it('hides the count on failure and handles older reports', () => {
    expect(radarCardModel({ ...report, status: 'FAILED', sessionDate: '2026-10-01' }, now)).toMatchObject({ count: null, older: true });
  });
  it('rejects missing or invalid reports instead of inventing zero', () => {
    expect(radarCardModel(null, now)).toBeNull();
    expect(radarCardModel({ ...report, sessionDate: '2026-02-31' }, now)).toBeNull();
  });
});

import { sectorCells, sectorTone, dataStatusSummary } from '@/lib/overview/today';
it('sorts known sector moves first and preserves a missing change', () => {
  const cells = sectorCells([{ symbol: 'XLK', name: 'Tech', changePercent: null }, { symbol: 'XLU', name: 'Utilities', changePercent: -1 }, { symbol: 'XLF', name: 'Financials', changePercent: 2 }]);
  expect(cells.map(c => c.symbol)).toEqual(['XLF', 'XLU', 'XLK']);
  expect(cells[2].valueLabel).toBe('n/a');
  expect(sectorTone(null)).not.toEqual(sectorTone(2));
  expect(sectorTone(0.1)).not.toEqual(sectorTone(2));
});
it('counts statuses independently and does not equate unknown health with missing time', () => {
  expect(dataStatusSummary([{ label: 'Known time', statusLabel: 'Unknown', notes: ['12:00 UTC Fri 2 Oct'] }, { label: 'Untimed', statusLabel: 'Stale', notes: ['time unknown'] }, { label: 'Failure', statusLabel: 'Degraded' }])).toEqual({ degraded: 1, stale: 1, notTimed: 2 });
});
