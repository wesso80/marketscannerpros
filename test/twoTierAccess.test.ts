import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Two access levels only: Free and Pro.
 * - `pro` and the legacy `pro_trader` tier are the same paid plan.
 * - Admins/owners get everything (signed `is_admin` flag or ADMIN_EMAILS match), even with a `free` cookie.
 * - Free / anonymous / cancelled / unknown stay locked out of paid features.
 * Every gate that used to be Pro-Trader-only must now pass for pro, pro_trader and admin, and fail for free.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const originalEnv = { ...process.env };
const ADMIN = 'owner@example.com';

function resetEnv() {
  vi.resetModules();
  process.env = { ...originalEnv };
  delete process.env.FREE_FOR_ALL_MODE;
  delete process.env.FREE_FOR_ALL_UNTIL;
  delete process.env.ALLOW_PROD_ACCESS_BYPASS;
  delete process.env.PRO_TRADER_BYPASS_UNTIL;
  delete process.env.TEMP_PRO_TRADER_BYPASS_UNTIL;
  process.env.ADMIN_EMAILS = ADMIN;
  const g = globalThis as typeof globalThis & { __msp_pro_trader_bypass_logged__?: boolean };
  delete g.__msp_pro_trader_bypass_logged__;
}

type Sess = { workspaceId: string; cid: string; tier: string; is_admin?: boolean; exp: number };
const exp = Math.floor(Date.now() / 1000) + 3600;
const PAID_SESSIONS: Record<string, Sess> = {
  pro: { workspaceId: 'ws-pro', cid: 'cus_pro', tier: 'pro', exp },
  pro_trader: { workspaceId: 'ws-pt', cid: 'cus_pt', tier: 'pro_trader', exp },
  'admin (is_admin flag, free cookie)': { workspaceId: 'ws-admin', cid: 'cus_admin', tier: 'free', is_admin: true, exp },
  'admin (ADMIN_EMAILS cid, free cookie)': { workspaceId: 'ws-admin2', cid: `free_${ADMIN}`, tier: 'free', exp },
};
const UNPAID_SESSIONS: Record<string, Sess> = {
  free: { workspaceId: 'ws-free', cid: 'free_someone@example.com', tier: 'free', exp },
  anonymous: { workspaceId: 'ws-anon', cid: 'anon-123', tier: 'anonymous', exp },
  cancelled: { workspaceId: 'ws-cancel', cid: 'cus_cancel', tier: 'cancelled', exp },
};

beforeEach(() => resetEnv());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

describe('central paid-tier helpers', () => {
  it('isPaidTier: pro and legacy pro_trader pass; everything else fails', async () => {
    const { isPaidTier } = await import('../lib/tiers');
    expect(isPaidTier('pro')).toBe(true);
    expect(isPaidTier('pro_trader')).toBe(true);
    for (const t of ['free', 'anonymous', 'cancelled', 'admin', '', null, undefined, 'PRO_TRADER']) {
      expect(isPaidTier(t as string | null | undefined)).toBe(false);
    }
  });

  it.each(Object.entries(PAID_SESSIONS))('hasPaidSessionAccess passes for %s', async (_label, session) => {
    const { hasPaidSessionAccess } = await import('../lib/proTraderAccess');
    expect(hasPaidSessionAccess(session)).toBe(true);
  });

  it.each(Object.entries(UNPAID_SESSIONS))('hasPaidSessionAccess fails for %s', async (_label, session) => {
    const { hasPaidSessionAccess } = await import('../lib/proTraderAccess');
    expect(hasPaidSessionAccess(session)).toBe(false);
  });

  it('hasPaidSessionAccess fails with no session', async () => {
    const { hasPaidSessionAccess } = await import('../lib/proTraderAccess');
    expect(hasPaidSessionAccess(null)).toBe(false);
    expect(hasPaidSessionAccess(undefined)).toBe(false);
  });

  it('entitlements.hasProAccess and the v2 UpgradeGate helper use the same rule', async () => {
    const { hasProAccess } = await import('../lib/entitlements');
    const { hasPaidTier } = await import('../app/v2/_components/ui');
    for (const [t, want] of [['pro', true], ['pro_trader', true], ['free', false], ['anonymous', false], [null, false]] as const) {
      expect(hasProAccess(t)).toBe(want);
      expect(hasPaidTier(t)).toBe(want);
    }
  });
});

