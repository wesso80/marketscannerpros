/**
 * OV-7: Overview feeds carry the provider's own time (not the response time), and a missing move is n/a
 * (null), never a silent 0%.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  coinGeckoTimeToIso, equityLayerTiming, EQUITY_INTRADAY_MAX_AGE_MINUTES, oldestTradingDay, parseAlphaVantageEasternTime,
} from '@/lib/analysis/providerAsOf';
import { layerFreshness } from '@/lib/analysis/sessionDataHealth';
import { deriveRiskTone, interpretCryptoParticipation, rankSectorStrength } from '@/lib/analysis/commandCenter';

describe('provider time parsing', () => {
  it('Alpha Vantage Eastern stamps become UTC instants (EDT and EST)', () => {
    expect(parseAlphaVantageEasternTime('2026-09-25 16:15:59 US/Eastern')).toBe('2026-09-25T20:15:59.000Z');
    expect(parseAlphaVantageEasternTime('2026-01-15 16:00:00')).toBe('2026-01-15T21:00:00.000Z');
    expect(parseAlphaVantageEasternTime('04:15 PM ET 09/25/2026')).toBe('2026-09-25T20:15:00.000Z');
    expect(parseAlphaVantageEasternTime('')).toBeNull();
    expect(parseAlphaVantageEasternTime(undefined)).toBeNull();
    expect(parseAlphaVantageEasternTime('yesterday')).toBeNull();
  });
  it('CoinGecko updated_at (unix seconds) becomes ISO; absent stays null', () => {
    expect(coinGeckoTimeToIso(1790000000)).toBe(new Date(1790000000 * 1000).toISOString());
    expect(coinGeckoTimeToIso(undefined)).toBeNull();
    expect(coinGeckoTimeToIso(0)).toBeNull();
  });
  it('a set of quotes is only as current as its oldest trading day', () => {
    expect(oldestTradingDay(['2026-09-25', '2026-09-24', null, 'bad'])).toBe('2026-09-24');
    expect(oldestTradingDay([null, undefined])).toBeNull();
  });
});

describe('equity layer timing feeds the #86 freshness rule', () => {
  const midSession = new Date('2026-09-25T17:20:00Z'); // Fri 13:20 ET
  const saturday = new Date('2026-09-26T03:00:00Z'); // Sat 23:00 ET prev day → Fri session is latest
  it('intraday: a full provider time inside 30 min is live, older is stale', () => {
    const fresh = equityLayerTiming({ asOf: '2026-09-25T17:05:00Z' }, midSession);
    expect(fresh.cadenceMinutes).toBe(EQUITY_INTRADAY_MAX_AGE_MINUTES);
    expect(layerFreshness({ name: 'movers', available: true, ...fresh }, midSession.getTime())).toBe('live');
    const old = equityLayerTiming({ asOf: '2026-09-25T16:00:00Z' }, midSession);
    expect(layerFreshness({ name: 'movers', available: true, ...old }, midSession.getTime())).toBe('stale');
  });
  it('a quote dated before the latest opened session is stale; a date with no time intraday is unknown', () => {
    const prior = equityLayerTiming({ tradingDay: '2026-09-24' }, midSession);
    expect(prior.stale).toBe(true);
    const todayNoTime = equityLayerTiming({ tradingDay: '2026-09-25' }, midSession);
    expect(layerFreshness({ name: 'sectors', available: true, ...todayNoTime }, midSession.getTime())).toBe('unknown');
  });
  it('after the close, Friday data is the latest session (not stale); no provider time at all is unknown', () => {
    expect(equityLayerTiming({ asOf: '2026-09-25T20:15:59Z' }, saturday).stale).toBe(false);
    expect(equityLayerTiming({ tradingDay: '2026-09-24' }, saturday).stale).toBe(true);
    expect(equityLayerTiming({}, saturday)).toEqual({ asOf: null, stale: false });
  });
});

describe('missing moves are n/a, not 0%', () => {
  it('sector ranking and breadth leave out sectors with no change', () => {
    const r = rankSectorStrength([{ name: 'A', changePercent: 1 }, { name: 'B', changePercent: null }, { name: 'C', changePercent: -0.5 }]);
    expect(r.total).toBe(2);
    expect(r.greenRatio).toBe(0.5);
  });
  it('no sector data gives no breadth call; no crypto change gives "unavailable", not "Stable participation"', () => {
    expect(deriveRiskTone(null, null).tone).not.toBe('risk_off');
    expect(deriveRiskTone(null, null).tone).not.toBe('risk_on');
    expect(interpretCryptoParticipation({ marketCapChange24h: null, btcDominance: 58 }).stance).toBe('unknown');
  });
});

const mocks = vi.hoisted(() => ({ q: vi.fn(), session: vi.fn(), global: vi.fn(), chart: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), getSessionFromCookie: mocks.session }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));
vi.mock('@/lib/coingecko', async (orig) => ({ ...(await orig<typeof import('@/lib/coingecko')>()), getGlobalData: mocks.global, getGlobalMarketCapChart: mocks.chart }));

describe('routes return the provider time and null moves', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.q.mockResolvedValue([]);
    mocks.session.mockResolvedValue({ workspaceId: 'w1' });
    process.env.ALPHA_VANTAGE_API_KEY = 'test';
  });

  it('sector heatmap (ETF fallback): missing change % is null and unranked; asOfTradingDay is the oldest quote day', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('function=SECTOR')) return { json: async () => ({ Information: 'n/a' }) };
      const sym = /symbol=([A-Z]+)/.exec(url)?.[1] ?? '';
      const day = sym === 'XLE' ? '2026-09-24' : '2026-09-25';
      const pct = sym === 'XLK' ? undefined : sym === 'XLF' ? '-0.5000%' : '0.8000%';
      return { json: async () => ({ 'Global Quote': { '05. price': '100', '09. change': '1', ...(pct ? { '10. change percent': pct } : {}), '07. latest trading day': day } }) };
    }));
    const { GET } = await import('@/app/api/sectors/heatmap/route');
    const body = await (await GET(new NextRequest('https://example.test/api/sectors/heatmap'))).json();
    const xlk = body.sectors.find((s: any) => s.symbol === 'XLK');
    expect(xlk.changePercent).toBeNull();
    expect(xlk.rs_rank).toBeUndefined();
    expect(body.sectors.filter((s: any) => s.rs_rank != null).length).toBe(body.sectors.length - 1);
    expect(body.asOfTradingDay).toBe('2026-09-24');
    expect(body.asOf).toBeNull();
    expect(body.fetchedAt).toBe(body.timestamp);
    vi.unstubAllGlobals();
  });

  it('crypto market overview: CoinGecko updated_at is asOf; a missing 24h change is null', async () => {
    mocks.global.mockResolvedValue({ total_market_cap: { usd: 2.9e12 }, total_volume: { usd: 1e11 }, market_cap_percentage: { btc: 58.2 }, updated_at: 1790000000 });
    mocks.chart.mockResolvedValue(null);
    const { GET } = await import('@/app/api/crypto/market-overview/route');
    const body = await (await GET()).json();
    expect(body.asOf).toBe(new Date(1790000000 * 1000).toISOString());
    expect(body.data.marketCapChange24h).toBeNull();
    expect(body.meta.lastUpdated).toBe(body.asOf);
  });
});
