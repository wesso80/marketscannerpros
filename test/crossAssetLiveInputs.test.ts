/**
 * RS-14 — the Macro tab's Cross-Asset Correlation Regime ran on hard-coded placeholders (BTC 67k, SPY 540, VIX 18,
 * DXY 103, zero changes, corr 0.5) and always read "RISK ON 55/100". It now runs on live inputs loaded server-side;
 * a missing optional input is reported as unavailable instead of being defaulted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  chart: vi.fn(),
  simple: vi.fn(),
  load: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ q: vi.fn(async () => []) }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'w1' })) }));
vi.mock('@/lib/coingecko', async (orig) => ({ ...(await orig<Record<string, unknown>>()), getMarketChartHistory: h.chart, getSimplePrices: h.simple }));

import { computeCorrelationRegime } from '@/lib/correlation-regime-engine';
import { btcSpyReturnCorrelation, defaultCrossAssetDeps, loadCrossAssetInputs, type CrossAssetDeps } from '@/lib/crossAsset/liveInputs';

const NOW = Date.parse('2026-09-25T03:00:00Z');
const DAY = 86_400_000;
const snap = (symbol: string, price: number, change24h: number) => ({ symbol, price, change24h, timestamp: '2026-09-25' });

function sessions(n: number, end = '2026-09-24') {
  const out: string[] = [];
  let t = Date.parse(`${end}T00:00:00Z`);
  while (out.length < n) { const d = new Date(t).getUTCDay(); if (d !== 0 && d !== 6) out.unshift(new Date(t).toISOString().slice(0, 10)); t -= DAY; }
  return out;
}

function deps(over: Partial<CrossAssetDeps> = {}): CrossAssetDeps {
  const days = sessions(30);
  let s = 600, b = 100_000;
  const spy = days.map((d, i) => ({ date: d, close: (s *= 1 + Math.sin(i) * 0.01) }));
  const btc = days.map((d, i) => ({ date: d, close: (b *= 1 + Math.sin(i) * 0.02) })); // same-sign moves → corr ≈ 1
  return {
    now: () => NOW,
    btc: async () => ({ price: 111_000, changePct: 1.2, asOf: '2026-09-25T02:59:00Z', source: 'cg' }),
    quote: async (sym) => ({ price: { SPY: 660, GLD: 330, XLK: 280, XLU: 80, XLF: 52 }[sym] ?? 1, changePct: { SPY: 0.6, GLD: 0.1, XLK: 1.0, XLU: -0.2, XLF: 0.1 }[sym] ?? 0, asOf: '2026-09-24', source: 'av' }),
    vix: async () => ({ level: 14.21, asOf: '2026-09-22', source: 'FRED CSV (VIXCLS)' }),
    dxy: async () => ({ level: 120.5, changePct: -0.2, asOf: '2026-09-19', source: 'FRED (DTWEXBGS, stored)' }),
    spyDaily: async () => spy,
    btcDaily: async () => btc,
    ...over,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('correlation regime engine: no placeholder defaults', () => {
  it('missing optional inputs are reported unavailable and not scored', () => {
    const r = computeCorrelationRegime({ btc: snap('BTC', 100000, 0), spy: snap('SPY', 600, 0) });
    expect(r.vixRegime).toBe('UNAVAILABLE');
    expect(r.dxyTrend).toBe('unavailable');
    expect(r.btcSpyCorrelation).toBeNull();
    expect(r.sectorRotation).toBe('UNAVAILABLE');
    expect(r.components.goldSafeHaven).toBeNull();
    expect(r.components.vixLevel).toBeNull();
    expect(r.unavailable).toEqual(['vix', 'dxy', 'gold', 'btcSpyCorrelation', 'sectors']);
    expect(r.riskScore).toBe(50); // flat moves, nothing else scored — not the old constant 55
  });
  it('responds to real moves', () => {
    const r = computeCorrelationRegime({ btc: snap('BTC', 100000, -2), spy: snap('SPY', 600, -1.1), vix: snap('VIX', 24, 0), btcSpyCorrelation: 0.6 });
    expect(r.regime).toBe('RISK_OFF');
    expect(r.riskScore).toBeLessThan(30);
  });
});

describe('BTC↔SPY return correlation', () => {
  it('uses SPY session dates that have a BTC close; null below 15 returns', () => {
    const days = sessions(25);
    const spy = days.map((d, i) => ({ date: d, close: 100 + i + (i % 3) }));
    const btc = days.map((d, i) => ({ date: d, close: 1000 + 10 * (i + (i % 3)) }));
    expect(btcSpyReturnCorrelation(spy, btc)!.value).toBeGreaterThan(0.95);
    expect(btcSpyReturnCorrelation(spy, btc)!.returns).toBe(20);
    expect(btcSpyReturnCorrelation(spy.slice(-10), btc)).toBeNull();
  });
});

describe('loadCrossAssetInputs', () => {
  it('builds the model input from live values, with each input dated', async () => {
    const r = await loadCrossAssetInputs(deps());
    expect(r.missingRequired).toEqual([]);
    expect(r.input!.btc).toMatchObject({ price: 111_000, change24h: 1.2 });
    expect(r.input!.spy).toMatchObject({ price: 660, change24h: 0.6 });
    expect(r.input!.vix!.price).toBe(14.21);
    expect(r.input!.dxy!.change24h).toBe(-0.2);
    expect(r.input!.sectors!.xlk!.change24h).toBe(1.0);
    expect(r.input!.btcSpyCorrelation).toBeGreaterThan(0.9);
    expect(r.inputs.vix).toMatchObject({ available: true, asOf: '2026-09-22' });
    const out = computeCorrelationRegime(r.input!);
    expect(out.regime).toBe('RISK_ON');
    expect(out.vixRegime).toBe('NORMAL');
    expect(out.dxyTrend).toBe('weakening');
    expect(out.sectorRotation).toBe('GROWTH_LEADING');
    expect(out.unavailable).toEqual([]);
  });
  it('stale VIX / missing USD index become unavailable (not defaulted)', async () => {
    const r = await loadCrossAssetInputs(deps({ vix: async () => ({ level: 17, asOf: '2026-06-10', source: 'stored' }), dxy: async () => null }));
    expect(r.input!.vix).toBeUndefined();
    expect(r.input!.dxy).toBeUndefined();
    expect(r.inputs.vix.available).toBe(false);
    expect(r.inputs.vix.note).toMatch(/2026-06-10/);
    expect(r.inputs.dxy.note).toMatch(/unavailable/);
    const out = computeCorrelationRegime(r.input!);
    expect(out.vixRegime).toBe('UNAVAILABLE');
    expect(out.dxyTrend).toBe('unavailable');
  });
  it('a missing SPY quote (or a failing helper) makes the regime unavailable', async () => {
    const r = await loadCrossAssetInputs(deps({ quote: async (s) => (s === 'SPY' ? null : { price: 1, changePct: 0, asOf: '2026-09-24', source: 'av' }), btc: async () => { throw new Error('cg down'); } }));
    expect(r.input).toBeNull();
    expect(r.missingRequired).toEqual(['BTC', 'SPY']);
  });
  it('stale SPY daily bars → correlation unavailable', async () => {
    const r = await loadCrossAssetInputs(deps({ spyDaily: async () => sessions(30, '2026-09-10').map((d, i) => ({ date: d, close: 600 + i })) }));
    expect(r.input!.btcSpyCorrelation).toBeNull();
    expect(r.inputs.btcSpyCorrelation.note).toMatch(/stale/);
  });
  it('default BTC daily closes: the 00:00 UTC point on D+1 is day D; the trailing "now" point is skipped', async () => {
    const mid = Date.parse('2026-09-24T00:00:00Z');
    h.chart.mockResolvedValue({ prices: [[mid - DAY, 100], [mid, 110], [mid + DAY, 120], [mid + DAY + 3 * 3_600_000, 125]] });
    expect(await defaultCrossAssetDeps.btcDaily()).toEqual([
      { date: '2026-09-22', close: 100 }, { date: '2026-09-23', close: 110 }, { date: '2026-09-24', close: 120 },
    ]);
  });
});

describe('GET /api/correlation-regime', () => {
  it('returns available:false with a reason instead of placeholder output', async () => {
    vi.resetModules();
    vi.doMock('@/lib/crossAsset/liveInputs', () => ({ loadCrossAssetInputs: async () => ({ input: null, missingRequired: ['SPY'], inputs: { spy: { label: 'SPY', available: false } } }) }));
    const { GET } = await import('@/app/api/correlation-regime/route');
    const body = await (await GET()).json();
    expect(body.available).toBe(false);
    expect(body.reason).toMatch(/SPY is unavailable/);
    expect(body.regime).toBeUndefined();
    vi.doUnmock('@/lib/crossAsset/liveInputs');
  });
  it('returns the computed regime plus the dated inputs', async () => {
    vi.resetModules();
    const { loadCrossAssetInputs: real } = await import('@/lib/crossAsset/liveInputs');
    const loaded = await real(deps());
    vi.doMock('@/lib/crossAsset/liveInputs', () => ({ loadCrossAssetInputs: async () => loaded }));
    const { GET } = await import('@/app/api/correlation-regime/route');
    const body = await (await GET()).json();
    expect(body.available).toBe(true);
    expect(body.regime).toBe('RISK_ON');
    expect(body.inputs.btc.value).toBe(111_000);
    expect(body.components.vixLevel).toBe(14.21);
    vi.doUnmock('@/lib/crossAsset/liveInputs');
  });
});
