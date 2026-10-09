// @vitest-environment jsdom
/**
 * W3 /api/market-pressure publishes measured market inputs only. Providers are fakes loaded with the fields the old
 * response turned into advice (sentiment, smart-money bias, regime governor), and with missing values that used to be
 * backfilled (put/call 1.0, OI change 0, cross-coin funding average). The Market Pressure Engine must not be called
 * for the public response. The widget is rendered from the route's real output.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ session: { workspaceId: 'ws-a', tier: 'pro' } as any, paid: true, calls: 0, options: null as any, oi: [] as any[], indicators: null as any }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => h.session) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => h.paid }));
vi.mock('@/lib/onDemandFetch', () => ({ getIndicators: vi.fn(async () => { h.calls++; return h.indicators; }) }));
vi.mock('@/lib/coingecko', () => ({
  getAggregatedFundingRates: vi.fn(async () => []),
  getAggregatedOpenInterest: vi.fn(async () => h.oi),
}));
vi.mock('@/lib/options-confluence-analyzer', () => ({ optionsAnalyzer: { analyzeForOptions: vi.fn(async () => h.options) } }));
vi.mock('@/lib/marketPressureEngine', () => ({ computeMarketPressure: vi.fn(() => { throw new Error('engine must not run for the public response'); }) }));
import { GET } from '@/app/api/market-pressure/route';
import MarketPressureWidget from '@/components/MarketPressureWidget';

const OPTIONS = {
  currentPrice: 100,
  dataQuality: { optionsChainSource: 'alpha_vantage', lastUpdated: '2026-10-07T20:05:00Z' },
  openInterestAnalysis: { pcRatio: 0.75, maxPainStrike: 100, maxPainReliability: { reliable: true }, expirationDate: '2026-10-16', sentiment: 'bullish', sentimentReason: 'CANARY-SENT', highOIStrikes: [{ strike: 105, openInterest: 5000, type: 'call', gamma: 0.02, iv: 0.3 }, { strike: 95, openInterest: 4000, type: 'put', gamma: 0.02, iv: 0.3 }] },
  unusualActivity: { hasUnusualActivity: true, unusualStrikes: [{ strike: 110 }, { strike: 90 }], smartMoneyDirection: 'bullish', alertLevel: 'high' },
  ivAnalysis: { ivRank: null, ivSignal: 'buy_premium' },
};
let n = 0;
const get = async (symbol: string) => { const r = await GET(new NextRequest(`https://msp.test/api/market-pressure?symbol=${symbol}&scanMode=intraday_1h`)); return { status: r.status, headers: r.headers, body: await r.json() }; };
const FORBIDDEN = /^(composite|direction|alignment|label|score|weight|pressures|regime|regimeState|regimeConfidence|sentiment|smartMoneyBias|fundingSentiment|oiSignal|gexRegime|summary)$/;
function keyPaths(v: any, path = '', out: string[] = []): string[] {
  if (Array.isArray(v)) { v.forEach((x) => keyPaths(x, `${path}[]`, out)); return out; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(`${path}.${k}`); keyPaths(x, `${path}.${k}`, out); }
  return out;
}
beforeEach(() => {
  h.session = { workspaceId: 'ws-a', tier: 'pro' }; h.paid = true; h.calls = 0;
  h.options = OPTIONS; h.oi = [{ symbol: 'BTC', totalOpenInterest: 12_500_000_000, exchanges: 9, avgVolume24h: 1 }];
  h.indicators = { adx14: 23.4, atrPercent14: 2.15, inSqueeze: false, computedAt: '2026-10-07T21:00:00Z', source: 'database' };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('public market inputs (route)', () => {
  it('equity: measured inputs with source and time; no score, direction, label or model state', async () => {
    const { status, headers, body } = await get(`ZZEQ${n++}`);
    expect(status).toBe(200);
    expect(headers.get('cache-control')).toBe('private, no-store, max-age=0');
    const d = body.data;
    expect(d.contract).toBe('public-market-inputs-v1');
    expect(Object.keys(d).sort()).toEqual(['assetClass', 'contract', 'derivatives', 'note', 'observedAt', 'options', 'symbol', 'volatility']);
    expect(keyPaths(body).filter((p) => FORBIDDEN.test(p.split('.').at(-1)!))).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/CANARY|bullish|bearish|LONG|SHORT|buy_premium|ws-a/);
    expect(d.derivatives).toBeNull();
    expect(d.volatility).toMatchObject({ available: true, source: 'Alpha Vantage daily indicators', asOf: '2026-10-07T21:00:00.000Z', values: { adx14: 23.4, atrPercent14: 2.15, inSqueeze: false }, missing: [] });
    expect(d.options.values).toMatchObject({ putCallRatio: 0.75, maxPainStrike: 100, maxPainReliable: true, ivRank: null, strikesWithHighVolumeVsOpenInterest: 2, expiry: '2026-10-16' });
    expect(d.options).toMatchObject({ source: 'alpha_vantage options chain', asOf: '2026-10-07T20:05:00.000Z' });
    expect(d.options.missing).toContain('IV rank');
    expect(d.options.values.gammaEstimateBasis).toMatch(/Estimate .* Not observed dealer positioning/);
  });
  it('missing inputs are null with a reason, never a default (put/call 1.0, OI change 0, cross-coin funding)', async () => {
    h.options = { ...OPTIONS, openInterestAnalysis: { ...OPTIONS.openInterestAnalysis, pcRatio: undefined } };
    h.indicators = null;
    const eq = (await get(`ZZEQ${n++}`)).body.data;
    expect(eq.options.values.putCallRatio).toBeNull();
    expect(eq.options.missing).toContain('Put/call ratio');
    expect(eq.volatility).toMatchObject({ available: false, asOf: null, values: { adx14: null, atrPercent14: null, inSqueeze: null }, missing: ['Daily indicators not collected for this symbol'] });
    h.oi = [{ symbol: 'ETH', totalOpenInterest: 9, exchanges: 3 }]; // another coin only
    const cr = (await get(`ZZC${n++}USD`)).body.data;
    expect(cr.assetClass).toBe('crypto');
    expect(cr.options).toBeNull();
    expect(cr.derivatives).toMatchObject({ available: false, asOf: null, values: { openInterestUsd: null, exchanges: null, fundingRatePercent: null } });
    expect(cr.derivatives.missing.join(' ')).toMatch(/Open interest not collected.*Funding rate not collected: the feed does not supply funding intervals/);
    expect(JSON.stringify(cr)).not.toMatch(/oi24hChange|"9"/);
  });
  it('requires Pro and checks access before any provider call', async () => {
    h.session = null;
    expect((await get('AAPL')).status).toBe(401);
    h.session = { workspaceId: 'ws-a', tier: 'free' }; h.paid = false;
    expect((await get('AAPL')).status).toBe(403);
    expect(h.calls).toBe(0);
  });
});

describe('Market inputs widget', () => {
  it('renders the real route output: values with source, Not collected where missing, no score or direction', async () => {
    const symbol = `ZZEQ${n++}`;
    const routeBody = (await get(symbol)).body;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(routeBody), { status: 200 })));
    const { container } = render(<MarketPressureWidget symbol={symbol} />);
    await waitFor(() => expect(container.querySelector('[data-market-inputs]')).toBeTruthy());
    const text = container.textContent || '';
    expect(text).toContain('ADX (14)23.4');
    expect(text).toContain('Put/call (open interest)0.75');
    expect(text).toContain('IV rankNot collected');
    expect(text).toContain('alpha_vantage options chain');
    expect(text).toContain('Squeeze = daily Bollinger Bands (20, 2)');
    expect(text).not.toMatch(/Pressure\b|Upside|Downside|Mixed evidence|Alignment|\/100|\bw\b|HIGH|BUILDING|Regime/);
  });
  it('does not render a response that is not the public contract', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, reading: { composite: 80, direction: 'LONG' } }), { status: 200 })));
    const { container } = render(<MarketPressureWidget symbol="AAPL" />);
    await waitFor(() => expect(container.textContent).toContain('Market inputs could not be loaded'));
    expect(container.textContent).not.toMatch(/80|LONG|Upside/);
  });
});
