import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Regression: open OPTION positions in Journal / Portfolio never got a quote. journalQuoteRequest and the portfolio
 * refresh returned null for every Options trade (there was no option-quote path at all), so the row stayed
 * "no usable quote" / P&L Unavailable / R N/A (drawer showed 0.00), the portfolio current price stayed the entry
 * premium, and value/weight used premium × contracts with no 100× multiplier (≈0.0% size).
 * Generic made-up contract used throughout: XYZ 2026-10-16 100C.
 */

vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'ws-test', cid: 'c', tier: 'pro' })) }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: vi.fn(async () => undefined), avFetch: vi.fn(async () => null) }));
vi.mock('@/lib/rateLimit', () => ({ apiLimiter: { check: () => ({ allowed: true }) }, getClientIP: () => '127.0.0.1' }));

// Fri 25 Sep 2026 10:00 ET: the newest AV EOD chain is Thu 24 Sep.
const NOW = Date.parse('2026-09-25T14:00:00Z');
const EXP = '2026-10-16';

function avContract(type: 'call' | 'put', strike: number, date: string, over: Record<string, string> = {}, expiration = EXP) {
  return {
    contractID: `XYZ261016${type === 'call' ? 'C' : 'P'}${String(strike * 1000).padStart(8, '0')}`, symbol: 'XYZ', expiration,
    strike: strike.toFixed(2), type, last: '3.05', mark: '3.10', bid: '3.00', bid_size: '10', ask: '3.20', ask_size: '10',
    volume: '120', open_interest: '900', date, implied_volatility: '0.30', ...over,
  };
}
// Alpha Vantage shape: date on each contract, none at the top level.
const histPayload = (date: string) => ({
  endpoint: 'Historical Options', message: 'success',
  data: [95, 100, 105].flatMap((k) => [avContract('call', k, date, k === 100 ? {} : { mark: '1.00' }), avContract('put', k, date, { mark: '2.00' })]),
});

function stubAv(historical: unknown) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url);
    const fn = new URL(url).searchParams.get('function');
    const body = fn === 'HISTORICAL_OPTIONS' ? historical : { Information: 'premium endpoint not entitled' };
    return { status: 200, json: async () => body } as Response;
  }));
  return calls;
}

