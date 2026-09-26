import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOiObservation, compareOi24h, HOUR_MS, totalOiChange } from '@/lib/crypto/oiComparisons';
import { cryptoReviewFeedNotes, cryptoReviewMissing } from '@/lib/cryptoReviewData';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const now = Date.UTC(2026, 8, 26, 8, 40);
const sec = (ms: number) => ms / 1000 - 30;
const obs = (at: number, rows: Array<[string, string, number]>) =>
  buildOiObservation('BTC', rows.map(([market, symbol, openInterest]) => ({ market, symbol, openInterest, lastTradedAt: sec(at) })), at)!;

describe('OV-18 comparable open-interest change', () => {
  const dayAgo = now - 24 * HOUR_MS;
  const base: Array<[string, string, number]> = [['Binance', 'BTCUSDT', 800], ['Bybit', 'BTCUSDT', 150], ['Gate', 'BTC_USDT', 45], ['Gate', 'BTC_USD', 5]];

  it('a thin contract missing from one snapshot no longer blocks the change (v2 required the identical contract set)', () => {
    const previous = obs(dayAgo, base);
    const current = obs(now, [['Binance', 'BTCUSDT', 880], ['Bybit', 'BTCUSDT', 165], ['Gate', 'BTC_USDT', 49.5]]); // BTC_USD not traded in 15 min
    const result = compareOi24h(current, [previous], now);
    expect(result.change24h).toBeCloseTo(10, 6); // 1094.5 vs 995 on the same three contracts
    expect(result.previousValue).toBe(995);
    expect(result.comparedValue).toBe(1094.5);
  });

  it('a new large venue is not read as position growth: compared only on shared contracts, withheld if they are < 90%', () => {
    const previous = obs(dayAgo, base);
    const bigNewVenue = obs(now, [...base, ['OKX', 'BTC-USDT-SWAP', 400]]);
    expect(compareOi24h(bigNewVenue, [previous], now).change24h).toBeNull(); // shared = 1000 of 1400 (71%)
    const smallNewVenue = obs(now, [...base, ['OKX', 'BTC-USDT-SWAP', 20]]);
    expect(compareOi24h(smallNewVenue, [previous], now).change24h).toBe(0); // shared = 1000 of 1020, unchanged
  });

  it('basket total skips coins without a baseline only when the rest hold >= 90% of OI', () => {
    expect(totalOiChange([{ value: 1100, previousValue: 1000, comparedValue: 1100 }, { value: 50, previousValue: null }])).toBeCloseTo(10);
    expect(totalOiChange([{ value: 100, previousValue: null }, { value: 50, previousValue: null }])).toBeNull();
  });

  it('open-interest feed says what is missing instead of the old identical-coverage wording', () => {
    const src = read('lib/crypto/oiHistory.ts');
    expect(src).toContain('oi:observed-usd:v3:');
    expect(src).toContain('covers at least 90% of the current open interest');
  });
});

describe('OV-18 trending freshness and feed notes', () => {
  it('trending prices bypass the stale-while-revalidate data cache', () => {
    expect(read('app/api/crypto/trending/route.ts')).toMatch(/getSimplePrices\(coinIds, \{[^}]*noStore: true/);
    expect(read('lib/coingecko.ts')).toContain("init: options?.noStore ? { cache: 'no-store' } : { next: { revalidate: 30 } }");
  });

  it('names the feed and since when for each blocked input', () => {
    const at = (min: number) => new Date(now - min * 60_000).toISOString();
    const data = {
      market: { marketCapChange24h: -2.7, totalVolume: 1, totalMarketCap: 2, dominance: [{ symbol: 'BTC', dominance: 58 }] },
      marketMeta: { freshnessStatus: 'fresh', lastUpdated: at(1) },
      trending: { coins: [{ change24h: 1 }] }, trendingMeta: { freshnessStatus: 'stale', lastUpdated: at(32) },
      funding: { coins: [{}], average: { fundingRatePercent: 0.007 } }, fundingMeta: { freshnessStatus: 'fresh', lastUpdated: at(1) },
      oi: { total: { change24h: null, altDominance: 21.4 }, comparisonReason: 'No hourly snapshot from 23–25 hours ago yet.' },
      oiMeta: { freshnessStatus: 'fresh', lastUpdated: at(10) },
    };
    expect(cryptoReviewMissing(data)).toEqual(['Breadth freshness stale', 'Comparable open-interest change unavailable']);
    const notes = cryptoReviewFeedNotes(data, now);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatch(/^Breadth \(CoinGecko trending coins and prices\): stale since \d{1,2}:\d{2}/);
    expect(notes[1]).toMatch(/^Comparable open-interest change \(CoinGecko derivatives, top 3 venues\): unavailable\. No hourly snapshot/);
    expect(cryptoReviewFeedNotes(null, now)).toHaveLength(4);
    expect(cryptoReviewFeedNotes(null, now)[0]).toContain('No response from the feed');
  });

  it('the gate card and Crypto Command render the same shared Feed status list', () => {
    const list = read('components/CryptoFeedStatusNotes.tsx');
    expect(list).toContain('cryptoReviewFeedNotes(marketData)');
    expect(list).toContain('aria-label="Feed status"');
    const card = read('components/CryptoMorningDecisionCard.tsx');
    const command = read('app/tools/crypto/page.tsx');
    for (const src of [card, command]) {
      expect(src).toContain("import CryptoFeedStatusNotes from '@/components/CryptoFeedStatusNotes'");
      expect(src).toContain('<CryptoFeedStatusNotes marketData={marketData} />');
    }
    // No second copy of the list markup, and the scanner feed row no longer claims it is still waiting on CoinGecko.
    expect(card).not.toContain('aria-label="Feed status"');
    expect(command).not.toContain('aria-label="Feed status"');
    expect(command).not.toContain('Waiting for CoinGecko response');
  });
});

describe('OV-19 crypto deep-dive labels name their scope and share one risk source', () => {
  const page = read('app/tools/crypto-explorer/page.tsx');
  const card = read('components/CryptoMorningDecisionCard.tsx');
  it('coin volatility is labelled as the coin 24h range; the breakdown says market-wide', () => {
    expect(page).toContain("[`${coinData.coin.symbol.toUpperCase()} 24h range`, decision.volatilityState]");
    expect(page).not.toMatch(/\['Vol', decision\.volatilityState\]/);
    expect(card).toContain('>Market Vol Regime<');
    expect(card).not.toContain('>Volatility Regime<');
  });
  it('strip risk state comes from the same gate as the breakdown; the UPE regime is labelled cross-asset', () => {
    expect(page).toContain("['Crypto risk state', marketGate ? (marketGate.riskState ?? 'Unavailable') : 'Loading']");
    expect(page).toContain("['Global regime (cross-asset)', upeGlobal?.regime || 'Unavailable']");
    // The old chip fell back to a coin-structure tag (bullish price votes -> "Risk-On") presented as the regime.
    expect(page).not.toContain("upeGlobal?.regime || decision.regimeTag");
    expect(card).toContain('>Crypto Risk State<');
    expect(card).toMatch(/CryptoDecisionGate = \{[^}]*riskState\?: string/);
  });
});

describe('crypto deep-dive strip: missing 24h change reads N/A, never "+undefined%"', () => {
  it('guards null/NaN, not just undefined', () => {
    const page = read('app/tools/crypto-explorer/page.tsx');
    expect(page).toContain("['24h', typeof coinData.price_changes['24h'] === 'number' && Number.isFinite(coinData.price_changes['24h'])");
    expect(page).not.toContain("coinData.price_changes['24h'] !== undefined ?");
  });
});

