import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('CoinGecko API key resolution (BP-13)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prefers COINGECKO_API_KEY (render.yaml), accepts COINGECKO_PRO_API_KEY, and warns loudly once when neither is set', async () => {
    vi.resetModules();
    const { resolveCoinGeckoApiKey } = await import('@/lib/coingecko');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(resolveCoinGeckoApiKey({ COINGECKO_API_KEY: 'CG-main', COINGECKO_PRO_API_KEY: 'CG-pro' })).toBe('CG-main');
    expect(resolveCoinGeckoApiKey({ COINGECKO_PRO_API_KEY: ' CG-pro ' })).toBe('CG-pro');
    expect(err).not.toHaveBeenCalled();
    expect(resolveCoinGeckoApiKey({})).toBe('');
    expect(resolveCoinGeckoApiKey({})).toBe('');
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toMatch(/neither COINGECKO_API_KEY nor COINGECKO_PRO_API_KEY is set.*keyless PUBLIC/);
  });

  it('uses the Pro URL and header when only COINGECKO_PRO_API_KEY is set', async () => {
    vi.resetModules();
    const saved = { a: process.env.COINGECKO_API_KEY, b: process.env.COINGECKO_PRO_API_KEY };
    delete process.env.COINGECKO_API_KEY;
    process.env.COINGECKO_PRO_API_KEY = 'CG-pro-only';
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ data: { active_cryptocurrencies: 1 } }) }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const cg = await import('@/lib/coingecko');
      await cg.getGlobalData().catch(() => null);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(String(url)).toMatch(/^https:\/\/pro-api\.coingecko\.com\/api\/v3/);
      expect((init.headers as Record<string, string>)['x-cg-pro-api-key']).toBe('CG-pro-only');
    } finally {
      vi.unstubAllGlobals();
      if (saved.a === undefined) delete process.env.COINGECKO_API_KEY; else process.env.COINGECKO_API_KEY = saved.a;
      if (saved.b === undefined) delete process.env.COINGECKO_PRO_API_KEY; else process.env.COINGECKO_PRO_API_KEY = saved.b;
    }
  });
});

describe('CoinGecko attribution (BP-5)', () => {
  it('footer shows "Data provided by CoinGecko" linked to coingecko.com/en/api', () => {
    const footer = readFileSync(resolve(__dirname, '../components/Footer.tsx'), 'utf8');
    expect(footer).toMatch(/<a href="https:\/\/www\.coingecko\.com\/en\/api"[^>]*>\s*Data provided by CoinGecko\s*<\/a>/);
    expect(footer).not.toContain('Market data powered by CoinGecko');
  });

  it('in-app credit component links the same phrase to /en/api', () => {
    const credit = readFileSync(resolve(__dirname, '../components/CoinGeckoCredit.tsx'), 'utf8');
    expect(credit).toContain("COINGECKO_ATTRIBUTION_URL = 'https://www.coingecko.com/en/api'");
    expect(credit).toMatch(/<a href=\{COINGECKO_ATTRIBUTION_URL\}[^>]*>\s*Data provided by CoinGecko\s*<\/a>/);
  });

  // The Footer is hidden on /tools/*, so the credit must also sit on the in-app CoinGecko surfaces.
  it.each([
    'app/tools/crypto-explorer/page.tsx', // Markets > Crypto Deep-Dive
    'app/tools/crypto/page.tsx', // Markets > Crypto Command
    'app/tools/crypto-dashboard/page.tsx', // Dashboard > Crypto Derivatives
    'components/CryptoNewsWidget.tsx', // Markets > Crypto Intel (news)
    'components/PublicTreasuryWidget.tsx', // Markets > Crypto Intel (treasury)
  ])('%s shows the CoinGecko credit', (file) => {
    const src = readFileSync(resolve(__dirname, '..', file), 'utf8');
    expect(src).toContain("import CoinGeckoCredit from '@/components/CoinGeckoCredit';");
    expect(src).toMatch(/<CoinGeckoCredit[\s/>]/);
  });
});
