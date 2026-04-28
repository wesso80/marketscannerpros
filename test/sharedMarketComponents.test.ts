import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('shared market truth components', () => {
  it('provides reusable status, evidence, and risk components for tool surfaces', () => {
    const statusBadge = read('components/market/DataFreshnessBadge.tsx');
    const marketStrip = read('components/market/MarketStatusStrip.tsx');
    const evidence = read('components/market/EvidenceStack.tsx');
    const risk = read('components/market/RiskFlagPanel.tsx');

    expect(statusBadge).toContain('providerStatusLabel');
    expect(statusBadge).toContain('providerStatusColor');
    expect(statusBadge).toContain('PROD DEMO ALERT');
    expect(marketStrip).toContain('Data Truth');
    expect(marketStrip).toContain('Coverage:');
    expect(evidence).toContain('Evidence Stack');
    expect(evidence).toContain('supportive');
    expect(risk).toContain('Risk Flags');
    expect(risk).toContain('critical');
  });

  it('uses the shared market status strip and freshness badge on the scanner page', () => {
    const page = read('app/tools/scanner/page.tsx');

    expect(page).toContain("import DataFreshnessBadge from '@/components/market/DataFreshnessBadge'");
    expect(page).toContain("import MarketStatusStrip from '@/components/market/MarketStatusStrip'");
    expect(page).toContain('<MarketStatusStrip');
    expect(page).toContain('<DataFreshnessBadge');
    expect(page).not.toContain('function providerStatusLabel');
    expect(page).not.toContain('function providerStatusColor');
  });

  it('uses the shared truth, evidence, and risk components on the Golden Egg page', () => {
    const page = read('app/tools/golden-egg/page.tsx');

    expect(page).toContain("import EvidenceStack from '@/components/market/EvidenceStack'");
    expect(page).toContain("import MarketStatusStrip from '@/components/market/MarketStatusStrip'");
    expect(page).toContain("import RiskFlagPanel");
    expect(page).toContain('buildMarketDataProviderStatus');
    expect(page).toContain('<EvidenceStack title="Golden Egg Evidence Stack"');
    expect(page).toContain('<MarketStatusStrip items={geMarketStatusItems}');
    expect(page).toContain('<RiskFlagPanel title="Research Case Invalidates If"');
    expect(page).not.toContain('geFreshness.map');
  });

  it('uses the shared truth, evidence, and risk components on the Volatility Engine page', () => {
    const page = read('src/features/volatilityEngine/VolatilityEnginePage.tsx');

    expect(page).toContain("import DataFreshnessBadge from '@/components/market/DataFreshnessBadge'");
    expect(page).toContain("import EvidenceStack from '@/components/market/EvidenceStack'");
    expect(page).toContain("import MarketStatusStrip from '@/components/market/MarketStatusStrip'");
    expect(page).toContain("import RiskFlagPanel");
    expect(page).toContain('buildMarketDataProviderStatus');
    expect(page).toContain('<EvidenceStack title="DVE Evidence Stack"');
    expect(page).toContain('<RiskFlagPanel title="DVE Risk Flags"');
    expect(page).toContain('<MarketStatusStrip items={dveMarketStatusItems}');
    expect(page).not.toContain('function DataQualityBadge');
  });

  it('uses the shared truth, evidence, and risk components on the Options Terminal', () => {
    const page = read('components/options-terminal/OptionsTerminalView.tsx');

    expect(page).toContain("import EvidenceStack from '@/components/market/EvidenceStack'");
    expect(page).toContain("import MarketStatusStrip from '@/components/market/MarketStatusStrip'");
    expect(page).toContain("import RiskFlagPanel");
    expect(page).toContain('buildMarketDataProviderStatus');
    expect(page).toContain('<EvidenceStack title="Options Terminal Evidence Stack"');
    expect(page).toContain('<RiskFlagPanel title="Options Terminal Risk Flags"');
    expect(page).toContain('<MarketStatusStrip items={optionsMarketStatusItems}');
  });
});
