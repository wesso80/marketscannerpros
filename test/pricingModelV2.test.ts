import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const originalEnv = { ...process.env };

function resetEnv() {
  vi.resetModules();
  process.env = { ...originalEnv };
  delete process.env.FREE_FOR_ALL_MODE;
  delete process.env.FREE_FOR_ALL_UNTIL;
  delete process.env.ALLOW_PROD_ACCESS_BYPASS;
  delete process.env.PRO_TRADER_BYPASS_UNTIL;
  delete process.env.TEMP_PRO_TRADER_BYPASS_UNTIL;
  const g = globalThis as typeof globalThis & { __msp_pro_trader_bypass_logged__?: boolean };
  delete g.__msp_pro_trader_bypass_logged__;
}

describe('2026 pricing simplification — single Pro plan', () => {
  beforeEach(() => resetEnv());
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('Pro price constants are $24.99 / $249', async () => {
    const { PLAN_PRICES } = await import('../lib/planPrices');
    expect(PLAN_PRICES.pro.monthly).toBe('$24.99');
    expect(PLAN_PRICES.pro.yearly).toBe('$249');
    expect(PLAN_PRICES.pro.monthlyRaw).toBe(24.99);
    expect(PLAN_PRICES.pro.yearlyRaw).toBe(249);
    // Legacy pro_trader entry is retained but points at the same Pro numbers.
    expect(PLAN_PRICES.pro_trader.monthlyRaw).toBe(24.99);
    expect(PLAN_PRICES.pro_trader.yearlyRaw).toBe(249);
  });

  it('hasProAccess grants access to legacy pro_trader, new pro, and denies free', async () => {
    const { hasProAccess } = await import('../lib/entitlements');
    expect(hasProAccess('free')).toBe(false);
    expect(hasProAccess(null)).toBe(false);
    expect(hasProAccess(undefined)).toBe(false);
    expect(hasProAccess('pro')).toBe(true);
    expect(hasProAccess('pro_trader')).toBe(true);
  });

  it('hasProTraderAccess (legacy helper) now returns true for both `pro` and `pro_trader`', async () => {
    // No bypass envs — real subscribers only.
    const { hasProTraderAccess } = await import('../lib/proTraderAccess');
    expect(hasProTraderAccess('free')).toBe(false);
    expect(hasProTraderAccess(null)).toBe(false);
    expect(hasProTraderAccess('pro')).toBe(true);
    expect(hasProTraderAccess('pro_trader')).toBe(true);
  });

  it('every feature gate that used to require `pro_trader` now accepts `pro` too', async () => {
    const t = await import('../lib/useUserTier');
    const features = [
      t.canAccessBacktest,
      t.canAccessBrain,
      t.canAccessGoldenEgg,
      t.canAccessDeepAnalysis,
      t.canAccessOptionsTerminal,
      t.canAccessOptionsConfluence,
      t.canAccessTimeScanner,
      t.canAccessConfluenceScanner,
      t.canAccessVolatilityEngine,
      t.canAccessScalper,
      t.canAccessJournalIntelligence,
      t.canAccessCatalystStudy,
      t.canExportCSV,
    ];
    for (const gate of features) {
      expect(gate('free')).toBe(false);
      expect(gate('anonymous')).toBe(false);
      expect(gate('pro')).toBe(true);
      expect(gate('pro_trader')).toBe(true);
    }
  });

  it('free users are blocked from paid API routes once the promo bypass is off', async () => {
    // FREE_FOR_ALL_MODE off ⇒ hasProTraderAccess returns false for free.
    process.env.FREE_FOR_ALL_MODE = 'false';
    const { hasProTraderAccess } = await import('../lib/proTraderAccess');
    expect(hasProTraderAccess('free')).toBe(false);
    expect(hasProTraderAccess('anonymous')).toBe(false);
  });

  it('promo bypass still grants full paid access to everyone while active', async () => {
    process.env.FREE_FOR_ALL_MODE = 'true';
    const { hasProTraderAccess } = await import('../lib/proTraderAccess');
    // Non-production runtime — bypass is honored.
    expect(hasProTraderAccess('free')).toBe(true);
    expect(hasProTraderAccess(null)).toBe(true);
  });

  it('checkout endpoint accepts only `plan: "pro"` and points at the live $24.99 price IDs', () => {
    const src = read('app/api/payments/checkout/route.ts');
    // Only the Pro plan is sold.
    expect(src).toContain("plan !== 'pro'");
    // New canonical env-var names take precedence.
    expect(src).toContain('STRIPE_PRO_MONTHLY_PRICE_ID');
    expect(src).toContain('STRIPE_PRO_ANNUAL_PRICE_ID');
    // Operator repriced STRIPE_PRICE_PRO_TRADER_* to the new $24.99 Pro plan,
    // so those are the live fallback source of truth in checkout today.
    expect(src).toContain('STRIPE_PRICE_PRO_TRADER_MONTHLY');
    expect(src).toContain('STRIPE_PRICE_PRO_TRADER_YEARLY');
    // Old Pro price IDs remain as last-resort fallback (dormant in Stripe).
    expect(src).toContain('STRIPE_PRICE_PRO_MONTHLY');
    expect(src).toContain('STRIPE_PRICE_PRO_YEARLY');
    // Route no longer distinguishes plan keys called "pro_trader_*".
    expect(src).not.toContain('pro_trader_monthly');
    expect(src).not.toContain('pro_trader_yearly');
  });

  it('webhook maps new AND legacy price IDs to a paid tier (pro_trader label preserved for legacy)', () => {
    const src = read('app/api/webhooks/stripe/route.ts');
    expect(src).toContain('STRIPE_PRO_MONTHLY_PRICE_ID');
    expect(src).toContain('STRIPE_PRO_ANNUAL_PRICE_ID');
    expect(src).toContain('STRIPE_PRICE_PRO_MONTHLY');
    expect(src).toContain('STRIPE_PRICE_PRO_YEARLY');
    expect(src).toContain('STRIPE_PRICE_PRO_TRADER_MONTHLY');
    expect(src).toContain('STRIPE_PRICE_PRO_TRADER_YEARLY');
  });

  it('pricing page renders only Free and Pro (no Pro Trader card, no third tier)', () => {
    const src = read('app/pricing/page.tsx');
    // Two-plan model only.
    expect(src).toContain('type PlanId = "free" | "pro";');
    // Copy specified by the migration brief.
    expect(src).toContain('Start Free');
    expect(src).toContain('Go Pro');
    expect(src).toContain('Current Plan');
    expect(src).toContain('Explore the platform and see how MarketScannerPros analyses market conditions.');
    expect(src).toContain('Full access to MarketScannerPros');
    // The old third tier must not appear as a customer-facing plan.
    expect(src).not.toMatch(/name:\s*"Pro Trader"/);
    expect(src).not.toMatch(/id:\s*"pro_trader"/);
  });

  it('pricing metadata copy no longer advertises three tiers or $25/$50', () => {
    const src = read('app/pricing/layout.tsx');
    expect(src).not.toContain('$25/mo');
    expect(src).not.toContain('$50/mo');
    expect(src).not.toContain('Pro Trader');
    expect(src).toContain('$24.99');
    expect(src).toContain('$249');
  });

  it('shared plan-price display treats legacy pro_trader as Pro', async () => {
    const { PLAN_PRICES } = await import('../lib/planPrices');
    expect(PLAN_PRICES.pro_trader.monthly).toBe(PLAN_PRICES.pro.monthly);
    expect(PLAN_PRICES.pro_trader.yearly).toBe(PLAN_PRICES.pro.yearly);
  });

  it('UpgradeGate label is always "Pro" regardless of requiredTier prop', () => {
    const src = read('components/UpgradeGate.tsx');
    // Component collapses both requiredTier options into a single Pro CTA.
    expect(src).toContain('const tierName = "Pro"');
    expect(src).not.toContain('Pro Trader');
  });

  it('TierBadge maps legacy pro_trader tier to a Pro-labelled badge', () => {
    const src = read('components/ui/TierBadge.tsx');
    // Both entries render the label "Pro" so no user ever sees "Pro Trader".
    const proTraderBlock = src.slice(src.indexOf('pro_trader:'), src.indexOf('pro:'));
    expect(proTraderBlock).toContain("label: 'Pro'");
  });
});
