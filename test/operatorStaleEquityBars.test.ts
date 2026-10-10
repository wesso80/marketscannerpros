import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  q: vi.fn(async () => []),
}));

import { DEFAULT_ADMIN_SCAN_CONTEXT } from '@/lib/admin/scan-context';
import { runScan, type MarketDataProvider } from '@/lib/operator/orchestrator';
import type { Bar } from '@/types/operator';

const NOW = Date.parse('2026-10-10T15:00:00Z');

function bar(symbol: string, timestamp: string): Bar {
  return {
    symbol,
    market: 'EQUITIES',
    timeframe: '1D',
    timestamp,
    open: 10,
    high: 11,
    low: 9,
    close: 10,
    volume: 1_000,
  };
}

function provider(series: Record<string, Bar[]>): MarketDataProvider {
  return {
    async getBars(symbol) {
      return series[symbol] ?? [];
    },
    async getKeyLevels() {
      return [];
    },
    async getCrossMarketState() {
      return {
        vixState: 'unknown',
        dxyState: 'unknown',
        yieldState: 'unknown',
        btcState: 'unknown',
        riskSentiment: 'neutral',
      } as never;
    },
    async getEventWindow() {
      return { isActive: false, severity: null, nextEventAt: null };
    },
  };
}

describe('operator equity scans ignore stale stored daily bars', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns no candidates for a 2018 series and logs each symbol once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await runScan(
      { symbols: ['STO', 'X'], market: 'EQUITIES', timeframe: '1D' },
      { ...DEFAULT_ADMIN_SCAN_CONTEXT, scoringWeights: {} },
      provider({
        STO: [bar('STO', '2018-06-14')],
        X: [bar('X', '2018-06-14'), bar('X', '2018-06-15')],
      }),
    );
    expect(result.pipelines).toEqual([]);
    expect(result.snapshots).toEqual([]);
    expect(result.errors).toEqual([]);
    const lines = warn.mock.calls.map((args) => String(args[0]));
    expect(lines.filter((line) => line.includes('[operator] STO:'))).toHaveLength(1);
    expect(lines.filter((line) => line.includes('[operator] X:'))).toHaveLength(1);
  });

  it('still scans an equity whose latest daily bar is the last completed session', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await runScan(
      { symbols: ['AAPL'], market: 'EQUITIES', timeframe: '1D' },
      { ...DEFAULT_ADMIN_SCAN_CONTEXT, scoringWeights: {} },
      provider({ AAPL: [bar('AAPL', '2026-10-09')] }),
    );
    const lines = warn.mock.calls.map((args) => String(args[0]));
    expect(lines.some((line) => line.includes('[operator] AAPL:'))).toBe(false);
    expect(result.snapshots.length + result.errors.length).toBeGreaterThan(0);
  });
});
