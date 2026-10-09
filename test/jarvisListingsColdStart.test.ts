import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tryToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/avRateGovernor', () => ({
  avTakeToken: vi.fn(async () => {}),
  avTryToken: (...args: unknown[]) => tryToken(...args),
}));

import {
  JARVIS_LISTINGS_TOKEN_WAIT_MS,
  StockListingsError,
  loadListings,
  rethrowStockListingsFailure,
} from '@/lib/jarvis/radar/stage1';

const LISTINGS = [
  'symbol,name,exchange,assetType,ipoDate,delistingDate,status',
  'AAPL,Apple Inc,NASDAQ,Stock,1980-12-12,null,Active',
].join('\n');

describe('Jarvis listings cold start', () => {
  const previousKey = process.env.ALPHA_VANTAGE_API_KEY;

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    tryToken.mockReset();
    if (previousKey === undefined) delete process.env.ALPHA_VANTAGE_API_KEY;
    else process.env.ALPHA_VANTAGE_API_KEY = previousKey;
  });

  it('waits at least 65s for the first token, then fails loudly', async () => {
    vi.useFakeTimers();
    process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
    tryToken.mockResolvedValue(false);
    expect(JARVIS_LISTINGS_TOKEN_WAIT_MS).toBeGreaterThanOrEqual(65_000);
    const pending = loadListings();
    let settled = false;
    pending.then(() => { settled = true; }, () => { settled = true; });
    await vi.advanceTimersByTimeAsync(64_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).rejects.toThrow(StockListingsError);
    await expect(pending).rejects.toThrow(/Stock listings download failed: no Alpha Vantage token for LISTING_STATUS after 65000ms/);
    expect(tryToken.mock.calls.length).toBeGreaterThan(200);
    expect(tryToken).toHaveBeenCalledWith({ lane: 'backfill', feature: 'jarvis-listings' });
  });

  it('returns listings when the first token is granted immediately', async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
    tryToken.mockResolvedValue(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(LISTINGS, { status: 200 })));
    const result = await loadListings();
    expect(result.listings.map((row) => row.symbol)).toEqual(['AAPL']);
    expect(tryToken).toHaveBeenCalledTimes(1);
  });

  it('throws when the listings download is not a stock file', async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
    tryToken.mockResolvedValue(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"Note":"Thank you for using Alpha Vantage"}', { status: 200 })));
    await expect(loadListings()).rejects.toThrow(/Stock listings download failed: LISTING_STATUS did not return a stock listings file/);
  });

  it('throws when the file contains no stocks', async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
    tryToken.mockResolvedValue(true);
    const csv = [
      'symbol,name,exchange,assetType,ipoDate,delistingDate,status',
      'ZZZ,Example Warrant,NASDAQ,Stock,2020-01-01,null,Active',
    ].join('\n');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(csv, { status: 200 })));
    await expect(loadListings()).rejects.toThrow(/Stock listings download failed: LISTING_STATUS returned no stocks/);
  });

  it('throws when the API key is missing', async () => {
    delete process.env.ALPHA_VANTAGE_API_KEY;
    await expect(loadListings()).rejects.toThrow(/Stock listings download failed: ALPHA_VANTAGE_API_KEY is not set/);
    expect(tryToken).not.toHaveBeenCalled();
  });

  it('lets a listings failure escape the overnight scan instead of scanning with no stocks', () => {
    expect(() => rethrowStockListingsFailure(new StockListingsError('Stock listings download failed: LISTING_STATUS returned no stocks'))).toThrow(/returned no stocks/);
    expect(() => rethrowStockListingsFailure(new Error('quotes timed out'))).not.toThrow();
    const scan = readFileSync('lib/jarvis/radar/scan.ts', 'utf8');
    expect(scan).toContain('rethrowStockListingsFailure(e)');
    const script = readFileSync('scripts/jarvis-overnight-scan.ts', 'utf8');
    expect(script).toContain('process.exit(1)');
  });
});
