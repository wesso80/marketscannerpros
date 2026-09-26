import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { researchHref } from '@/lib/researchContext';
import { detectAssetClass } from '@/lib/goldenEggFetchers';

describe('crypto movers open the coin in Golden Egg', () => {
  it('the bare ticker alone resolves to the stock; ?type=crypto resolves to the coin', () => {
    expect(detectAssetClass('HOOD')).toBe('equity');
    expect(detectAssetClass('HOOD', 'crypto')).toBe('crypto');
    expect(detectAssetClass('HOOD', 'equity')).toBe('equity');
  });

  it('the hand-off URL carries the asset class, like the scanner hand-off', () => {
    expect(researchHref('/tools/golden-egg', 'HOOD', { assetType: 'crypto' })).toBe('/tools/golden-egg?symbol=HOOD&type=crypto');
    expect(researchHref('/tools/golden-egg', 'HOOD', { assetType: 'equity' })).toBe('/tools/golden-egg?symbol=HOOD&type=equity');
  });

  for (const file of ['app/tools/dashboard/page.tsx', 'app/tools/explorer/page.tsx']) {
    it(`${file}: every mover click passes m.asset_class through to navigateTo`, () => {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toMatch(/openGoldenEgg\(m\.ticker\)/);
      expect(src).toMatch(/openGoldenEgg\(m\.ticker, m\.asset_class\)/);
      expect(src).toMatch(/navigateTo\('golden-egg', symbol, selection\)/);
      expect(src).toMatch(/selectSymbol\(symbol, selection\)/);
    });
  }

  it('dashboard keyboard open and the mover queue card use the asset class too', () => {
    const src = readFileSync('app/tools/dashboard/page.tsx', 'utf8');
    expect(src).not.toMatch(/onSymbolRowKey\(e, m\.ticker\)/);
    expect(src).toMatch(/\{proDisplaySymbol\(m\.ticker, m\.asset_class\)\}<\/span>/);
  });
});
