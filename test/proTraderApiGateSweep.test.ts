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
  'app/api/options-scan/route.ts',
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

describe('Pro Trader API gate sweep', () => {
  it.each(proTraderRoutes)('%s uses the canonical Pro Trader access helper', (path) => {
    const content = read(path);
    const sessionIndex = content.indexOf('getSessionFromCookie');
    const gateIndex = content.indexOf('hasProTraderAccess');
    const bodyIndex = content.indexOf('await request.json');

    expect(content).toContain('hasProTraderAccess');
    expect(content).toContain('@/lib/proTraderAccess');
    expect(gateIndex).toBeGreaterThan(-1);
    expect(sessionIndex).toBeGreaterThan(-1);
    if (bodyIndex > -1) {
      expect(gateIndex).toBeLessThan(bodyIndex);
    }
  });

  it('documents Volatility Engine as Pro Trader gated in both API and UI helper layers', () => {
    const route = read('app/api/dve/route.ts');
    const helpers = read('lib/useUserTier.ts');

    expect(route).toContain('Pro Trader subscription required for Volatility Engine');
    expect(helpers).toContain('canAccessVolatilityEngine');
    expect(helpers).toContain('tier === "pro_trader"');
  });
});
