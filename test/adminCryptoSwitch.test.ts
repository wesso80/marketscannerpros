import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isAdminCryptoEnabled, isCoinGeckoEnabled } from '@/lib/admin/adminCrypto';
import { operatorCgFetchEnabled } from '@/lib/operator/market-data';

afterEach(() => {
  delete process.env.ADMIN_CRYPTO_ENABLED;
  delete process.env.OPERATOR_CG_FETCH_ENABLED;
});

describe('admin crypto switches', () => {
  it('admin crypto is ON by default and only ADMIN_CRYPTO_ENABLED=false/0/no/off turns it off', () => {
    expect(isAdminCryptoEnabled()).toBe(true);
    for (const v of ['false', 'FALSE', '0', 'no', 'off', ' Off ']) {
      process.env.ADMIN_CRYPTO_ENABLED = v;
      expect(isAdminCryptoEnabled()).toBe(false);
    }
    for (const v of ['true', '1', '', 'yes']) {
      process.env.ADMIN_CRYPTO_ENABLED = v;
      expect(isAdminCryptoEnabled()).toBe(true);
    }
  });

  it('CoinGecko is OFF by default, independent of admin crypto; operatorCgFetchEnabled delegates to it', () => {
    expect(isCoinGeckoEnabled()).toBe(false);
    expect(operatorCgFetchEnabled()).toBe(false);
    expect(isAdminCryptoEnabled()).toBe(true); // CG off never switches crypto off
    process.env.OPERATOR_CG_FETCH_ENABLED = 'true';
    expect(isCoinGeckoEnabled()).toBe(true);
    expect(operatorCgFetchEnabled()).toBe(true);
    process.env.ADMIN_CRYPTO_ENABLED = 'false';
    expect(isCoinGeckoEnabled()).toBe(true);
    expect(isAdminCryptoEnabled()).toBe(false);
  });

  it('no admin page, health probe or the shared scan decides "crypto off" from the CoinGecko flag', () => {
    for (const f of ['lib/admin/defaultAdminMarket.ts', 'app/admin/live-scanner/page.tsx', 'app/admin/operator-terminal/page.tsx', 'lib/admin/healthProbes.ts', 'app/api/admin/scanner/live/route.ts', 'app/api/admin/system/health/route.ts', 'app/admin/overview/page.tsx']) {
      expect(readFileSync(f, 'utf8')).not.toContain('operatorCgFetchEnabled');
    }
    const scan = readFileSync('lib/admin/sharedScan.ts', 'utf8');
    expect(scan).toContain('if (market === "CRYPTO" && !isAdminCryptoEnabled())');
    expect(scan).not.toContain('if (market === "CRYPTO" && !operatorCgFetchEnabled())');
  });
});
