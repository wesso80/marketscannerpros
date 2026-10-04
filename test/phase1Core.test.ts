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

import { readFileSync, readdirSync } from 'node:fs';
import { COPY } from '@/components/visual/copy';
it('has reviewed factual copy and allowlisted model output for every report status', () => {
  const banned = /\b(?:buy|sell|entry signal|about to|likely|expected to|probability|bullish|bearish|will|should)\b/i;
  expect(JSON.stringify(COPY)).not.toMatch(banned);
  for (const status of ['COMPLETE', 'DEGRADED', 'FAILED']) {
    const model = radarCardModel({ ...report, status, healthStatus: 'buy now', headline: 'should buy', ops: { secret: 'sell' } }, now);
    expect(JSON.stringify(model)).not.toMatch(banned);
  }
});
it('uses CSS variable tones and no chart packages or network in shared visuals', () => {
  for (const folder of ['components/visual', 'components/overview']) {
    for (const file of readdirSync(folder).filter(f => /\.tsx?$/.test(f))) {
      const source = readFileSync(`${folder}/${file}`, 'utf8');
      expect(source, file).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(source, file).not.toMatch(/from ['"](?:chart|lightweight-charts)/);
      if (folder === 'components/visual') expect(source, file).not.toMatch(/\bfetch\s*\(/);
    }
  }
});
it('handles zero and nonfinite sectors without painting missing data as positive', () => {
  expect(sectorTone(NaN)).toEqual(sectorTone(null));
  expect(sectorCells([{ symbol: 'XLU', name: 'Utilities', changePercent: NaN }])[0].valueLabel).toBe('n/a');
  expect(sectorCells([{ symbol: 'XLU', name: 'Utilities', changePercent: 0 }])[0].valueLabel).toBe('0.00%');
});
