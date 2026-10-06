import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { assetExplorerLabel } from '@/lib/presentation/assetExplorerLabel';

it('uses the shared reader labels on the crypto assets tab and the crypto news zones', () => {
  const assets = readFileSync('app/tools/crypto-explorer/page.tsx', 'utf8');
  const markets = readFileSync('app/tools/explorer/page.tsx', 'utf8');
  expect(assets).toContain("assetExplorerLabel('CRCS')");
  expect(assets).toContain("assetExplorerLabel('ΔHr')");
  expect(assets).toContain("assetExplorerLabel('Zone 2 · Action')");
  expect(assets).toContain("assetExplorerLabel('Zone 2 · Context')");
  expect(assets).toContain("assetExplorerLabel('Zone 3 • Informational')");
  expect(assets).not.toContain("['CRCS'");
  expect(assets).not.toContain("['ΔHr'");
  expect(assets).not.toContain('>Zone 2');
  expect(assets).not.toContain('>Zone 3');
  expect(markets).toContain("assetExplorerLabel('Zone 2 • News & Guides')");
  expect(markets).toContain("assetExplorerLabel('Zone 3 • Institutional Treasury Holdings')");
  expect(markets).not.toContain('>Zone 2');
  expect(markets).not.toContain('>Zone 3');
  const newsHeading = markets.slice(markets.indexOf("assetExplorerLabel('Zone 2 • News & Guides')") - 160, markets.indexOf("assetExplorerLabel('Zone 2 • News & Guides')"));
  expect(newsHeading).not.toContain('uppercase');
  expect(assetExplorerLabel('ZONE 2 • NEWS & GUIDES')).toBe('News and guides');
});
