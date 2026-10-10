/**
 * The Symbol report used to wait out each independent fetch. This compares that
 * order with computeGoldenEgg on the same delayed fakes.
 */
import { describe, expect, it, vi } from 'vitest';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const mark = vi.hoisted(() => ({
  priceStart: 0, priceEnd: 0, calendarStart: 0, fundamentalsStart: 0, optionsStart: 0,
  quoteActive: 0, quoteMax: 0,
}));

vi.mock('@/lib/goldenEggFetchers', () => {
  const price = async () => {
    mark.priceStart = Date.now();
    await delay(80);
    mark.priceEnd = Date.now();
    const dates = ['2026-10-07', '2026-10-08', '2026-10-09'];
    const closes = [100, 101, 102];
    return {
      price: 102, change: 1, changePct: 1, high: 103, low: 99, volume: 1e6, avgVolume: 1e6,
      historicalCloses: closes, historicalOpens: closes, historicalHighs: closes.map((c) => c + 1), historicalLows: closes.map((c) => c - 1),
      historicalDates: dates, historicalVolumes: closes.map(() => 1e6),
      priceTs: '2026-10-09', lastCompletedBarAt: '2026-10-09', barInterval: '1d',
      source: 'alpha_vantage TIME_SERIES_DAILY_ADJUSTED',
    };
  };
  return {
    fetchPrice: vi.fn(price),
    fetchTimeConfluence: vi.fn(async () => { await delay(80); return null; }),
    fetchMacroRegime: vi.fn(async () => { await delay(80); return null; }),
    fetchIndicators: vi.fn(async () => { await delay(15); return null; }),
    fetchMPE: vi.fn(async () => { await delay(15); return null; }),
    fetchOptionsSnapshot: vi.fn(async () => { mark.optionsStart = Date.now(); await delay(60); return null; }),
    fetchCryptoDerivatives: vi.fn(async () => null),
  };
});
vi.mock('@/lib/macro/calendar/feed', () => ({
  buildCalendarFeed: vi.fn(async () => { mark.calendarStart = Date.now(); await delay(80); return null; }),
}));
vi.mock('@/lib/goldenEgg/companyOverview', () => ({
  getFundamentalsSummary: vi.fn(async () => { mark.fundamentalsStart = Date.now(); await delay(80); return null; }),
}));
vi.mock('@/lib/scoring/canonical/regimeOverlayData', () => ({ loadRegimeOverlayInputs: vi.fn(async () => null) }));
vi.mock('@/lib/onDemandFetch', () => ({
  getQuote: vi.fn(async () => {
    mark.quoteActive += 1;
    mark.quoteMax = Math.max(mark.quoteMax, mark.quoteActive);
    await delay(40);
    mark.quoteActive -= 1;
    return { price: 100, changePct: 0.2, sma20: 99, latestDay: '2026-10-09' };
  }),
  getIndicators: vi.fn(async () => { await delay(40); return { sma20: 99, sma50: 98 }; }),
}));
vi.mock('@/lib/coingecko', () => ({ getGlobalData: vi.fn(async () => null) }));
vi.mock('@/lib/scanner/cryptoBars', () => ({ fetchCryptoSeries: vi.fn(async () => null) }));
vi.mock('@/lib/signalRecorder', () => ({ recordSignal: vi.fn(async () => undefined) }));
vi.mock('@/lib/brain/engineBridge', () => ({ recordEngineEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/avRateGovernor', () => ({ avFetch: vi.fn(async () => { throw new Error('network denied'); }), avTakeToken: vi.fn(async () => undefined) }));

import { computeGoldenEgg } from '@/lib/goldenEgg/engine';
import { fetchIndicators, fetchMacroRegime, fetchMPE, fetchOptionsSnapshot, fetchPrice, fetchTimeConfluence } from '@/lib/goldenEggFetchers';
import { buildCalendarFeed } from '@/lib/macro/calendar/feed';
import { getFundamentalsSummary } from '@/lib/goldenEgg/companyOverview';
import { getQuote } from '@/lib/onDemandFetch';
import { loadRegimeOverlayInputs } from '@/lib/scoring/canonical/regimeOverlayData';
import { sectionTimeoutWarning } from '@/lib/goldenEgg/sectionCutoff';

async function serialReport(): Promise<number> {
  const started = Date.now();
  await Promise.all([fetchPrice('SER', 'equity', { requireHistoricals: true }), fetchTimeConfluence('SER'), fetchMacroRegime()]);
  await fetchMPE('SER', 'equity', null);
  await buildCalendarFeed({ nowMs: Date.now(), days: 5, countries: ['US'], importance: 'high' });
  await fetchIndicators('SER', 'equity', [], [], [], 'daily');
  await Promise.all([
    fetchOptionsSnapshot('SER', 100, {}),
    getFundamentalsSummary('SER'),
  ]);
  for (const symbol of ['SPY', 'QQQ', 'TLT', 'UUP']) await getQuote(symbol);
  return Date.now() - started;
}

describe('symbol report load', () => {
  it('overlaps independent fetches and reads reference quotes together', async () => {
    mark.quoteMax = 0;
    const before = await serialReport();
    mark.quoteMax = 0;
    const started = Date.now();
    const result = await computeGoldenEgg({ symbol: 'FAST1', timeframe: 'daily', assetClass: 'equity', fresh: true });
    const after = Date.now() - started;
    expect(result.payload.dailyChart?.bars.at(-1)?.t).toBe('2026-10-09');
    expect(mark.calendarStart).toBeLessThan(mark.priceEnd);
    expect(mark.fundamentalsStart).toBeLessThan(mark.priceEnd);
    expect(mark.optionsStart).toBeGreaterThanOrEqual(mark.priceEnd);
    expect(mark.quoteMax).toBeGreaterThanOrEqual(4);
    expect(after).toBeLessThan(before);
    console.log(`[symbol-report-load] serial ${before}ms overlapped ${after}ms`);
  });

  it('returns the price packet when time confluence outlasts its cap', async () => {
    vi.mocked(fetchTimeConfluence).mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(null), 400)));
    const started = Date.now();
    const result = await computeGoldenEgg({ symbol: 'SLOW1', timeframe: 'daily', assetClass: 'equity', fresh: true, enrichmentTimeoutMs: 40 });
    const elapsed = Date.now() - started;
    expect(result.payload.meta.symbol).toBe('SLOW1');
    expect(result.payload.dailyChart?.bars.length).toBe(3);
    expect(elapsed).toBeLessThan(350);
    expect(result.warnings).toContain(sectionTimeoutWarning('Time confluence'));
    console.log(`[symbol-report-load] confluence cap elapsed ${elapsed}ms`);
  });

  it('drops MPE and the regime overlay at the same cutoff', async () => {
    vi.mocked(fetchTimeConfluence).mockResolvedValueOnce(null);
    vi.mocked(fetchMPE).mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(null), 400)));
    const mpeStarted = Date.now();
    const mpe = await computeGoldenEgg({ symbol: 'MPE30', timeframe: 'daily', assetClass: 'equity', fresh: true, enrichmentTimeoutMs: 40 });
    expect(Date.now() - mpeStarted).toBeLessThan(350);
    expect(mpe.warnings).toContain(sectionTimeoutWarning('MPE'));
    expect(mpe.warnings).not.toContain(sectionTimeoutWarning('Time confluence'));

    vi.mocked(fetchMacroRegime).mockResolvedValueOnce(null);
    vi.mocked(loadRegimeOverlayInputs).mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(null), 400)));
    const overlayStarted = Date.now();
    const overlay = await computeGoldenEgg({ symbol: 'OVL30', timeframe: 'daily', assetClass: 'equity', fresh: true, enrichmentTimeoutMs: 40 });
    expect(Date.now() - overlayStarted).toBeLessThan(350);
    expect(overlay.warnings).toContain(sectionTimeoutWarning('Regime overlay'));
    expect(overlay.warnings).not.toContain(sectionTimeoutWarning('Macro regime'));
  });

  it('caches a timed-out report for 30 seconds and a complete report for longer', async () => {
    vi.mocked(fetchTimeConfluence).mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(null), 400)));
    const partial = await computeGoldenEgg({ symbol: 'PART30', timeframe: 'daily', assetClass: 'equity', fresh: true, enrichmentTimeoutMs: 30 });
    expect(partial.cached).toBe(false);
    expect(partial.warnings).toContain(sectionTimeoutWarning('Time confluence'));
    const partialHit = await computeGoldenEgg({ symbol: 'PART30', timeframe: 'daily', assetClass: 'equity', enrichmentTimeoutMs: 30 });
    expect(partialHit.cached).toBe(true);
    expect(partialHit.warnings).toContain(sectionTimeoutWarning('Time confluence'));

    const complete = await computeGoldenEgg({ symbol: 'FULL30', timeframe: 'daily', assetClass: 'equity', fresh: true });
    expect(complete.warnings.filter((w) => w.includes('timed out'))).toEqual([]);

    const base = Date.now();
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => base + 31_000);
    try {
      const expired = await computeGoldenEgg({ symbol: 'PART30', timeframe: 'daily', assetClass: 'equity', enrichmentTimeoutMs: 30 });
      expect(expired.cached).toBe(false);
      const held = await computeGoldenEgg({ symbol: 'FULL30', timeframe: 'daily', assetClass: 'equity' });
      expect(held.cached).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
