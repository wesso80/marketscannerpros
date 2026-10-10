/**
 * Options readings count only with real options-chain data. computeOptionsIntelligence is a synthetic placeholder today,
 * so its scores never rank the Priority Desk "options pressure" list, raise an OPTIONS_PRESSURE_CHANGED event, or count
 * as evidence (Evidence Quality / Opportunity rank).
 */
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { computeOptionsIntelligence, hasRealOptionsData } from '@/lib/engines/optionsIntelligence';

it('the current options engine output is never real options data, however high its scores', async () => {
  const oi = await computeOptionsIntelligence({
    symbol: 'AAPL', assetClass: 'equity', currentPrice: 200, indicators: { bbwpPercentile: 99, rvol: 3 },
    crossMarketConfidenceProxy: 0.95, dataTruth: { status: 'LIVE', trustScore: 95, ageSec: 5, thresholds: { liveSec: 300, staleSec: 900 }, notes: [] } as never,
  });
  expect(oi.optionsPressureScore).toBeGreaterThan(70);
  expect(hasRealOptionsData(oi)).toBe(false);
  expect(hasRealOptionsData(null)).toBe(false);
});

it('a reading with live chain data and nothing missing is real', () => {
  expect(hasRealOptionsData({ dataTruth: { status: 'LIVE', trustScore: 90 } as never, missingInputs: [] })).toBe(true);
  expect(hasRealOptionsData({ dataTruth: { status: 'LIVE', trustScore: 90 } as never, missingInputs: [], fallbackScore: 50 })).toBe(false);
});

it('the Priority Desk list and the scheduler event are both gated on real options data', () => {
  const desk = readFileSync('app/api/admin/priority-desk/route.ts', 'utf8');
  expect(desk).toMatch(/bestOptionsPressure = topBy\(all, \(p\) => hasRealOptionsData\(p\.optionsIntelligence\) &&/);
  expect(desk).toContain('options pressure is not inferred');
  const scheduler = readFileSync('lib/admin/researchScheduler.ts', 'utf8');
  expect(scheduler).toMatch(/hasRealOptionsData\(packet\.optionsIntelligence\) &&\s*\(priorSnapshot\.packetJson\.optionsIntelligence\?\.optionsPressureScore/);
});
