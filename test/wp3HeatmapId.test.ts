import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('asks CoinGecko for the renamed POL id', () => {
  const src = readFileSync('app/api/crypto/heatmap/route.ts', 'utf8');
  expect(src).toContain("'polygon-ecosystem-token'");
  expect(src).not.toContain('matic-network');
});