describe('client gates that used to be Pro-Trader-only', () => {
  it('every useUserTier feature helper passes pro + pro_trader and blocks free + anonymous', async () => {
    const t = await import('../lib/useUserTier');
    const gates = {
      scalper: t.canAccessScalper,
      catalystStudies: t.canAccessCatalystStudy,
      timeScanner: t.canAccessTimeScanner,
      confluenceScanner: t.canAccessConfluenceScanner,
      deepAnalysis: t.canAccessDeepAnalysis,
      goldenEgg: t.canAccessGoldenEgg,
      optionsConfluence: t.canAccessOptionsConfluence,
      optionsTerminal: t.canAccessOptionsTerminal,
      volatilityEngine: t.canAccessVolatilityEngine,
      backtest: t.canAccessBacktest,
      journalIntelligence: t.canAccessJournalIntelligence,
      suggestions: t.canAccessSuggestions,
    };
    for (const [name, gate] of Object.entries(gates)) {
      expect({ name, pro: gate('pro'), pro_trader: gate('pro_trader'), free: gate('free'), anonymous: gate('anonymous') })
        .toEqual({ name, pro: true, pro_trader: true, free: false, anonymous: false });
    }
  });

  // Pages/components that compared against 'pro_trader' directly (Pro subscribers were locked out).
  const formerlyProTraderOnly: Array<[string, string, RegExp]> = [
    ['Terminal › Capital Pressure tab', 'app/tools/terminal/page.tsx', /tab === 'Capital Pressure'[\s\S]{0,120}if \(!isPaidTier\(tier\)\)/],
    ['Scalper page', 'app/tools/scalper/page.tsx', /const canAccess = canAccessScalper\(tier\);/],
    ['Signal Accuracy page', 'app/tools/signal-accuracy/page.tsx', /isLoggedIn && !isPaidTier\(tier\)/],
    ['Markets › Catalyst tab', 'components/markets/tabs/CatalystTab.tsx', /if \(!canAccessCatalystStudy\(tier\)\)/],
    ['Smart Alerts (AlertsWidget)', 'components/AlertsWidget.tsx', /isPaidTier\(tier\) \?/],
    ['Correlation coefficients + lead/lag', 'components/CorrelationConfluenceCard.tsx', /const isInstitutional = isPaidTier\(tier\);/],
  ];
  it.each(formerlyProTraderOnly)('%s uses the shared paid check', (_label, file, pattern) => {
    const src = read(file);
    expect(src).toMatch(pattern);
    expect(src).not.toMatch(/[!=]==\s*['"]pro_trader['"]/);
    expect(src).not.toMatch(/Pro Trader/);
  });

  it('no UpgradeGate asks for pro_trader any more', () => {
    for (const f of ['app/tools/terminal/page.tsx', 'app/tools/workspace/page.tsx', 'app/tools/backtest/page.tsx', 'app/tools/golden-egg/page.tsx',
      'app/tools/options-flow/page.tsx', 'app/tools/options-confluence/page.tsx', 'app/tools/deep-analysis/page.tsx', 'app/tools/volatility-engine/page.tsx',
      'app/tools/crypto-terminal/page.tsx', 'app/tools/confluence-scanner/page.tsx', 'app/tools/scanner/backtest/page.tsx',
      'app/tools/crypto-time-confluence/CryptoTimeConfluenceInner.tsx', 'components/backtest/BacktestHub.tsx', 'components/time/TimeScannerPage.tsx', 'app/operator/page.tsx']) {
      expect(read(f)).not.toContain('requiredTier="pro_trader"');
    }
    expect(read('components/UpgradeGate.tsx')).toContain('requiredTier: "pro";');
    expect(read('app/v2/_components/ui.tsx')).toContain("requiredTier: 'pro';");
  });
});

describe('Pro gets the allowances the retired Pro Trader plan had', () => {
  it('watchlist limits: Pro = 100 lists / 500 items, Free unchanged at 3 / 10', async () => {
    const { watchlistLimitsFor } = await import('../lib/tiers');
    expect(watchlistLimitsFor(true)).toEqual({ watchlists: 100, items: 500 });
    expect(watchlistLimitsFor(false)).toEqual({ watchlists: 3, items: 10 });
  });

  it('AI: Pro and legacy pro_trader get the same model and daily limit; Free unchanged', async () => {
    const { AI_MODEL_BY_TIER, AI_DAILY_LIMITS } = await import('../lib/entitlements');
    expect(AI_MODEL_BY_TIER.pro).toBe(AI_MODEL_BY_TIER.pro_trader);
    expect(AI_DAILY_LIMITS.pro).toBe(AI_DAILY_LIMITS.pro_trader);
    expect(AI_MODEL_BY_TIER.free).toBe('gpt-4o-mini');
    expect(AI_DAILY_LIMITS.free).toBe(10);
  });

  it('alert limits: Pro effectively unlimited, Free stays at 3', () => {
    const src = read('app/api/alerts/route.ts');
    expect(src).toMatch(/free: 3,/);
    expect(src).toMatch(/pro: 999,/);
    expect(src).not.toMatch(/pro: 25/);
  });

  it('tool catalog / workflows only know Free and Pro', () => {
    expect(read('lib/toolCatalog.ts')).not.toContain("tier: 'pro_trader'");
    expect(read('lib/toolWorkflows.ts')).toContain("export type ToolTier = 'free' | 'pro';");
  });
});

/* ── Server routes that were Pro-Trader gated ─────────────────────────────────────────────── */

const sessionRef: { current: Sess | null } = { current: null };
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getSessionFromCookie: vi.fn(async () => sessionRef.current) };
});
vi.mock('@/lib/db', () => ({ q: vi.fn(async () => []), tx: vi.fn(async () => undefined), pool: { query: vi.fn(async () => ({ rows: [] })) }, getPool: vi.fn() }));
vi.mock('@/lib/state-machine-store', () => ({
  getLatestStateMachineBySymbol: vi.fn(async () => null),
  listLatestStateMachines: vi.fn(async () => []),
  listStateTransitions: vi.fn(async () => []),
  getLatestStateMachine: vi.fn(async () => null),
  upsertStateMachine: vi.fn(async () => undefined),
}));

