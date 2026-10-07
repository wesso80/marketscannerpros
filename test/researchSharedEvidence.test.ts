import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { independence } from '@/lib/research/evidenceInputs';
import { bbwpBasisNote, priceEvidenceFromSeries } from '@/lib/research/priceEvidence';

describe('evidence independence', () => {
  it('counts readings of one input as one source of evidence', () => {
    const r = independence([
      { text: 'Structure 70', input: 'price-history' },
      { text: 'Momentum 68', input: 'price-history' },
      { text: 'Above EMA200', input: 'price-history' },
      { text: 'Cross-market supportive', input: 'cross-market' },
    ], 'supporting points');
    expect(r.points).toBe(4);
    expect(r.independentInputs).toBe(2);
    expect(r.note).toContain('4 supporting points from 2 independent inputs (price history 3, other markets 1)');
    expect(r.note).toContain('not separate confirmations');
  });
  it('does not count data-quality or risk checks as market inputs', () => {
    const r = independence([{ text: 'Data trust degraded', input: 'data-quality' }, { text: 'Risk: wide ATR', input: 'risk-flags' }, { text: 'Flow 40', input: 'options' }]);
    expect(r.independentInputs).toBe(1);
    expect(r.note).not.toContain('not separate confirmations');
  });
  it('says so when there are no points', () => {
    expect(independence([], 'points against').note).toBe('No points against.');
  });
});

describe('shared price evidence for other views', () => {
  const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10));
  it('builds the same evidence from fetched series and needs dates', () => {
    const d = days(300), closes = d.map((_, i) => 100 + Math.sin(i / 7) * 5 + i * 0.05);
    const nowMs = Date.parse(d[d.length - 1] + 'T12:00:00Z');
    const e = priceEvidenceFromSeries('BTC', 'crypto', { price: 120, historicalCloses: closes, historicalHighs: closes.map((c) => c + 1), historicalLows: closes.map((c) => c - 1), historicalDates: d }, nowMs);
    expect(e).not.toBeNull();
    expect(e!.basis.excludedPartialBar).toBe(d[d.length - 1]);
    expect(e!.basis.lastCompletedBar).toBe(d[d.length - 2]);
    expect(priceEvidenceFromSeries('BTC', 'crypto', { price: 120, historicalCloses: closes }, nowMs)).toBeNull();
  });
  it('explains a BBWP that differs from the completed-bar value, and stays silent when they agree', () => {
    const e = { bbwp: 42, basis: { lastCompletedBar: '2026-10-06', barsUsed: 300, excludedPartialBar: '2026-10-07', source: null } };
    expect(bbwpBasisNote(42.6, e)).toBeNull();
    const note = bbwpBasisNote(55, e)!;
    expect(note).toContain('BBWP is 55');
    expect(note).toContain('completed 2026-10-06 bar is 42');
    expect(note).toContain('unfinished 2026-10-07 bar');
    expect(bbwpBasisNote(55, { ...e, bbwp: null })).toBeNull();
  });
});

describe('views read the shared snapshot', () => {
  it('Deep analysis returns the shared evidence and tags each point with its input', () => {
    const route = readFileSync('app/api/deep-analysis/route.ts', 'utf8');
    expect(route).toContain('priceEvidence: ge.priceEvidence ?? null');
    expect(route).toContain('timingEvidence: ge.timingEvidence ?? null');
    expect(route).toContain('INDEPENDENCE OF EVIDENCE');
    expect(route).toMatch(/supportInputs: supports\.map/);
    const page = readFileSync('app/tools/deep-analysis/page.tsx', 'utf8');
    expect(page).toContain('data-evidence-input');
    expect(page).toContain('<PriceEvidencePanel e={result.goldenEgg.priceEvidence}');
  });
  it('Volatility returns and shows the shared evidence', () => {
    expect(readFileSync('app/api/dve/route.ts', 'utf8')).toContain('priceEvidenceFromSeries(symbol, assetClass, priceData, computedAtMs)');
    expect(readFileSync('src/features/volatilityEngine/VolatilityEnginePage.tsx', 'utf8')).toContain('bbwpBasisNote(measuredBbwp(reading.volatility), priceEvidence)');
  });
});
