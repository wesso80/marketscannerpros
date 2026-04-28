import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildMarketDataProviderStatus,
  emitProductionDemoDataAlert,
  isLocalDemoMarketDataAllowed,
} from '../lib/scanner/providerStatus';

const root = process.cwd();

describe('market data provider status metadata', () => {
  it('flags production demo mode as allowed but critical', () => {
    const policy = isLocalDemoMarketDataAllowed({
      nodeEnv: 'production',
      localDemoMarketData: 'true',
    });

    const status = buildMarketDataProviderStatus({
      source: 'local_demo',
      localDemo: true,
      stale: true,
      productionDemoEnabled: policy.productionDemoEnabled,
      warnings: ['demo only'],
    });

    expect(policy.allowed).toBe(true);
    expect(policy.productionDemoEnabled).toBe(true);
    expect(status.alertLevel).toBe('critical');
    expect(status.live).toBe(false);
    expect(status.simulated).toBe(true);
    expect(status.productionDemoEnabled).toBe(true);
  });

  it('does not allow demo mode in production unless explicitly enabled', () => {
    expect(isLocalDemoMarketDataAllowed({ nodeEnv: 'production' })).toEqual({
      allowed: false,
      productionDemoEnabled: false,
    });
  });

  it('emits a structured production demo alert only once per surface/reason', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    emitProductionDemoDataAlert('scanner/run', 'provider unavailable', { symbol: 'AAPL' });
    emitProductionDemoDataAlert('scanner/run', 'provider unavailable', { symbol: 'AAPL' });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe('[market-data] PRODUCTION_DEMO_DATA_ENABLED');
    expect(errorSpy.mock.calls[0][1]).toMatchObject({ surface: 'scanner/run', reason: 'provider unavailable' });

    errorSpy.mockRestore();
  });

  it('wires provider status metadata into scanner and Golden Egg routes', () => {
    for (const file of ['app/api/scanner/run/route.ts', 'app/api/golden-egg/route.ts', 'app/api/cached/scanner/route.ts']) {
      const content = readFileSync(join(root, file), 'utf8');

      expect(content).toContain('buildMarketDataProviderStatus');
      expect(content).toContain('providerStatus');
    }

    const scannerRoute = readFileSync(join(root, 'app/api/scanner/run/route.ts'), 'utf8');
    const goldenEggRoute = readFileSync(join(root, 'app/api/golden-egg/route.ts'), 'utf8');
    expect(scannerRoute).toContain('emitProductionDemoDataAlert');
    expect(goldenEggRoute).toContain('emitProductionDemoDataAlert');
  });
});
