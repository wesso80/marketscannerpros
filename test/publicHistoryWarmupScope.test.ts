import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';

vi.mock('@/lib/coingecko', () => ({
  getOHLCRange: vi.fn(async (_id: string, _from: number, to: number) => [[to * 1000, 100, 101, 99, 100]]),
  getMarketChartRange: vi.fn(async () => ({ prices: [], total_volumes: [] })),
  resolveSymbolToId: vi.fn(),
  getOHLC: vi.fn(),
}));

it('keeps the 2-window default and applies the long warm-up only on the worker path', async () => {
  const cg = await import('@/lib/coingecko');
  const { fetchCryptoSeries, DEFAULT_DAILY_WINDOWS } = await import('@/lib/scanner/cryptoBars');
  const { DAILY_SCAN_CRYPTO_WINDOWS } = await import('@/lib/scanner/dailyCryptoIndicators');
  const { DAILY_HISTORY_DAYS, WORKER_DAILY_WINDOWS } = await import('@/lib/worker/cryptoDailyHistory');
  await fetchCryptoSeries('BTC', 'daily', Date.parse('2026-10-03T12:00:00Z'), { coinId: 'bitcoin' });
  expect(DEFAULT_DAILY_WINDOWS).toBe(2);
  expect(cg.getOHLCRange).toHaveBeenCalledTimes(2);
  expect(DAILY_SCAN_CRYPTO_WINDOWS).toBe(6);
  expect(WORKER_DAILY_WINDOWS).toBe(6);
  expect(DAILY_HISTORY_DAYS).toBe(WORKER_DAILY_WINDOWS * 180);
  expect(DAILY_HISTORY_DAYS).toBeGreaterThanOrEqual(600);
  const worker = readFileSync('worker/ingest-data.ts', 'utf8');
  expect(worker).toContain('dailyWindows: WORKER_DAILY_WINDOWS');
});
