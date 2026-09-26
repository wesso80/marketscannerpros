import { describe, expect, it } from 'vitest';
import { selectBestSearchMatch } from '@/lib/coingecko';
import { findCryptoAliases } from '@/lib/scanner/cryptoAliases';

// Shapes as returned by CoinGecko /search (fuzzy: matches inside names/tickers).
const uniswap = { id: 'uniswap', name: 'Uniswap', symbol: 'UNI', market_cap_rank: 30 };
const hedera = { id: 'hedera-hashgraph', name: 'Hedera', symbol: 'HBAR', market_cap_rank: 22 };
const apecoin = { id: 'apecoin', name: 'ApeCoin', symbol: 'APE', market_cap_rank: 150 };

describe('selectBestSearchMatch (SC-12: no fuzzy ticker resolution)', () => {
  it('a partial ticker no longer resolves to the biggest fuzzy match', () => {
    expect(selectBestSearchMatch('AP', [uniswap, apecoin])).toBeNull(); // was 'uniswap' -> phantom AP row with UNI's data
    expect(selectBestSearchMatch('HB', [hedera])).toBeNull(); // was 'hedera-hashgraph' -> phantom HB row
    expect(selectBestSearchMatch('MG', [{ id: 'magic', name: 'Magic', symbol: 'MAGIC', market_cap_rank: 300 }])).toBeNull();
  });
  it('exact tickers and exact names still resolve; the biggest coin wins a shared ticker', () => {
    expect(selectBestSearchMatch('UNI', [apecoin, uniswap])).toBe('uniswap');
    expect(selectBestSearchMatch('HBARUSD', [hedera])).toBe('hedera-hashgraph');
    expect(selectBestSearchMatch('bitcoin', [{ id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', market_cap_rank: 1 }])).toBe('bitcoin');
    expect(selectBestSearchMatch('UNI', [{ id: 'uni-clone', name: 'Uni Clone', symbol: 'UNI', market_cap_rank: 4000 }, uniswap])).toBe('uniswap');
  });
});

describe('findCryptoAliases', () => {
  it('keeps one symbol per coin and names the others as duplicates', () => {
    const aliases = findCryptoAliases([
      { symbol: 'AP', coinId: 'uniswap' }, { symbol: 'UNI', coinId: 'uniswap' },
      { symbol: 'HBAR', coinId: 'hedera-hashgraph' }, { symbol: 'HB', coinId: 'hedera-hashgraph' },
      { symbol: 'SOLUSD', coinId: 'solana' }, { symbol: 'SOL', coinId: 'solana' },
      { symbol: 'BTC', coinId: 'bitcoin' }, { symbol: 'MG', coinId: null },
    ], { UNI: 'uniswap', HBAR: 'hedera-hashgraph', SOL: 'solana', BTC: 'bitcoin' });
    expect(Object.fromEntries(aliases)).toEqual({ AP: 'UNI', HB: 'HBAR', SOLUSD: 'SOL' });
  });
});
