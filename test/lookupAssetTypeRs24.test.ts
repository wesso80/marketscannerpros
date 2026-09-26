/** RS-24: a symbol typed into the Terminal or Golden Egg lookup gets its asset type from the symbol, not the page. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cryptoPairBase, lookupAssetType } from '@/lib/lookupAssetType';
import { detectMarketPath } from '@/lib/terminal/marketPath';
import { detectAssetClass } from '@/lib/detectAssetClass';

const read = (p: string) => readFileSync(p, 'utf8');

describe('detectMarketPath (Terminal)', () => {
  it('routes USD and stablecoin crypto pairs to the crypto path', () => {
    for (const s of ['BTC-USD', 'ETH-USD', 'btc-usd', 'BTC/USD', 'BTCUSD', 'BTC-USDT', 'ETH/USDC', 'SOLUSDT']) {
      expect(detectMarketPath(s), s).toBe('crypto');
    }
  });
  it('keeps equities, FX majors and futures where they were', () => {
    expect(detectMarketPath('AAPL')).toBe('equity');
    expect(detectMarketPath('BRK-B')).toBe('equity');
    expect(detectMarketPath('EURUSD')).toBe('equity');
    expect(detectMarketPath('/ES')).toBe('futures');
    expect(detectMarketPath('NQ')).toBe('futures');
  });
});

describe('lookupAssetType (Golden Egg)', () => {
  const GE_SET = new Set(['BTC', 'ETH', 'SOL', 'BNB']);
  it('normalises -USD / USDT / USDC pairs to their base', () => {
    expect(cryptoPairBase('BTC-USD')).toBe('BTC');
    expect(cryptoPairBase('eth/usdt')).toBe('ETH');
    expect(cryptoPairBase('SOLUSDC')).toBe('SOL');
    expect(cryptoPairBase('AAPL')).toBe('AAPL');
  });
  it('detects crypto pairs and bare coins, equities stay equity', () => {
    for (const s of ['BTC-USD', 'BTC', 'ETH-USDT', 'BNB/USD', 'KAS-USD', 'ADA-USDT']) expect(lookupAssetType(s, GE_SET), s).toBe('crypto');
    for (const s of ['AAPL', 'MSFT', 'BRK-B', 'NVDA', '']) expect(lookupAssetType(s, GE_SET), s).toBe('equity');
  });
  it('shared detectAssetClass ignores pair separators', () => {
    expect(detectAssetClass('BTC-USDT')).toBe('crypto');
    expect(detectAssetClass('ETH/USDC')).toBe('crypto');
    expect(detectAssetClass('BRK-B')).toBe('equity');
  });
});

describe('lookup handlers use the new symbol, not the current page asset', () => {
  it('Terminal handleSymSubmit detects the market path from the typed symbol', () => {
    const src = read('app/tools/terminal/page.tsx');
    expect(src).toContain('selectSymbol(s, { assetType: detectMarketPath(s) })');
    expect(src).not.toContain('selectSymbol(s, { assetType: marketPath })');
  });
  it('Golden Egg lookup detects from the typed symbol with pair normalisation', () => {
    const src = read('app/tools/golden-egg/page.tsx');
    expect(src).toContain('selectSymbol(next, { timeframe, assetType: lookupAssetType(next, CRYPTO_SET) })');
    expect(src).toContain("const isCryptoSymbol = lookupAssetType(sym, CRYPTO_SET) === 'crypto';");
    expect(src).not.toContain('CRYPTO_SET.has(symbolInput.trim().toUpperCase())');
  });
});