type RouteCase = { name: string; mod: string; method: 'GET' | 'POST'; url: string; body?: unknown };
const ROUTES: RouteCase[] = [
  { name: 'State machine', mod: '../app/api/state-machine/route', method: 'GET', url: 'http://x/api/state-machine' },
  { name: 'Workflow today', mod: '../app/api/workflow/today/route', method: 'GET', url: 'http://x/api/workflow/today' },
  { name: 'Workflow tasks', mod: '../app/api/workflow/tasks/route', method: 'GET', url: 'http://x/api/workflow/tasks' },
  { name: 'Workflow feedback', mod: '../app/api/workflow/feedback/route', method: 'POST', url: 'http://x/api/workflow/feedback', body: {} },
  { name: 'Workflow decision packet', mod: '../app/api/workflow/decision-packet/route', method: 'GET', url: 'http://x/api/workflow/decision-packet' },
  { name: 'Evolution (run)', mod: '../app/api/evolution/route', method: 'POST', url: 'http://x/api/evolution', body: {} },
  { name: 'Trade proposal', mod: '../app/api/trade-proposal/route', method: 'POST', url: 'http://x/api/trade-proposal', body: {} },
  { name: 'Backtest symbol range', mod: '../app/api/backtest/symbol-range/route', method: 'GET', url: 'http://x/api/backtest/symbol-range' },
  { name: 'Scalper', mod: '../app/api/scalper/run/route', method: 'POST', url: 'http://x/api/scalper/run', body: {} },
  { name: 'Edge profile', mod: '../app/api/intelligence/edge-profile/route', method: 'GET', url: 'http://x/api/intelligence/edge-profile' },
  { name: 'Company overview', mod: '../app/api/company-overview/route', method: 'GET', url: 'http://x/api/company-overview' },
  { name: 'Low-float scanner', mod: '../app/api/scanner/low-float/route', method: 'GET', url: 'http://x/api/scanner/low-float' },
];

