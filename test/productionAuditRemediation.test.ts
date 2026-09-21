import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), 'utf8');

describe('2026-09-21 production audit remediations', () => {
  it('excludes stale commodities from the live analysis gate and exposes source truth', () => {
    const api = read('app/api/commodities/route.ts');
    const page = read('app/tools/commodities/page.tsx');

    expect(api).toContain("freshnessStatus: CommodityFreshness");
    expect(api).toContain("eligibleForGate: freshnessStatus !== 'STALE'");
    expect(api).toContain("const gateCommodities = commodities.filter(c => c.eligibleForGate)");
    expect(api).toContain("staleSymbols");
    expect(api).toContain("sourceAsOf");
    expect(page).toContain("Data degraded — stale rows excluded from analysis");
    expect(page).toContain("Latest eligible source date");
    expect(page).toContain(".filter((item) => item.eligibleForGate)");
  });

  it('keeps CoinGecko news requests within the provider page-size limit', () => {
    const widget = read('components/CryptoNewsWidget.tsx');
    const route = read('app/api/crypto/cg-news/route.ts');

    expect(widget).toContain("per_page: '20'");
    expect(widget).not.toContain("per_page: '25'");
    expect(route).toContain("Math.min(parseInt(searchParams.get('per_page') || '20', 10), 20)");
  });

  it('renders backtest average trade P&L as dollars instead of percentages', () => {
    const hub = read('components/backtest/BacktestHub.tsx');

    expect(hub).toContain('label="Avg Win" value={\`+$\${n(result.avgWin).toFixed(2)}\`}');
    expect(hub).toContain('label="Avg Loss" value={\`$\${n(result.avgLoss).toFixed(2)}\`}');
    expect(hub).not.toContain('label="Avg Win" value={fmtPct(n(result.avgWin))}');
  });

  it('normalizes historical accuracy rows and subtracts losses in expectancy', () => {
    const route = read('app/api/ai/accuracy/route.ts');
    const recorder = read('lib/signalRecorder.ts');

    expect(route).toContain("scanner_type: signal.signal_type");
    expect(route).toContain("created_at: signal.signal_at");
    expect(route).toContain("outcome: latestOutcome?.outcome || 'pending'");
    expect(route).toContain("winPct * avgWin - (1 - winPct) * Math.abs(avgLoss)");
    expect(recorder).toContain("LEFT JOIN LATERAL");
    expect(recorder).toContain("ORDER BY so.horizon_minutes DESC");
  });

  it('never labels an unconfigured live calendar provider as a clear gate', () => {
    const calendar = read('app/tools/economic-calendar/page.tsx');

    expect(calendar).toContain("liveProviderUnavailable = data?.meta?.providerStatus === 'NOT_CONFIGURED'");
    expect(calendar).toContain("let reviewState: ReviewState = liveProviderUnavailable ? 'CAUTION' : 'CLEAR'");
    expect(calendar).toContain("Live calendar provider is not configured");
  });

  it('keeps specialist routes on their real pages and points Macro to the real lens', () => {
    const config = read('next.config.mjs');
    const catalog = read('lib/toolCatalog.ts');

    expect(config).not.toContain("{ source: '/tools/volatility-engine', destination: '/tools/golden-egg'");
    expect(config).not.toContain("{ source: '/tools/liquidity-sweep', destination: '/tools/golden-egg'");
    expect(config).toContain("{ source: '/tools/macro', destination: '/tools/dashboard?tab=macro'");
    expect(catalog).toContain("href: '/tools/dashboard?tab=macro', label: 'Macro Dashboard'");
  });

  it('preserves options deep links instead of resetting them under the default crypto symbol', () => {
    const terminal = read('app/tools/terminal/page.tsx');

    expect(terminal).toContain("const optionsTab = tab === 'Options Terminal' || tab === 'Options Confluence' || tab === 'Options Flow'");
    expect(terminal).toContain("setSymInput('AAPL')");
    expect(terminal).toContain("selectSymbol('AAPL')");
  });

  it('bounds Golden Egg and Alerts provider waits and exposes retryable failure states', () => {
    const api = read('app/v2/_lib/api.ts');
    const goldenEgg = read('app/tools/golden-egg/page.tsx');
    const alerts = read('app/tools/alerts/page.tsx');

    expect(api).toContain("controller.abort(), 20_000");
    expect(api).toContain("Golden Egg timed out after 20 seconds");
    expect(goldenEgg).toContain("goldenEgg.error ? 'Unavailable'");
    expect(goldenEgg).toContain("Retry the selected symbol");
    expect(alerts).toContain("Promise.allSettled");
    expect(alerts).toContain("controller.abort(), 8000");
    expect(alerts).toContain("Partial alert data:");
  });

  it('only promises production-live intelligence modules in paid-plan copy', () => {
    const pricing = read('app/pricing/page.tsx');
    const account = read('app/account/page.tsx');

    expect(pricing).toContain("Production Intelligence — Global M2, Liquidity Transmission and Fragility");
    expect(pricing).toContain("roadmap modules and are not included as live features today");
    expect(account).toContain("Production Intelligence (Global M2, Liquidity Transmission, Fragility)");
    expect(pricing).not.toContain("Full Intelligence suite —");
  });
});
