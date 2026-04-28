import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

function resetAccessEnv() {
  vi.resetModules();
  process.env = { ...originalEnv };
  delete process.env.FREE_FOR_ALL_MODE;
  delete process.env.ALLOW_PROD_ACCESS_BYPASS;
  delete process.env.PRO_TRADER_BYPASS_UNTIL;
  delete process.env.TEMP_PRO_TRADER_BYPASS_UNTIL;
  delete process.env.RENDER_SERVICE_NAME;
  delete process.env.RENDER_EXTERNAL_URL;
  const globalState = globalThis as typeof globalThis & { __msp_pro_trader_bypass_logged__?: boolean };
  delete globalState.__msp_pro_trader_bypass_logged__;
}

describe('tier and role access helpers', () => {
  beforeEach(() => {
    resetAccessEnv();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('normalizes unknown tiers down to free and keeps canonical AI limits', async () => {
    const { getDailyAiLimit, hasProAccess, normalizeTier } = await import('../lib/entitlements');

    expect(normalizeTier('pro_trader')).toBe('pro_trader');
    expect(normalizeTier('pro')).toBe('pro');
    expect(normalizeTier('enterprise')).toBe('free');
    expect(normalizeTier(null)).toBe('free');
    expect(getDailyAiLimit(undefined)).toBe(10);
    expect(getDailyAiLimit('free')).toBe(10);
    expect(getDailyAiLimit('pro')).toBe(50);
    expect(getDailyAiLimit('pro_trader')).toBe(50);
    expect(hasProAccess('free')).toBe(false);
    expect(hasProAccess('pro')).toBe(true);
    expect(hasProAccess('pro_trader')).toBe(true);
  });

  it('keeps Pro Trader-only UI helpers strict while allowing intended free scanner access', async () => {
    const tierHelpers = await import('../lib/useUserTier');

    for (const tier of ['anonymous', 'free', 'pro'] as const) {
      expect(tierHelpers.canAccessBacktest(tier)).toBe(false);
      expect(tierHelpers.canAccessOptionsTerminal(tier)).toBe(false);
      expect(tierHelpers.canAccessTimeScanner(tier)).toBe(false);
      expect(tierHelpers.canAccessGoldenEgg(tier)).toBe(false);
      expect(tierHelpers.canAccessVolatilityEngine(tier)).toBe(false);
      expect(tierHelpers.canAccessScanner(tier)).toBe(true);
    }

    expect(tierHelpers.canAccessBacktest('pro_trader')).toBe(true);
    expect(tierHelpers.canAccessOptionsTerminal('pro_trader')).toBe(true);
    expect(tierHelpers.canAccessTimeScanner('pro_trader')).toBe(true);
    expect(tierHelpers.canAccessGoldenEgg('pro_trader')).toBe(true);
    expect(tierHelpers.canAccessVolatilityEngine('pro_trader')).toBe(true);
    expect(tierHelpers.getPortfolioLimit('anonymous')).toBe(3);
    expect(tierHelpers.getPortfolioLimit('free')).toBe(3);
    expect(tierHelpers.getPortfolioLimit('pro')).toBe(Infinity);
  });

  it('ignores FREE_FOR_ALL_MODE in production unless production bypasses are explicitly allowed', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.NODE_ENV = 'production';
    process.env.FREE_FOR_ALL_MODE = 'true';

    const blocked = await import('../lib/entitlements');
    expect(blocked.isProductionRuntime()).toBe(true);
    expect(blocked.isProductionAccessBypassAllowed()).toBe(false);
    expect(blocked.isFreeForAllMode()).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('[access] FREE_FOR_ALL_MODE ignored in production because ALLOW_PROD_ACCESS_BYPASS is not true');

    resetAccessEnv();
    process.env.NODE_ENV = 'production';
    process.env.FREE_FOR_ALL_MODE = 'true';
    process.env.ALLOW_PROD_ACCESS_BYPASS = 'true';
    const allowed = await import('../lib/entitlements');

    expect(allowed.isProductionRuntime()).toBe(true);
    expect(allowed.isProductionAccessBypassAllowed()).toBe(true);
    expect(allowed.isFreeForAllMode()).toBe(true);
  });

  it('keeps temporary Pro Trader bypasses time-bound and production-guarded', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.NODE_ENV = 'development';
    process.env.PRO_TRADER_BYPASS_UNTIL = '2026-05-01T00:00:00.000Z';

    const developmentBypass = await import('../lib/proTraderAccess');
    expect(developmentBypass.hasProTraderAccess('free')).toBe(true);
    expect(developmentBypass.isTemporaryProTraderBypassActive(Date.parse('2026-05-02T00:00:00.000Z'))).toBe(false);
    expect(logSpy.mock.calls.some((call) => String(call[0]).includes('Temporary Pro Trader bypass ACTIVE'))).toBe(true);

    resetAccessEnv();
    process.env.NODE_ENV = 'production';
    process.env.PRO_TRADER_BYPASS_UNTIL = '2026-05-01T00:00:00.000Z';
    const productionBypass = await import('../lib/proTraderAccess');

    expect(productionBypass.hasProTraderAccess('free')).toBe(false);
    expect(productionBypass.hasProTraderAccess('pro_trader')).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith('[access] Temporary Pro Trader bypass ignored in production because ALLOW_PROD_ACCESS_BYPASS is not true');
  });
});