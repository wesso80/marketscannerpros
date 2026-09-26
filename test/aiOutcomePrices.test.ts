import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ avFetch: vi.fn(), getBars: vi.fn() }));
vi.mock('@/lib/avRateGovernor', () => ({ avFetch: mocks.avFetch }));
vi.mock('@/lib/marketData', () => ({ getBars: mocks.getBars }));

import {
  createHorizonPriceResolver,
  fetchEquityIntradayBars,
  resetEntitlementDowngrade,
  type BarFetchers,
} from '@/lib/outcomes/aiOutcomePrices';

const intradayPayload = {
  'Meta Data': { '6. Time Zone': 'US/Eastern' },
  'Time Series (60min)': { '2026-09-25 15:00:00': { '4. close': '101' } },
};

describe('equity intraday entitlement', () => {
  beforeEach(() => {
    process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
    delete process.env.AI_OUTCOME_AV_ENTITLEMENT;
    resetEntitlementDowngrade();
    mocks.avFetch.mockReset();
  });
  afterEach(() => { delete process.env.ALPHA_VANTAGE_API_KEY; });

  it('asks for delayed data first and falls back once when the key is not entitled', async () => {
    mocks.avFetch
      .mockRejectedValueOnce(new Error('AV info error: Thank you for using Alpha Vantage! You are not yet entitled to 15-minute delayed US market data.'))
      .mockResolvedValueOnce(intradayPayload);
    const now = Date.parse('2026-09-26T00:00:00Z');
    const bars = await fetchEquityIntradayBars('AAPL', now);
    expect(bars).toEqual([{ closeTime: Date.parse('2026-09-25T20:00:00Z'), close: 101 }]);
    expect(mocks.avFetch).toHaveBeenCalledTimes(2);
    expect(mocks.avFetch.mock.calls[0][0]).toContain('entitlement=delayed');
    expect(mocks.avFetch.mock.calls[1][0]).not.toContain('entitlement=');

    // The downgrade is remembered: the next symbol costs one call, without the parameter.
    mocks.avFetch.mockResolvedValueOnce(intradayPayload);
    await fetchEquityIntradayBars('MSFT', now + 60_000);
    expect(mocks.avFetch).toHaveBeenCalledTimes(3);
    expect(mocks.avFetch.mock.calls[2][0]).not.toContain('entitlement=');
  });

  it('returns null (no substitute price) on other failures', async () => {
    mocks.avFetch.mockRejectedValueOnce(new Error('AV quota exceeded: Note'));
    expect(await fetchEquityIntradayBars('AAPL')).toBeNull();
    expect(mocks.avFetch).toHaveBeenCalledTimes(1);
  });

  it('honours AI_OUTCOME_AV_ENTITLEMENT=none', async () => {
    process.env.AI_OUTCOME_AV_ENTITLEMENT = 'none';
    mocks.avFetch.mockResolvedValueOnce(intradayPayload);
    await fetchEquityIntradayBars('AAPL');
    expect(mocks.avFetch.mock.calls[0][0]).not.toContain('entitlement=');
  });
});

describe('createHorizonPriceResolver', () => {
  const signal = Date.parse('2026-09-24T14:00:00Z');
  const now = Date.parse('2026-09-26T00:00:00Z');

  function fetchers(over: Partial<BarFetchers> = {}): BarFetchers {
    return {
      equityIntraday: vi.fn(async () => [{ closeTime: signal + 5 * 3_600_000, close: 102 }]),
      equityDaily: vi.fn(async () => [{ closeTime: signal + 30 * 3_600_000, close: 105 }]),
      cryptoIntraday: vi.fn(async () => null),
      cryptoDaily: vi.fn(async () => null),
      ...over,
    };
  }

  it('4h uses intraday only and never falls back to a daily close', async () => {
    const f = fetchers({ equityIntraday: vi.fn(async () => null) });
    const resolve = createHorizonPriceResolver(now, f);
    expect(await resolve('AAPL', 'equity', signal, '4h')).toBeNull();
    expect(f.equityDaily).not.toHaveBeenCalled();
  });

  it('24h falls back to the first daily close at/after the horizon when intraday does not reach it', async () => {
    const f = fetchers();
    const resolve = createHorizonPriceResolver(now, f);
    expect(await resolve('AAPL', 'equity', signal, '4h')).toEqual({ price: 102, at: signal + 5 * 3_600_000, source: 'intraday' });
    expect(await resolve('AAPL', 'equity', signal, '24h')).toEqual({ price: 105, at: signal + 30 * 3_600_000, source: 'daily' });
    // Bars are fetched once per symbol per run.
    await resolve('AAPL', 'equity', signal + 60_000, '24h');
    expect(f.equityIntraday).toHaveBeenCalledTimes(1);
    expect(f.equityDaily).toHaveBeenCalledTimes(1);
  });

  it('does not fetch anything for a horizon that has not passed', async () => {
    const f = fetchers();
    const resolve = createHorizonPriceResolver(signal + 3 * 3_600_000, f);
    expect(await resolve('AAPL', 'equity', signal, '4h')).toBeNull();
    expect(f.equityIntraday).not.toHaveBeenCalled();
  });
});
