/**
 * Golden Egg / Volatility Engine options snapshot: a realtime options function the key is not entitled to
 * (Alpha Vantage "Information" note, which avFetch throws on, or the artificial sample chain) used to abort the
 * whole snapshot, so HISTORICAL_OPTIONS — included in every premium plan — was never tried.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  process.env.ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'test-key';
  return { av: {} as Record<string, unknown>, calls: [] as string[] };
});
vi.mock('@/lib/avRateGovernor', () => ({
  avTakeToken: vi.fn(async () => undefined),
  avFetch: vi.fn(async (url: string) => {
    const fn = new URL(url).searchParams.get('function') || '';
    m.calls.push(fn);
    const v = m.av[fn];
    if (v instanceof Error) throw v;
    return v ?? null;
  }),
}));

import { fetchOptionsSnapshot } from '../lib/goldenEggFetchers';

function contract(symbol: string, type: 'call' | 'put', strike: number, expiration: string) {
  return {
    contractID: `${symbol}${expiration.replace(/-/g, '').slice(2)}${type === 'call' ? 'C' : 'P'}${strike}`, symbol, expiration,
    strike: strike.toFixed(2), type, last: '5.00', mark: '5.00', bid: '4.90', ask: '5.10', volume: '100', open_interest: '1500',
    date: '2026-09-24', implied_volatility: '0.22', delta: type === 'call' ? '0.50' : '-0.50', gamma: '0.01', theta: '-0.1', vega: '0.2',
  };
}
const exp = '2026-10-16';
const hist = { endpoint: 'Historical Options', message: 'success', data: [490, 500, 510].flatMap((k) => [contract('SPY', 'call', k, exp), contract('SPY', 'put', k, exp)]) };
const sample = { message: 'This is a premium endpoint. ***THE SAMPLE DATA SCHEMA BELOW IS ARTIFICIAL***', data: [contract('XXYYZZ', 'call', 20, '2099-99-99')] };

describe('fetchOptionsSnapshot provider fallback', () => {
  beforeEach(() => {
    m.av = {}; m.calls = [];
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T14:00:00Z'));
  });

  it('realtime not entitled (Information note) → still uses HISTORICAL_OPTIONS', async () => {
    m.av = {
      REALTIME_OPTIONS_FMV: new Error('AV info error: premium endpoint'),
      REALTIME_OPTIONS: new Error('AV info error: premium endpoint'),
      HISTORICAL_OPTIONS: hist,
    };
    const snap = await fetchOptionsSnapshot('SPY', 500);
    vi.useRealTimers();
    expect(m.calls).toEqual(['REALTIME_OPTIONS_FMV', 'REALTIME_OPTIONS', 'HISTORICAL_OPTIONS']);
    expect(snap).not.toBeNull();
    expect(snap?.canonical?.notes.join(' ')).toMatch(/HISTORICAL_OPTIONS/);
  });

  it('artificial sample chain is skipped, never summarised', async () => {
    m.av = { REALTIME_OPTIONS_FMV: sample, REALTIME_OPTIONS: sample, HISTORICAL_OPTIONS: hist };
    const snap = await fetchOptionsSnapshot('SPY', 500);
    vi.useRealTimers();
    expect(snap).not.toBeNull();
    expect(snap?.canonical?.notes.join(' ')).toMatch(/HISTORICAL_OPTIONS/);
  });

  it('entitled realtime chain is used first (one call)', async () => {
    m.av = { REALTIME_OPTIONS_FMV: hist };
    const snap = await fetchOptionsSnapshot('SPY', 500);
    vi.useRealTimers();
    expect(m.calls).toEqual(['REALTIME_OPTIONS_FMV']);
    expect(snap?.canonical?.notes.join(' ')).toMatch(/REALTIME_OPTIONS_FMV/);
  });
});
