/**
 * Research packets carry no inferred context:
 * - trap detection gets no options-crowding value without real options-chain data (the cross-market confirmation proxy
 *   used to flag strong confirmation as CROWDED_OPTIONS, +8 trap risk) and no news shock without a news feed (it was
 *   BBWP > 90);
 * - news status is UNKNOWN (it was ELEVATED/CALM from BBWP > 85, which could mark a setup do-nothing MACRO_RISK);
 * - crypto market context is unavailable (it was a regime made up from fixed 0% market-cap change / 45% BTC dominance).
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

const volatileBars: Bar[] = Array.from({ length: 120 }, (_, i) => {
  const swing = i % 2 ? 4 : -4; // wide, alternating ranges: high volatility percentile
  return { symbol: 'X', market: 'EQUITIES', timeframe: '15m', timestamp: new Date(NOW - (120 - i) * 900_000).toISOString(),
    open: 100, high: 100 + Math.abs(swing) * (1 + i / 30), low: 100 - Math.abs(swing) * (1 + i / 30), close: 100 + swing * (i / 60), volume: 1000 + i };
});

it('news is UNKNOWN and no news shock reaches trap detection, even on a very volatile symbol', async () => {
  spy.calls.length = 0;
  const p = { ...provider, getBars: vi.fn(async () => volatileBars) };
  const scan = await buildAdminResearchScan({
    symbol: 'VOL', market: 'EQUITIES', timeframe: '15m',
    scanContext: { ...DEFAULT_ADMIN_SCAN_CONTEXT }, provider: memoizeProvider(p as never), quote: { changePercent: 3 },
  });
  expect(scan.packet.newsContext.status).toBe('UNKNOWN');
  for (const c of spy.calls) expect((c as { hasNewsShock?: unknown }).hasNewsShock).toBeFalsy();
  expect(scan.packet.trapDetection.trapType).not.toContain('NEWS_TRAP');
  expect(scan.packet.doNothing?.code ?? null).not.toBe('MACRO_RISK');
});

it('a crypto packet reports market context as unavailable instead of a made-up regime', async () => {
  const p = { ...provider, getBars: vi.fn(async () => bars.map((b) => ({ ...b, symbol: 'BTC', market: 'CRYPTO' }))) };
  const scan = await buildAdminResearchScan({
    symbol: 'BTC', market: 'CRYPTO', timeframe: '15m',
    scanContext: { ...DEFAULT_ADMIN_SCAN_CONTEXT }, provider: memoizeProvider(p as never), quote: { changePercent: 1 },
  });
  expect(scan.packet.cryptoContext).toMatchObject({ enabled: false });
  expect(JSON.stringify(scan.packet.cryptoContext)).not.toMatch(/btcDominance|globalRegime|Layer1/);
});
