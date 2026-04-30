/**
 * Integration-level tests verifying:
 * 1. Expired/cancelled subscriptions lose server-side Pro access
 * 2. Stale market-data surfaces a stale badge (never silently passes as live)
 * 3. LOCAL_DEMO_MARKET_DATA is never treated as real data in production
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildMarketDataProviderStatus,
  isLocalDemoMarketDataAllowed,
} from '../lib/scanner/providerStatus';

const root = process.cwd();
function read(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

// â”€â”€â”€ 1. Expired / cancelled subscription loses Pro Trader access â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('getVerifiedTier: expired subscription â€” static analysis', () => {
  const MIDDLEWARE_FILE = 'lib/apiMiddleware.ts';

  it('downgrades non-active statuses to free in getVerifiedTier', () => {
    const content = read(MIDDLEWARE_FILE);
    // Must contain the canonical check for active/trialing statuses
    expect(content).toContain("status === 'active'");
    expect(content).toContain("status === 'trialing'");
    // Must return free for other statuses
    expect(content).toContain("'free'");
    // The ternary/conditional that enforces the downgrade
    const activeIdx = content.indexOf("status === 'active'");
    const freeIdx = content.indexOf("'free'", activeIdx);
    expect(freeIdx).toBeGreaterThan(activeIdx);
  });

  it('getVerifiedTier caches tier with a TTL to prevent stale cookie bypass', () => {
    const content = read(MIDDLEWARE_FILE);
    expect(content).toContain('tierCache');
    expect(content).toContain('TIER_CACHE_TTL_MS');
    // Cache must be bounded â€” TTL should be at most 10 minutes (600000 ms)
    const ttlMatch = content.match(/TIER_CACHE_TTL_MS\s*=\s*(\d+)/);
    expect(ttlMatch).not.toBeNull();
    expect(Number(ttlMatch![1])).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it('getVerifiedTier queries user_subscriptions table, not just the cookie', () => {
    const content = read(MIDDLEWARE_FILE);
    expect(content).toContain('user_subscriptions');
    expect(content).toContain('workspace_id');
  });

  it('Pro Trader API gate: gated routes call hasProTraderAccess before parsing body', () => {
    const gatedRoutes = [
      'app/api/backtest/route.ts',
      'app/api/golden-egg/route.ts',
      'app/api/dve/route.ts',
    ];

    for (const path of gatedRoutes) {
      const content = read(path);
      expect(content, `${path} must import hasProTraderAccess`).toContain('hasProTraderAccess');
      const gateIdx = content.indexOf('hasProTraderAccess');
      const bodyIdx = content.indexOf('await req.json');
      if (bodyIdx !== -1) {
        expect(gateIdx, `${path}: gate must appear before body parse`).toBeLessThan(bodyIdx);
      }
    }
  });

  it('copilot AI route uses getDailyAiLimit from entitlements (not hardcoded TIER_LIMITS)', () => {
    const content = read('app/api/ai/copilot/route.ts');
    expect(content).toContain('getDailyAiLimit');
    expect(content).not.toContain('TIER_LIMITS');
  });

  it('explain AI route enforces per-user quota before OpenAI cache-miss call', () => {
    const content = read('app/api/ai/explain/route.ts');
    expect(content).toContain('getDailyAiLimit');
    // Quota check must appear before the openai.chat.completions.create call
    const quotaIdx = content.indexOf('getDailyAiLimit');
    const openaiIdx = content.indexOf('openai.chat.completions.create');
    expect(quotaIdx).toBeGreaterThan(-1);
    expect(openaiIdx).toBeGreaterThan(-1);
    expect(quotaIdx).toBeLessThan(openaiIdx);
  });
});

// â”€â”€â”€ 2. Stale provider data surfaces a stale badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('buildMarketDataProviderStatus: stale data badge', () => {
  it('marks status as stale when data is stale', () => {
    const status = buildMarketDataProviderStatus({
      source: 'alpha_vantage',
      localDemo: false,
      stale: true,
      productionDemoEnabled: false,
      warnings: ['data is stale'],
    });

    expect(status.stale).toBe(true);
    expect(status.live).toBe(false);
  });

  it('does not mark status as live when data is stale', () => {
    const status = buildMarketDataProviderStatus({
      source: 'alpha_vantage',
      localDemo: false,
      stale: true,
      productionDemoEnabled: false,
      warnings: [],
    });

    expect(status.live).toBe(false);
    expect(status.stale).toBe(true);
  });

  it('marks status as live only when source is real and not stale', () => {
    const status = buildMarketDataProviderStatus({
      source: 'alpha_vantage',
      localDemo: false,
      stale: false,
      productionDemoEnabled: false,
      warnings: [],
    });

    expect(status.live).toBe(true);
    expect(status.stale).toBe(false);
  });

  it('stale + demo data is never treated as live', () => {
    const status = buildMarketDataProviderStatus({
      source: 'local_demo',
      localDemo: true,
      stale: true,
      productionDemoEnabled: true,
      warnings: [],
    });

    expect(status.live).toBe(false);
    expect(status.simulated).toBe(true);
    expect(status.stale).toBe(true);
  });
});

// â”€â”€â”€ 3. LOCAL_DEMO_MARKET_DATA never appears as real data in production â”€â”€â”€â”€â”€â”€

describe('isLocalDemoMarketDataAllowed: production demo guard', () => {
  it('blocks demo data in production by default', () => {
    const result = isLocalDemoMarketDataAllowed({ nodeEnv: 'production' });
    expect(result.allowed).toBe(false);
    expect(result.productionDemoEnabled).toBe(false);
  });

  it('production demo data is never marked live even when explicitly enabled', () => {
    // Setting LOCAL_DEMO_MARKET_DATA=true in production is an emergency measure â€” data must still be flagged non-live and critical
    const result = isLocalDemoMarketDataAllowed({
      nodeEnv: 'production',
      localDemoMarketData: 'true',
    });
    // Even when the flag allows it, the status must NOT show as live
    const status = buildMarketDataProviderStatus({
      source: 'local_demo',
      localDemo: true,
      stale: true,
      productionDemoEnabled: result.productionDemoEnabled,
      warnings: [],
    });
    expect(status.live).toBe(false);
    expect(status.simulated).toBe(true);
    expect(status.alertLevel).toBe('critical');
  });

  it('allows demo data only in development', () => {
    const result = isLocalDemoMarketDataAllowed({
      nodeEnv: 'development',
      localDemoMarketData: 'true',
    });
    expect(result.allowed).toBe(true);
  });

  it('production scanner routes do not hardcode LOCAL_DEMO_MARKET_DATA=true', () => {
    const routesToCheck = [
      'app/api/scanner/run/route.ts',
      'app/api/golden-egg/route.ts',
      'app/api/jobs/scan-universe/route.ts',
    ];

    for (const path of routesToCheck) {
      const content = read(path);
      expect(
        content,
        `${path} must not hardcode LOCAL_DEMO_MARKET_DATA=true`,
      ).not.toContain("LOCAL_DEMO_MARKET_DATA='true'");
      expect(
        content,
        `${path} must not hardcode LOCAL_DEMO_MARKET_DATA=true`,
      ).not.toContain('LOCAL_DEMO_MARKET_DATA="true"');
    }
  });
});