beforeEach(async () => {
  vi.resetModules();
  (await import('@/lib/options/chainCache')).clearSharedOptionsChainCache();
  vi.stubEnv('ALPHA_VANTAGE_API_KEY', 'test-key');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('option contract identity and chain lookup', () => {
  it('normalizes the recorded contract and refuses incomplete records', async () => {
    const { optionContractSpec } = await import('@/lib/options/contractQuote');
    expect(optionContractSpec({ symbol: 'xyz', optionType: 'CALL', strikePrice: '100', expirationDate: '2026-10-16T00:00:00.000Z' }))
      .toEqual({ underlying: 'XYZ', expiration: EXP, strike: 100, right: 'call' });
    expect(optionContractSpec({ symbol: 'XYZ', optionType: 'Put', strikePrice: 100, expirationDate: EXP })?.right).toBe('put');
    expect(optionContractSpec({ symbol: 'XYZ', optionType: 'CALL', strikePrice: null, expirationDate: EXP })).toBeNull();
    expect(optionContractSpec({ symbol: 'XYZ', optionType: undefined, strikePrice: 100, expirationDate: EXP })).toBeNull();
    expect(optionContractSpec({ symbol: 'XYZ', optionType: 'CALL', strikePrice: 100, expirationDate: undefined })).toBeNull();
  });

  it('prices only the exact contract: mark, else bid/ask mid, else last', async () => {
    const { findOptionContractMark } = await import('@/lib/options/contractQuote');
    const spec = { underlying: 'XYZ', expiration: EXP, strike: 100, right: 'call' as const };
    const chain = histPayload('2026-09-24').data;
    expect(findOptionContractMark(chain, spec)).toMatchObject({ price: 3.1, priceField: 'mark', asOfDate: '2026-09-24' });
    expect(findOptionContractMark([avContract('call', 100, '2026-09-24', { mark: '' })], spec)).toMatchObject({ price: 3.1, priceField: 'mid' });
    expect(findOptionContractMark([avContract('call', 100, '2026-09-24', { mark: '0', bid: '0', ask: '0' })], spec)).toMatchObject({ price: 3.05, priceField: 'last' });
    expect(findOptionContractMark(chain, { ...spec, strike: 110 })).toBeNull();
    expect(findOptionContractMark([avContract('call', 100, '2026-09-24', {}, '2026-10-23')], spec)).toBeNull();
  });
});

describe('journal marks for option trades', () => {
  const option = (over: Record<string, unknown> = {}) => ({
    id: 'opt', symbol: 'XYZ', assetClass: 'equity' as const, side: 'long' as const, status: 'open' as const, tradeType: 'Options' as const,
    option: { right: 'call' as const, strike: 100, expiration: EXP },
    entry: { price: 2.5, ts: '2026-09-20' }, qty: 2, stop: 1.5, ...over,
  });

  it('maps the API option fields into the trade row', async () => {
    const { mapJournalResponseToPayload } = await import('@/lib/journal/mapPayload');
    const payload = mapJournalResponseToPayload({ entries: [
      { id: 1, symbol: 'XYZ', tradeType: 'Options', optionType: 'CALL', strikePrice: 100, expirationDate: '2026-10-16T00:00:00.000Z', entryPrice: 2.5, quantity: 2, isOpen: true },
    ] }, NOW);
    expect(payload.trades[0].option).toEqual({ right: 'call', strike: 100, expiration: EXP });
  });

  it('requests the contract (never the underlying) and only when strike/expiry/right are recorded', async () => {
    const { journalQuoteRequest } = await import('@/lib/journal/markToMarket');
    const req = journalQuoteRequest(option());
    expect(req).toMatchObject({ type: 'option', key: `option:XYZ:${EXP}:100:C` });
    expect(req?.url).toBe(`/api/journal/option-quote?symbol=XYZ&expiration=${EXP}&strike=100&right=call`);
    expect(journalQuoteRequest(option({ option: { right: 'call', strike: 100 } }))).toBeNull();
    expect(journalQuoteRequest(option({ option: undefined }))).toBeNull();
  });

  it('accepts a previous-session EOD mark (labelled EOD) and rejects older / undated marks', async () => {
    const { parseJournalOptionQuote } = await import('@/lib/journal/markToMarket');
    expect(parseJournalOptionQuote({ ok: true, price: 3.1, asOfDate: '2026-09-24', basis: 'EOD' }, NOW)).toMatchObject({ price: 3.1, basis: 'EOD', asOfDate: '2026-09-24' });
    expect(parseJournalOptionQuote({ ok: true, price: 3.1, asOfDate: '2026-09-22', basis: 'EOD' }, NOW)).toBeNull();
    expect(parseJournalOptionQuote({ ok: true, price: 3.1 }, NOW)).toBeNull();
    expect(parseJournalOptionQuote({ ok: false, reason: 'contract_not_found' }, NOW)).toBeNull();
  });

  it('P&L and value use the 100× contract multiplier; R stays in premium terms', async () => {
    const { enrichTradesWithLivePrices } = await import('@/lib/journal/markToMarket');
    const { computeKpis } = await import('@/lib/journal/computeKpis');
    const mark = { price: 3.1, observedAt: null, retrievedAt: new Date(NOW).toISOString(), basis: 'EOD' as const, asOfDate: '2026-09-24' };
    const [row] = enrichTradesWithLivePrices([option()], { [`option:XYZ:${EXP}:100:C`]: mark });
    expect(row.pnlUsd).toBeCloseTo(120); // (3.10 − 2.50) × 2 contracts × 100
    expect(row.pnlPct).toBeCloseTo(24);
    expect(row.rMultiple).toBeCloseTo(0.6); // 0.60 gain / 1.00 premium risk
    expect(row.mark?.basis).toBe('EOD');
    // A stop recorded in underlying terms (above a long option's entry premium) is not a premium stop.
    const [underlyingStop] = enrichTradesWithLivePrices([option({ stop: 95 })], { [`option:XYZ:${EXP}:100:C`]: mark });
    expect(underlyingStop.pnlUsd).toBeCloseTo(120);
    expect(underlyingStop.rMultiple).toBeUndefined();
    const kpis = computeKpis([row], null, NOW);
    expect(kpis.unpricedOpenTrades).toBe(0);
    expect(kpis.unrealizedPnlOpen).toBeCloseTo(120);
    // No quote (contract not found): honest unpriced state, not the entry price.
    const [unpriced] = enrichTradesWithLivePrices([option()], {});
    expect(unpriced.pnlUsd).toBeUndefined();
    expect(computeKpis([unpriced], null, NOW).unpricedOpenTrades).toBe(1);
  });
});

describe('portfolio option positions', () => {
  it('value, weight and realized P&L use the contract multiplier', async () => {
    const { positionUnits, positionOptionContract } = await import('@/lib/portfolio/positionValue');
    const { splitPosition } = await import('@/lib/portfolio/closePosition');
    const opt = { id: 1, symbol: 'XYZ', side: 'LONG' as const, quantity: 2, entryPrice: 2.5, currentPrice: 3.1, pl: 0, plPercent: 0, tradeType: 'Options', optionType: 'CALL', strikePrice: 100, expirationDate: EXP };
    const stock = { id: 2, symbol: 'ABC', side: 'LONG' as const, quantity: 10, entryPrice: 50, currentPrice: 50, pl: 0, plPercent: 0 };
    expect(positionUnits(opt)).toBe(200);
    expect(positionUnits(stock)).toBe(10);
    const total = opt.currentPrice * positionUnits(opt) + stock.currentPrice * positionUnits(stock);
    expect((opt.currentPrice * positionUnits(opt)) / total * 100).toBeCloseTo(55.36, 1); // was 1.2% as 2 × $3.10
    expect(positionOptionContract(opt)).toEqual({ underlying: 'XYZ', expiration: EXP, strike: 100, right: 'call' });
    expect(positionOptionContract({ ...opt, strikePrice: undefined })).toBeNull();
    const { closed } = splitPosition(opt, 1, 3.1, '2026-09-25T14:00:00Z', 9, 100);
    expect(closed.realizedPL).toBeCloseTo(120);
    expect(closed.plPercent).toBeCloseTo(24);
  });
});

describe('GET /api/journal/option-quote (real fetchOptionsChain on an AV-shaped EOD chain)', () => {
  const url = (q: string) => new Request(`http://localhost/api/journal/option-quote?${q}`) as any;

  it('returns the contract mark with its EOD date', async () => {
    const calls = stubAv(histPayload('2026-09-24'));
    const { GET } = await import('../app/api/journal/option-quote/route');
    const body = await (await GET(url(`symbol=XYZ&expiration=${EXP}&strike=100&right=call`))).json();
    expect(body).toMatchObject({ ok: true, price: 3.1, priceField: 'mark', asOfDate: '2026-09-24', basis: 'EOD', source: 'HISTORICAL_OPTIONS' });
    // A second request inside the cache window does not spend another AV call.
    const before = calls.length;
    await GET(url(`symbol=XYZ&expiration=${EXP}&strike=100&right=call`));
    expect(calls.length).toBe(before);
  });

  it('is honest when the contract is absent, the expiry is absent, or the chain is stale', async () => {
    stubAv(histPayload('2026-09-24'));
    let { GET } = await import('../app/api/journal/option-quote/route');
    expect(await (await GET(url(`symbol=XYZ&expiration=${EXP}&strike=110&right=call`))).json()).toMatchObject({ ok: false, reason: 'contract_not_found' });
    // fetchOptionsChain would fall back to another expiry: that must not price this contract.
    expect(await (await GET(url('symbol=XYZ&expiration=2026-11-20&strike=100&right=call'))).json()).toMatchObject({ ok: false, reason: 'contract_not_found' });
    expect((await GET(url('symbol=XYZ&strike=100&right=call'))).status).toBe(400);

    vi.resetModules();
    (await import('@/lib/options/chainCache')).clearSharedOptionsChainCache(); // fresh server: no shared chain cache either
    stubAv(histPayload('2026-09-21'));
    ({ GET } = await import('../app/api/journal/option-quote/route'));
    expect(await (await GET(url(`symbol=XYZ&expiration=${EXP}&strike=100&right=call`))).json()).toMatchObject({ ok: false, reason: 'stale_quote' });
  });
});
