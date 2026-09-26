/**
 * MV-6: sector ETF top holdings and sector weights (Alpha Vantage ETF_PROFILE) for Markets & sectors.
 * Fixture: trimmed copy of the documentation demo response (QQQ).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clearEtfProfileCache, etfUnavailableReason, getEtfProfileCached, summarizeEtfProfile, titleCase } from '@/lib/etf/etfProfile';
import { formatNetAssets } from '@/lib/etf/etfProfileText';

const QQQ = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/av-etf/etf_profile_QQQ.json'), 'utf8'));
const NOW = Date.UTC(2026, 8, 26, 9);

describe('ETF_PROFILE summary', () => {
  it('reads top holdings, sector weights and fund facts as percentages', () => {
    const s = summarizeEtfProfile('qqq', QQQ);
    if (s.status !== 'ok') throw new Error('expected ok');
    expect(s).toMatchObject({ symbol: 'QQQ', netAssets: 489e9, expenseRatioPct: 0.18, dividendYieldPct: 0.41, inceptionDate: '1999-03-10', lastUpdated: '2026-09-25 00:01 UTC', leveraged: false, holdingsCount: 14 });
    expect(s.topHoldings).toHaveLength(10);
    expect(s.topHoldings[0]).toEqual({ symbol: 'NVDA', name: 'NVIDIA CORP', weightPct: 8.51 });
    expect(s.topHoldings.map((h) => h.symbol).slice(0, 4)).toEqual(['NVDA', 'AAPL', 'MSFT', 'MU']);
    expect(s.topHoldingsWeightPct).toBe(46.3);
    expect(s.sectors[0]).toEqual({ sector: 'Information Technology', weightPct: 56.9 });
    expect(s.sectors.find((x) => x.sector === 'Real Estate')).toBeUndefined(); // 0% weight dropped
    expect(s.sectors).toHaveLength(10);
    expect(formatNetAssets(s.netAssets!)).toBe('$489.0B');
  });

  it('title-cases sector names and treats a payload without holdings or sectors as unavailable', () => {
    expect(titleCase('HEALTHCARE')).toBe('Healthcare');
    expect(titleCase('CONSUMER STAPLES')).toBe('Consumer Staples');
    expect(summarizeEtfProfile('XLK', {})).toEqual({ status: 'unavailable', symbol: 'XLK', reason: 'Alpha Vantage returned no ETF profile for this symbol' });
  });

  it('redacts any API key in a reason', () => {
    expect(etfUnavailableReason(new Error('AV info error: We have detected your API key as ZZZ999 and ...'), 'K')).toBe('Alpha Vantage: We have detected your API key as [key] and ...');
  });
});

describe('getEtfProfileCached (shared AV governor, cached)', () => {
  const OLD_KEY = process.env.ALPHA_VANTAGE_API_KEY;
  beforeEach(() => { clearEtfProfileCache(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (OLD_KEY === undefined) delete process.env.ALPHA_VANTAGE_API_KEY; else process.env.ALPHA_VANTAGE_API_KEY = OLD_KEY;
  });

  it('calls ETF_PROFILE once and serves the cached summary for hours', async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'TESTKEY';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(QQQ)));
    vi.stubGlobal('fetch', fetchMock);
    const a = await getEtfProfileCached('XLK', { now: NOW });
    expect(a.status).toBe('ok');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://www.alphavantage.co/query?function=ETF_PROFILE&symbol=XLK&apikey=TESTKEY');
    await getEtfProfileCached('xlk', { now: NOW + 6 * 60 * 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is "unavailable" with Alpha Vantage\'s message on Information/Note, and retries after 15 minutes', async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'TESTKEY';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ Information: 'Please consider upgrading to a premium plan.' })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getEtfProfileCached('XLE', { now: NOW })).toEqual({ status: 'unavailable', symbol: 'XLE', reason: 'Alpha Vantage: Please consider upgrading to a premium plan.' });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[etfProfile] ETF_PROFILE XLE unavailable: Alpha Vantage: Please consider'));
    await getEtfProfileCached('XLE', { now: NOW + 10 * 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await getEtfProfileCached('XLE', { now: NOW + 16 * 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('makes no call without a key', async () => {
    delete process.env.ALPHA_VANTAGE_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await getEtfProfileCached('XLK', { now: NOW })).toMatchObject({ status: 'unavailable', reason: 'Alpha Vantage is not configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
