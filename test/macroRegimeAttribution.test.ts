import { expect, it } from 'vitest';
import { buildPayload } from '@/lib/goldenEgg/engine';
import type { MacroRegime } from '@/lib/goldenEggFetchers';
import { ind, now, price } from './fixtures/goldenEggTiming';

const regime: MacroRegime = {
  riskState: 'risk_off',
  riskLevel: 'high',
  concerns: ['Inverted yield curve', 'Elevated inflation', 'High interest rates'],
  source: 'Source: FRED (Federal Reserve Bank of St. Louis)',
  asOf: '2026-09-23',
  observations: [
    { series: 'DGS10', label: '10-year Treasury', date: '2026-09-23', unavailable: false },
    { series: 'DGS2', label: '2-year Treasury', date: '2026-09-23', unavailable: false },
    { series: 'CPIAUCSL', label: 'CPI year-over-year', date: '2026-09-01', unavailable: false },
  ],
};

it('shows the FRED source and observation dates on macro blocker, flip, and evidence text', () => {
  const payload = buildPayload('BTC', 'crypto', price, ind, null, null, '1D', null, null, regime, { nowMs: now });
  const flip = payload.layer1.flipConditions.find((row) => row.id === 'f5')?.text ?? '';
  const evidence = payload.layer3.narrative?.risks.find((row) => row.includes('Macro regime')) ?? '';
  for (const text of [flip, evidence, payload.layer1.primaryBlocker ?? '']) {
    expect(text).toContain('Inverted yield curve');
    expect(text).toContain('Source: FRED (Federal Reserve Bank of St. Louis)');
    expect(text).toContain('As of 2026-09-23');
    expect(text).toContain('10-year Treasury 2026-09-23');
    expect(text).toContain('2-year Treasury 2026-09-23');
    expect(text).toContain('CPI year-over-year 2026-09-01');
  }
});
