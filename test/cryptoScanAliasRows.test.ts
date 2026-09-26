/**
 * SC-12: the Pro crypto scan must never output two rows with identical data under different symbols that are
 * aliases of one coin (live: 'AP' carried UNI's figures, 'HB' carried HBAR's).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ series: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'test-workspace', tier: 'pro' }) }));
vi.mock('@/lib/entitlements', () => ({ getEffectiveTier: async () => 'pro' }));
vi.mock('@/lib/adaptiveTrader', () => ({ getAdaptiveLayer: async () => null }));
vi.mock('@/lib/db', () => ({ q: mocks.query }));
// Simulates the old fuzzy resolution: the stray tickers resolve to the same coins as the real ones.
const IDS: Record<string, string> = { BTC: 'bitcoin', UNI: 'uniswap', AP: 'uniswap', HBAR: 'hedera-hashgraph', HB: 'hedera-hashgraph', ETH: 'ethereum' };
vi.mock('@/lib/coingecko', () => ({
  getMarketData: async () => [], getDerivativesForSymbols: async () => [], getOHLC: async () => [],
  COINGECKO_ID_MAP: { BTC: 'bitcoin', ETH: 'ethereum', UNI: 'uniswap', HBAR: 'hedera-hashgraph' }, resolveSymbolToId: async (symbol: string) => IDS[symbol] ?? null,
}));
vi.mock('@/lib/scanner/cryptoBars', () => ({ fetchCryptoSeries: mocks.series }));
import { POST } from '@/app/api/scanner/bulk/route';

const DAY_MS = 86_400_000;
/** Synthetic daily bars that depend only on the coin id, so aliases get byte-identical data. */
function seriesFor(symbol: string, coinId: string) {
  const seed = [...coinId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const start = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - 260 * DAY_MS;
  const bars = Array.from({ length: 260 }, (_, i) => {
    const close = seed / 10 + i * 0.3 + Math.sin((i + seed) / 3) * 2;
    return { t: new Date(start + i * DAY_MS).toISOString(), open: close - 0.5, high: close + 1.2, low: close - 1.2, close, volume: 40_000_000 + (i % 5) * 1_000_000 };
  });
  return { symbol, bars, barInterval: '1d', lastCompletedBarAt: bars[bars.length - 1].t, volumeBasis: 'market_chart_24h', coinId };
}

describe('Pro crypto scan: no phantom alias rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue(['BTC', 'ETH', 'AP', 'HB', 'HBAR', 'UNI'].map((symbol) => ({ symbol })));
    mocks.series.mockImplementation(async (symbol: string, _tf: string, _now: number, opts: { coinId: string }) => seriesFor(symbol, opts.coinId));
  });

  it('lists each coin once and reports the aliases as duplicates', async () => {
    const res = await POST(new NextRequest('https://example.test/api/scanner/bulk', {
      method: 'POST', body: JSON.stringify({ type: 'crypto', mode: 'deep', filters: {} }), headers: { 'content-type': 'application/json' },
    }));
    const data = await res.json();
    const rows: Array<{ symbol: string; indicators: unknown; price?: number }> = [...(data.topPicks ?? []), ...(data.candidates ?? [])];
    const symbols = new Set(rows.map((r) => r.symbol));
    expect(symbols.has('AP')).toBe(false);
    expect(symbols.has('HB')).toBe(false);
    expect(data.universe.excluded).toEqual(expect.arrayContaining([
      { symbol: 'AP', reason: 'duplicate_of_UNI' },
      { symbol: 'HB', reason: 'duplicate_of_HBAR' },
    ]));
    // No two output rows share identical data under different symbols.
    const bySignature = new Map<string, string>();
    for (const row of rows) {
      const sig = JSON.stringify(row.indicators);
      const other = bySignature.get(sig);
      if (other && other !== row.symbol) throw new Error(`${row.symbol} duplicates ${other}`);
      bySignature.set(sig, row.symbol);
    }
    expect(data.universe.valid).toBe(4); // BTC, ETH, HBAR, UNI
  });
});