async function callRoute(rc: RouteCase, session: Sess) {
  sessionRef.current = session;
  // No real network from route internals.
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network disabled in test'); }));
  const { NextRequest } = await import('next/server');
  const mod = await import(rc.mod);
  const init: RequestInit = { method: rc.method, headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } };
  if (rc.body !== undefined) init.body = JSON.stringify(rc.body);
  const res: Response = await mod[rc.method](new NextRequest(rc.url, init as never));
  const json = await res.clone().json().catch(() => ({}));
  return { status: res.status, json };
}

describe.each(ROUTES)('$name API route', (rc) => {
  it.each(Object.entries(UNPAID_SESSIONS))('rejects %s with 403', async (_label, session) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { status, json } = await callRoute(rc, session);
    expect(status).toBe(403);
    expect(JSON.stringify(json)).not.toContain('Pro Trader');
  });

  it.each(Object.entries(PAID_SESSIONS))('lets %s past the plan gate', async (_label, session) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { status, json } = await callRoute(rc, session);
    // Past the gate the handler may 200/400/500 on mocked data, but never a plan/auth refusal.
    expect(status).not.toBe(401);
    if (status === 403) expect(JSON.stringify(json)).not.toMatch(/subscription|Pro|plan|upgrade/i);
  });
});

describe('every server route that used a Pro-Trader gate now uses the shared session check', () => {
  const files = [
    'app/api/actions/execute/route.ts', 'app/api/ai/actions/route.ts', 'app/api/backtest/brain/route.ts', 'app/api/backtest/options/route.ts',
    'app/api/backtest/route.ts', 'app/api/backtest/scanner/route.ts', 'app/api/backtest/symbol-range/route.ts', 'app/api/backtest/time-scanner/route.ts',
    'app/api/confluence-scan/route.ts', 'app/api/cross-market-confluence/route.ts', 'app/api/deep-analysis/route.ts', 'app/api/dve/route.ts',
    'app/api/evolution/route.ts', 'app/api/flow/route.ts', 'app/api/golden-egg/route.ts', 'app/api/market-pressure/route.ts', 'app/api/options/gex/route.ts',
    'app/api/state-machine/route.ts', 'app/api/terminal/futures/route.ts', 'app/api/time-gravity-map/route.ts', 'app/api/trade-proposal/route.ts',
    'app/api/workflow/decision-packet/route.ts', 'app/api/workflow/events/route.ts', 'app/api/workflow/feedback/route.ts', 'app/api/workflow/tasks/route.ts',
    'app/api/workflow/today/route.ts', 'app/api/alerts/route.ts', 'app/api/scalper/run/route.ts',
  ];
  it.each(files)('%s', (file) => {
    const src = read(file);
    expect(src).toContain('hasPaidSessionAccess(session)');
    expect(src).not.toMatch(/hasProTraderAccess\(/);
    expect(src).not.toMatch(/[!=]==\s*['"]pro_trader['"]/);
    expect(src).not.toMatch(/Pro Trader/);
  });
});
