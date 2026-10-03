import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const src = readFileSync('app/api/jobs/scan-universe/route.ts', 'utf8');
const fetchCrypto = src.slice(src.indexOf('async function fetchCryptoData'), src.indexOf('function analyzeAsset'));

it('scan-universe crypto uses Yahoo chart history, not the shared CoinGecko series', () => {
  expect(fetchCrypto).toContain('query1.finance.yahoo.com');
  expect(fetchCrypto).toContain('range=3y');
  expect(fetchCrypto).not.toContain('fetchCryptoSeries');
});
