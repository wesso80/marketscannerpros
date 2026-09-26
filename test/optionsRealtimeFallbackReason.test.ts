/**
 * Options pages showed the previous session during US hours with no reason in the server logs. Now:
 *  - every skipped provider is logged with the exact reason (Alpha Vantage's own message where there is one);
 *  - only AV's artificial "premium endpoint" sample switches realtime options off, and only for 10 minutes;
 *    a chain for a different symbol no longer switches realtime off for every symbol;
 *  - the analyzer's own fetcher throws on AV "Information"/"Note" instead of returning an unexplained empty.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { historicalOptionsIbm, realtimeNotEntitledSample, realtimeOptionsIbm } from './fixtures/alphaVantageOptions';

const m = vi.hoisted(() => ({ av: {} as Record<string, unknown>, calls: [] as string[] }));
vi.mock('@/lib/redis', () => ({ getCached: vi.fn(async () => null), setCached: vi.fn(async () => undefined) }));

import { clearSharedOptionsChainCache, fetchSharedOptionsChain, NOT_ENTITLED_SKIP_MS } from '../lib/options/chainCache';

const fetchPayload = async (fn: string) => {
  m.calls.push(fn);
  const v = m.av[fn];
  if (v instanceof Error) throw v;
  return v ?? null;
};
const load = (symbol = 'IBM', issues?: string[]) => fetchSharedOptionsChain(symbol, { apiKey: 'k', fetchPayload, issues });
const forSymbol = (payload: any, symbol: string) => ({ ...payload, data: payload.data.map((r: any) => ({ ...r, symbol })) });

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  m.av = {}; m.calls = [];
  clearSharedOptionsChainCache();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-25T17:20:00Z')); // Fri 13:20 ET, US session
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); warn.mockRestore(); });

const logged = () => warn.mock.calls.map((c) => c.join(' ')).join('\n');

describe('fallback to the previous-session chain always says why', () => {
  it('logs Alpha Vantage\'s own "Information" text when REALTIME_OPTIONS is refused', async () => {
    m.av = {
      REALTIME_OPTIONS: new Error('AV info error: We have detected your API key as XYZ and our standard API rate limit is 600 requests per minute.'),
      HISTORICAL_OPTIONS: historicalOptionsIbm(),
    };
    const issues: string[] = [];
    const chain = await load('IBM', issues);
    expect(chain?.provider).toBe('HISTORICAL_OPTIONS');
    expect(issues[0]).toContain('REALTIME_OPTIONS: AV info error: We have detected your API key');
    expect(logged()).toContain('[optionsChain] IBM: REALTIME_OPTIONS: AV info error');
    expect(logged()).toContain('[optionsChain] IBM: using HISTORICAL_OPTIONS (previous session 2026-09-24) because: REALTIME_OPTIONS');
  });

  it('logs a timeout as a timeout', async () => {
    m.av = { REALTIME_OPTIONS: new Error('AV request timed out for REALTIME_OPTIONS IBM'), HISTORICAL_OPTIONS: historicalOptionsIbm() };
    await load();
    expect(logged()).toContain('REALTIME_OPTIONS: AV request timed out');
  });

  it('logs AV\'s sample-chain message verbatim', async () => {
    m.av = { REALTIME_OPTIONS: realtimeNotEntitledSample(), HISTORICAL_OPTIONS: historicalOptionsIbm() };
    await load();
    expect(logged()).toMatch(/REALTIME_OPTIONS: artificial sample chain \(API key not entitled to this endpoint\)\. Alpha Vantage says: "This is a premium endpoint/);
  });

  it('logs low two-sided coverage with the percentage', async () => {
    const thin = { ...realtimeOptionsIbm(), data: realtimeOptionsIbm().data.map((r: any) => ({ ...r, bid: '0.00', ask: '0.00' })) };
    m.av = { REALTIME_OPTIONS: thin, HISTORICAL_OPTIONS: historicalOptionsIbm() };
    await load();
    expect(logged()).toContain('REALTIME_OPTIONS: only 0% of contracts have a two-sided bid/ask');
  });

  it('a live realtime chain logs nothing', async () => {
    m.av = { REALTIME_OPTIONS: realtimeOptionsIbm() };
    expect((await load())?.provider).toBe('REALTIME_OPTIONS');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('realtime options are only switched off for a real "not entitled" answer', () => {
  it('a chain for a different symbol does NOT switch realtime off for other symbols', async () => {
    m.av = { REALTIME_OPTIONS: forSymbol(realtimeOptionsIbm(), 'IBMX'), HISTORICAL_OPTIONS: historicalOptionsIbm() };
    const issues: string[] = [];
    expect((await load('IBM', issues))?.provider).toBe('HISTORICAL_OPTIONS');
    expect(issues[0]).toBe('REALTIME_OPTIONS: contracts are for IBMX, not IBM');

    m.calls = [];
    m.av = { REALTIME_OPTIONS: forSymbol(realtimeOptionsIbm(), 'MSFT') };
    expect((await load('MSFT'))?.provider).toBe('REALTIME_OPTIONS');
    expect(m.calls).toEqual(['REALTIME_OPTIONS']);
  });

  it('after the sample answer, realtime is tried again after 10 minutes (was 1 hour)', async () => {
    expect(NOT_ENTITLED_SKIP_MS).toBe(10 * 60 * 1000);
    m.av = { REALTIME_OPTIONS: realtimeNotEntitledSample(), HISTORICAL_OPTIONS: historicalOptionsIbm() };
    await load();
    const msft = forSymbol(realtimeOptionsIbm(), 'MSFT');
    m.av = { REALTIME_OPTIONS: msft, HISTORICAL_OPTIONS: forSymbol(historicalOptionsIbm(), 'MSFT') };

    m.calls = [];
    vi.setSystemTime(new Date(Date.now() + 5 * 60 * 1000));
    expect((await load('MSFT'))?.provider).toBe('HISTORICAL_OPTIONS');
    expect(m.calls).toEqual(['HISTORICAL_OPTIONS']);
    expect(logged()).toMatch(/REALTIME_OPTIONS: skipped until 2026-09-25T17:30:00\.000Z/);

    m.calls = [];
    vi.setSystemTime(new Date('2026-09-25T17:31:00Z'));
    const aapl = forSymbol(realtimeOptionsIbm(), 'AAPL');
    m.av = { REALTIME_OPTIONS: aapl };
    expect((await load('AAPL'))?.provider).toBe('REALTIME_OPTIONS');
    expect(m.calls).toEqual(['REALTIME_OPTIONS']);
  });
});

describe('Options Confluence analyzer fetcher', () => {
  it('throws on AV Information / Note instead of returning an unexplained empty chain', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('lib/options-confluence-analyzer.ts', 'utf8');
    expect(src).toContain("if (payload?.['Information']) throw new Error(`AV info error: ${payload['Information']}`);");
    expect(src).toContain("if (payload?.['Note']) throw new Error(`AV quota exceeded: ${payload['Note']}`);");
    expect(src).toContain('AbortSignal.timeout(20_000)');
  });
});
