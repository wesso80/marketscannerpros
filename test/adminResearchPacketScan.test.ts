import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ q: vi.fn(async () => []) }));

import { buildAdminResearchScan } from '@/lib/admin/getAdminResearchPacket';
import { DEFAULT_ADMIN_SCAN_CONTEXT } from '@/lib/admin/scan-context';
import { memoizeProvider } from '@/lib/operator/market-data';
import type { Bar } from '@/types/operator';

const NOW = Date.parse('2026-09-25T17:00:00Z');

function bars(n: number): Bar[] {
  return Array.from({ length: n }, (_, i) => ({
    symbol: 'AAPL', market: 'EQUITIES', timeframe: '15m',
    timestamp: new Date(NOW - (n - i) * 900_000).toISOString(),
    open: 100 + i * 0.05, high: 100.4 + i * 0.05, low: 99.6 + i * 0.05, close: 100.1 + i * 0.05, volume: 1000 + i,
  }));
}

function countingProvider(series: Bar[]) {
  return {
    getBars: vi.fn(async () => series),
    getKeyLevels: vi.fn(async () => []),
    getCrossMarketState: vi.fn(async () => ({ vixState: 'unknown', dxyState: 'neutral', breadthState: 'neutral' })),
    getEventWindow: vi.fn(async () => ({ isActive: false, severity: null, nextEventAt: null })),
  };
}

describe('buildAdminResearchScan', () => {
  it('reuses the bars the pipeline fetched (no duplicate bar fetch)', async () => {
    const base = countingProvider(bars(120));
    const scan = await buildAdminResearchScan({
      symbol: 'AAPL', market: 'EQUITIES', timeframe: '15m',
      scanContext: { ...DEFAULT_ADMIN_SCAN_CONTEXT }, provider: memoizeProvider(base as never),
      quote: { changePercent: 1.5 },
    });
    expect(base.getBars).toHaveBeenCalledTimes(1);
    expect(base.getCrossMarketState).toHaveBeenCalledTimes(1);
    expect(scan.noBars).toBe(false);
    expect(scan.bars).toHaveLength(120);
    expect(scan.packet.dataTruth.status).not.toBe('ERROR');
  });

  it('no bars → marked as a source error with no age, never "fresh"', async () => {
    const base = countingProvider([]);
    const scan = await buildAdminResearchScan({
      symbol: 'AAPL', market: 'EQUITIES', timeframe: '15m',
      scanContext: { ...DEFAULT_ADMIN_SCAN_CONTEXT }, provider: memoizeProvider(base as never),
    });
    expect(scan.noBars).toBe(true);
    expect(scan.packet.dataTruth.status).toBe('ERROR');
    expect(scan.packet.dataTruth.notes.join(' ')).toContain('NO_BAR_DATA');
    expect(scan.packet.alertEligibility.eligible).toBe(false);
  });
});
