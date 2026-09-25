import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const proTraderRoutes = [
  'app/api/backtest/route.ts',
  'app/api/backtest/brain/route.ts',
  'app/api/backtest/options/route.ts',
  'app/api/backtest/scanner/route.ts',
  'app/api/backtest/time-scanner/route.ts',
  'app/api/confluence-scan/route.ts',
  'app/api/deep-analysis/route.ts',
  'app/api/dve/route.ts',
  'app/api/evolution/route.ts',
  'app/api/flow/route.ts',
  'app/api/golden-egg/route.ts',
  'app/api/trade-proposal/route.ts',
  'app/api/workflow/decision-packet/route.ts',
  'app/api/workflow/events/route.ts',
  'app/api/workflow/feedback/route.ts',
  'app/api/workflow/tasks/route.ts',
  'app/api/workflow/today/route.ts',
];

function read(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

describe('Pro API gate sweep (shared `hasPaidSessionAccess` — pro, legacy pro_trader and admins pass)', () => {
  it.each(proTraderRoutes)('%s uses the canonical paid-access helper', (path) => {
    const content = read(path);
    const sessionIndex = content.indexOf('getSessionFromCookie');
    const gateIndex = content.indexOf('hasPaidSessionAccess(session)');
    const bodyIndex = content.indexOf('await request.json');

    expect(content).toContain('hasPaidSessionAccess(session)');
    expect(content).not.toContain('hasProTraderAccess(');
    expect(content).toContain('@/lib/proTraderAccess');
    expect(gateIndex).toBeGreaterThan(-1);
    expect(sessionIndex).toBeGreaterThan(-1);
    if (bodyIndex > -1) {
      expect(gateIndex).toBeLessThan(bodyIndex);
    }
  });

  it.each([
    'app/api/options-scan/route.ts',
    'app/api/options-chain/route.ts',
    'app/api/options-flow/route.ts',
  ])('%s gates on the shared options access rule (effective tier + admin) before doing work', (path) => {
    const content = read(path);
    const gateIndex = content.indexOf('await checkOptionsAccess(');
    expect(content).toContain('@/lib/options/access');
    expect(gateIndex).toBeGreaterThan(-1);
    // No literal legacy-tier gate: Pro is the only paid plan sold.
    expect(content).not.toMatch(/tier\s*!==\s*['"]pro_trader['"]/);
    const bodyIndex = content.indexOf('await request.json');
    if (bodyIndex > -1) expect(gateIndex).toBeLessThan(bodyIndex);
  });

  it('documents Volatility Engine as paid-gated in both API and UI helper layers', () => {
    const route = read('app/api/dve/route.ts');
    const helpers = read('lib/useUserTier.ts');

    expect(route).toContain('Pro subscription required for Volatility Engine');
    expect(route).toContain('hasPaidSessionAccess(session)');
    expect(helpers).toContain('canAccessVolatilityEngine');
    // In the simplified pricing model both pro and pro_trader grant access via
    // the shared `isPaid` helper — the literal `tier === "pro_trader"` string
    // is no longer required in the UI helper file.
  });
});
