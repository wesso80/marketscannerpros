/**
 * Trap detection gets no options-crowding value while there is no real options-chain data: the cross-market
 * confirmation proxy used to be passed in, so strong confirmation was flagged as CROWDED_OPTIONS (+8 trap risk).
 */
import { expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ q: vi.fn(async () => []) }));
const spy = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('@/lib/engines/trapDetection', async (orig) => {
  const real = await orig<typeof import('@/lib/engines/trapDetection')>();
  return { ...real, detectTrapRisk: (input: Parameters<typeof real.detectTrapRisk>[0]) => { spy.calls.push(input); return real.detectTrapRisk(input); } };
});

import { buildAdminResearchScan } from '@/lib/admin/getAdminResearchPacket';
import { DEFAULT_ADMIN_SCAN_CONTEXT } from '@/lib/admin/scan-context';
import { memoizeProvider } from '@/lib/operator/market-data';
import { detectTrapRisk } from '@/lib/engines/trapDetection';
import type { Bar } from '@/types/operator';

const NOW = Date.parse('2026-09-25T17:00:00Z');
const bars: Bar[] = Array.from({ length: 120 }, (_, i) => ({
  symbol: 'AAPL', market: 'EQUITIES', timeframe: '15m', timestamp: new Date(NOW - (120 - i) * 900_000).toISOString(),
  open: 100 + i * 0.05, high: 100.4 + i * 0.05, low: 99.6 + i * 0.05, close: 100.1 + i * 0.05, volume: 1000 + i,
}));
const provider = {
  getBars: vi.fn(async () => bars), getKeyLevels: vi.fn(async () => []),
  getCrossMarketState: vi.fn(async () => ({ vixState: 'unknown', dxyState: 'neutral', breadthState: 'neutral' })),
  getEventWindow: vi.fn(async () => ({ isActive: false, severity: null, nextEventAt: null })),
};

it('the research packet passes no options crowding to trap detection and never flags CROWDED_OPTIONS', async () => {
  const scan = await buildAdminResearchScan({
    symbol: 'AAPL', market: 'EQUITIES', timeframe: '15m',
    scanContext: { ...DEFAULT_ADMIN_SCAN_CONTEXT }, provider: memoizeProvider(provider as never), quote: { changePercent: 1.5 },
  });
  expect(spy.calls.length).toBeGreaterThan(0);
  for (const c of spy.calls) expect((c as { optionsCrowdingScore?: unknown }).optionsCrowdingScore).toBeNull();
  expect(scan.packet.trapDetection.trapType).not.toContain('CROWDED_OPTIONS');
});

it('a real crowding reading still flags it; unknown does not', () => {
  const base = spy.calls[0] as Parameters<typeof detectTrapRisk>[0];
  expect(detectTrapRisk({ ...base, optionsCrowdingScore: 85 }).trapType).toContain('CROWDED_OPTIONS');
  expect(detectTrapRisk({ ...base, optionsCrowdingScore: null }).trapType).not.toContain('CROWDED_OPTIONS');
});
