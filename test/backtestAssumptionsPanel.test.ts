import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('backtest assumptions panel', () => {
  it('surfaces fill, cost, liquidity, bias, sample, and Monte Carlo assumptions near metrics', () => {
    const metrics = read('components/backtest/PerformanceMetrics.tsx');

    expect(metrics).toContain('BacktestAssumptionsPanel');
    expect(metrics).toContain('Backtest Assumptions');
    expect(metrics).toContain('Fill Model');
    expect(metrics).toContain('Historical bar simulation');
    expect(metrics).toContain('BACKTEST_SLIPPAGE_BPS');
    expect(metrics).toContain('Spread, commissions, exchange fees');
    expect(metrics).toContain('Liquidity');
    expect(metrics).toContain('Survivorship bias');
    expect(metrics).toContain('Sample: {totalTrades} trades');
    expect(metrics).toContain('Deterministic seed');
    expect(metrics).toContain('Past sample behaviour does not predict or guarantee future outcomes');
  });

  it('passes Monte Carlo seed through the performance metrics type', () => {
    const metrics = read('components/backtest/PerformanceMetrics.tsx');
    const engine = read('lib/backtest/engine.ts');

    expect(metrics).toContain('seed?: number');
    expect(metrics).toContain('monteCarlo?.seed');
    expect(engine).toContain('seed: MONTE_CARLO_SEED');
  });

  it('keeps the audit roadmap updated for the assumptions-panel pass', () => {
    const audit = read('docs/market-scanner-pros-elite-audit.md');

    expect(audit).toContain('Backtest assumptions panel');
    expect(audit).toContain('fill model, slippage/spread/commission gaps, liquidity limits, survivorship/regime/overfitting risks, sample size, and Monte Carlo seed');
  });
});

describe('backtest execution assumptions payload', () => {
  it('builds honest execution metadata distinguishing modeled slippage from excluded costs', async () => {
    const { buildBacktestAssumptionsMetadata, BACKTEST_SLIPPAGE_BPS } = await import('../lib/backtest/assumptions');

    const metadata = buildBacktestAssumptionsMetadata({
      strategyId: 'ema_crossover',
      timeframe: 'daily',
      assetType: 'stock',
      totalTrades: 8,
      bars: 90,
      volumeUnavailable: true,
    });

    expect(metadata.version).toBe('backtest_assumptions_v1');
    expect(metadata.costs.slippageApplied).toBe(true);
    expect(metadata.costs.slippageBps).toBe(BACKTEST_SLIPPAGE_BPS);
    expect(metadata.costs.spreadModel).toBe('not_modeled');
    expect(metadata.costs.commissionModel).toBe('not_modeled');
    expect(metadata.liquidity.volumeData).toBe('unavailable');
    expect(metadata.sampleQuality.label).toBe('thin');
    expect(metadata.fillModel.intrabarPriority).toContain('stop is resolved before target');
    expect(metadata.warnings.join(' ')).toContain('Bid/ask spread, commissions');
    expect(metadata.warnings.join(' ')).toContain('survivorship');
  });

  it('wires execution assumptions into the API response and backtest page', () => {
    const route = read('app/api/backtest/route.ts');
    const page = read('app/tools/backtest/page.tsx');
    const api = read('app/v2/_lib/api.ts');

    expect(route).toContain('buildBacktestAssumptionsMetadata');
    expect(route).toContain('executionAssumptions');
    expect(page).toContain('Execution Assumptions');
    expect(page).toContain('results.executionAssumptions.costs.slippageBps');
    expect(api).toContain('executionAssumptions?:');
  });
});
