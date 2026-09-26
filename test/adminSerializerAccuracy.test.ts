import { describe, expect, it } from 'vitest';
import { dayChangePercentFromBars, pipelineToSymbolIntelligence } from '@/lib/admin/serializer';
import type { Bar } from '@/types/operator';

const bar = (timestamp: string, close: number, market: 'EQUITIES' | 'CRYPTO' = 'EQUITIES'): Bar => ({
  symbol: 'X', market, timeframe: '15m', timestamp, open: close, high: close, low: close, close, volume: 100,
});

describe('dayChangePercentFromBars (day change, not one bar)', () => {
  it('equity intraday: vs the previous session regular close, ignoring after-hours bars', () => {
    const bars = [
      bar('2026-09-24T19:45:00.000Z', 100), // 15:45 ET — last regular bar of 09-24
      bar('2026-09-24T20:30:00.000Z', 90), //  16:30 ET — after hours, not the close
      bar('2026-09-25T13:30:00.000Z', 101), // 09:30 ET
      bar('2026-09-25T17:00:00.000Z', 104), // 13:00 ET
    ];
    expect(dayChangePercentFromBars(bars, 'EQUITIES')).toBeCloseTo(4, 6);
  });

  it('crypto intraday: vs the close 24 hours earlier', () => {
    const bars = [
      bar('2026-09-24T16:00:00.000Z', 50_000, 'CRYPTO'),
      bar('2026-09-24T17:00:00.000Z', 40_000, 'CRYPTO'),
      bar('2026-09-25T16:45:00.000Z', 51_000, 'CRYPTO'),
      bar('2026-09-25T17:00:00.000Z', 52_000, 'CRYPTO'),
    ];
    expect(dayChangePercentFromBars(bars, 'CRYPTO')).toBeCloseTo(30, 6);
  });

  it('daily bars: vs the previous daily close; too little history → null', () => {
    expect(dayChangePercentFromBars([bar('2026-09-24', 100), bar('2026-09-25', 102)], 'EQUITIES')).toBeCloseTo(2, 6);
    expect(dayChangePercentFromBars([bar('2026-09-25T13:30:00.000Z', 100), bar('2026-09-25T13:45:00.000Z', 101)], 'EQUITIES')).toBeNull();
    expect(dayChangePercentFromBars([bar('2026-09-25T13:30:00.000Z', 100)], 'EQUITIES')).toBeNull();
  });
});

function pipeline() {
  return {
    candidate: { symbol: 'AAPL', direction: 'LONG', playbook: 'TREND', entryZone: { min: 100, max: 101 }, invalidationPrice: 95, targets: [110] },
    verdict: {
      symbol: 'AAPL', market: 'EQUITIES', timeframe: '15m', timestamp: '2026-09-25T17:00:00.000Z', playbook: 'TREND',
      regime: 'TREND_EXPANSION', direction: 'LONG', confidenceScore: 0.7, qualityScore: 0.7, permission: 'ALLOW',
      sizeMultiplier: 1, reasonCodes: [], penalties: [], evidence: { symbolTrust: 0.6, crossMarketConfirmation: 0.5 },
    },
    governance: { finalPermission: 'ALLOW', blockReasons: [], sizeMultiplier: 1 },
    doctrine: {},
    executionPlan: null,
    keyLevels: [],
  } as never;
}

describe('pipelineToSymbolIntelligence', () => {
  const bars = Array.from({ length: 120 }, (_, i) =>
    bar(new Date(Date.parse('2026-09-24T13:30:00Z') + i * 900_000).toISOString(), 100 + i * 0.05));

  it('EMA200 is null (not 0) with fewer than 200 bars; EMA20/50 stay real', () => {
    const intel = pipelineToSymbolIntelligence(pipeline(), bars, [], undefined, { market: 'EQUITIES' });
    expect(intel.indicators.ema200).toBeNull();
    expect(intel.indicators.ema20).toBeGreaterThan(0);
  });

  it('EMA200 is a real number with 200+ bars', () => {
    const long = Array.from({ length: 220 }, (_, i) => bar(new Date(Date.parse('2026-09-20T13:30:00Z') + i * 900_000).toISOString(), 100 + i * 0.01));
    const intel = pipelineToSymbolIntelligence(pipeline(), long, [], undefined, { market: 'EQUITIES' });
    expect(intel.indicators.ema200).toBeGreaterThan(100);
  });

  it('uses the quoted day change when given, else the bar-derived day change', () => {
    expect(pipelineToSymbolIntelligence(pipeline(), bars, [], undefined, { market: 'EQUITIES', dayChangePercent: 1.234 }).changePercent).toBe(1.23);
    const fromBars = pipelineToSymbolIntelligence(pipeline(), bars, [], undefined, { market: 'EQUITIES' }).changePercent;
    const oneBar = ((bars[119].close - bars[118].close) / bars[118].close) * 100;
    expect(fromBars).not.toBeCloseTo(oneBar, 3);
    expect(fromBars).toBeCloseTo(Math.round((dayChangePercentFromBars(bars, 'EQUITIES') ?? 0) * 100) / 100, 6);
  });
});
