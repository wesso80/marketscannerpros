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

  // The compact page redesigns (J16-WP2, DVE public evidence) replaced the status strip and freshness badge
  // with one shared SourceLine that states source, observation time and basis.
  it('uses the shared source line on the scanner page', () => {
    const page = read('app/tools/scanner/page.tsx');

    expect(page).toContain("import SourceLine from '@/components/visual/SourceLine'");
    expect(page).toContain('<SourceLine source={');
    expect(page).toContain('basis="Last completed bar"');
    expect(page).not.toContain('function providerStatusLabel');
    expect(page).not.toContain('function providerStatusColor');
  });

  it('uses the shared truth, evidence, and risk components on the Golden Egg page', () => {
    const page = read('app/tools/golden-egg/page.tsx');

    expect(page).toContain("import EvidenceStack from '@/components/market/EvidenceStack'");
    expect(page).toContain("import MarketStatusStrip from '@/components/market/MarketStatusStrip'");
    expect(page).toContain("import RiskFlagPanel");
    expect(page).toContain('buildMarketDataProviderStatus');
    expect(page).toContain('<EvidenceStack title="Symbol Evidence Stack"');
    expect(page).toContain('<MarketStatusStrip friendly items={geMarketStatusItems.map(');
    expect(page).toContain('<RiskFlagPanel title="Research Case Invalidates If"');
    expect(page).not.toContain('geFreshness.map');
  });

  it('uses the shared source line on the Volatility Engine page', () => {
    const page = read('src/features/volatilityEngine/VolatilityEnginePage.tsx');

    expect(page).toContain("import SourceLine from '@/components/visual/SourceLine'");
    expect(page).toContain('<SourceLine source="Volatility calculation" asOf={');
    expect(page).not.toContain('function DataQualityBadge');
  });

  it('shows Options provider warnings and the dated quote source line', () => {
    const page = read('components/options-terminal/OptionsTerminalView.tsx');

    expect(page).toContain('optionsMarketStatusItems.flatMap(item=>item.status?.warnings??[])');
    expect(page).toContain('data-options-status');
    expect(page).toContain('buildMarketDataProviderStatus');
    expect(page).toContain('<SourceLine source={chain.quoteBasis');
  });

  it('uses the shared truth, evidence, and risk components on the admin Morning Brief', () => {
    const page = read('app/admin/morning-brief/page.tsx');

    expect(page).toContain('import EvidenceStack from "@/components/market/EvidenceStack"');
    expect(page).toContain('import MarketStatusStrip from "@/components/market/MarketStatusStrip"');
    expect(page).toContain('import RiskFlagPanel');
    expect(page).toContain('buildMarketDataProviderStatus');
    expect(page).toContain('<EvidenceStack title="Morning Brief Evidence Stack"');
    expect(page).toContain('<RiskFlagPanel title="Morning Brief Risk Flags"');
    expect(page).toContain('<MarketStatusStrip items={statusItems}');
    expect(page).not.toContain('function TruthTile');
  });
});
