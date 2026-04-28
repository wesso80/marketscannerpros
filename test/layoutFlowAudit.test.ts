import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), 'utf8');

describe('layout and flow audit regressions', () => {
  it('keeps private admin routes out of public marketing chrome', () => {
    const routeChrome = read('components/layout/RouteChrome.tsx');

    expect(routeChrome).toContain("pathname.startsWith('/admin')");
    expect(routeChrome).toContain('!isAdminRoute && !isOperatorRoute && !isV2Route && <Header />');
    expect(routeChrome).toContain("pathname.startsWith('/tools') || isAdminRoute || isOperatorRoute");
  });

  it('positions the homepage around workflow and product proof instead of generic hero art', () => {
    const hero = read('components/home/Hero.tsx');
    const commandHub = read('components/home/CommandHub.tsx');
    const workflows = read('lib/toolWorkflows.ts');

    expect(hero).toContain('Educational market intelligence');
    expect(hero).toContain('No brokerage execution. No financial advice.');
    expect(hero).toContain('Open Scanner Preview');
    expect(hero).not.toContain('/logos/landing-hero.png');

    expect(commandHub.indexOf('<Hero />')).toBeLessThan(commandHub.indexOf('Start with the workflow'));
    expect(commandHub.indexOf('Start with the workflow')).toBeLessThan(commandHub.indexOf('<HomePreviewStrip />'));
    expect(workflows).toContain("{ href: '/tools', label: 'Workflow' }");
  });

  it('keeps the Workflow page focused on a guided path with advanced tools collapsed', () => {
    const toolsPage = read('app/tools/page.tsx');
    const workflows = read('lib/toolWorkflows.ts');

    expect(toolsPage).toContain('Your MSP research workflow.');
    expect(toolsPage).toContain('Recommended start');
    expect(toolsPage).toContain('Start here');
    expect(toolsPage).toContain('Recommended next:');
    expect(toolsPage).toContain('inspect market mechanics');
    expect(toolsPage).toContain("mechanics: 'Next: test the research idea in Backtest.'");
    expect(toolsPage).toContain('<details id="advanced"');
    expect(toolsPage).toContain('Specialist tools after the core workflow is clear.');
    expect(workflows.indexOf("{ href: '/tools/golden-egg', label: 'Golden Egg' }")).toBeLessThan(workflows.indexOf("{ href: '/tools/terminal', label: 'Terminal' }"));
    expect(workflows.indexOf("{ href: '/tools/terminal', label: 'Terminal' }")).toBeLessThan(workflows.indexOf("{ href: '/tools/backtest', label: 'Backtest' }"));
    expect(workflows).toContain("id: 'mechanics'");
    expect(workflows).toContain('3. Inspect market mechanics');
    expect(workflows).toContain("{ href: '/tools/terminal', label: 'Terminal', description: 'Close calendar, options, crypto, flow, and time-confluence checks before backtesting.', tier: 'pro', role: 'primary' }");
    expect(toolsPage).not.toContain('rounded-3xl border border-white/10 bg-slate-900/70');
  });

  it('makes Terminal the handoff from Golden Egg to Backtest', () => {
    const terminalPage = read('app/tools/terminal/page.tsx');
    const terminalLayout = read('app/tools/terminal/layout.tsx');

    expect(terminalPage).toContain('Workflow step 3 · Market mechanics check');
    expect(terminalPage).toContain('Use Terminal before Backtest.');
    expect(terminalPage).toContain('Golden Egg validates the symbol. Terminal checks whether timing, options positioning, flow, crypto derivatives, and close-calendar pressure support the scenario before you test it historically.');
    expect(terminalPage).toContain('function TerminalTabRail');
    expect(terminalPage).toContain('Mechanics workbench');
    expect(terminalPage).toContain('Terminal subview');
    expect(terminalPage).toContain('<TerminalSubviewFrame tab="Time Gravity" symbol={sym}>');
    expect(terminalPage).toContain('Back to Golden Egg');
    expect(terminalPage).toContain('Continue to Backtest');
    expect(terminalPage).toContain("href=\"/tools/backtest\"");
    expect(terminalLayout).not.toContain('Trade Terminal');
  });

  it('keeps Time Scanner compact when embedded in Terminal', () => {
    const timeScannerPage = read('app/tools/time-scanner/page.tsx');

    expect(timeScannerPage).toContain('embeddedInTerminal = false');
    expect(timeScannerPage).toContain("propSymbol?.trim().toUpperCase()");
    expect(timeScannerPage).toContain('!embeddedInTerminal && <div className="text-center mb-8">');
    expect(timeScannerPage).toContain("embeddedInTerminal ? 'px-0 py-0' : 'container mx-auto px-4 py-8'");
    expect(timeScannerPage).toContain('!embeddedInTerminal && <div className="max-w-7xl mx-auto mt-12 grid grid-cols-1 lg:grid-cols-3 gap-6">');
  });

  it('treats Scanner as Ranked, Pro, and Analysis views', () => {
    const scannerPage = read('app/tools/scanner/page.tsx');

    expect(scannerPage).toContain("type ScannerStage = ScannerMode | 'analysis'");
    expect(scannerPage).toContain('function ScannerFlowRail');
    expect(scannerPage).toContain("{ id: 'ranked', label: 'Ranked'");
    expect(scannerPage).toContain("{ id: 'pro', label: 'Pro'");
    expect(scannerPage).toContain("{ id: 'analysis', label: 'Analysis'");
    expect(scannerPage).toContain("const activeScannerStage: ScannerStage = selectedSymbol ? 'analysis' : mode");
    expect(scannerPage).toContain('Analysis view');
    expect(scannerPage).toContain("returnLabel={mode === 'ranked' ? 'Back to Ranked' : 'Back to Pro Scanner'}");
  });

  it('treats Golden Egg as a focused validation workbench with Liquidity Sweep separated', () => {
    const goldenEggPage = read('app/tools/golden-egg/page.tsx');
    const goldenEggLayout = read('app/tools/golden-egg/layout.tsx');
    const workflows = read('lib/toolWorkflows.ts');

    expect(goldenEggPage).toContain("const GE_TABS = ['Verdict', 'Chart', 'Deep Analysis', 'Fundamentals'] as const");
    expect(goldenEggPage).toContain('function GoldenEggTabRail');
    expect(goldenEggPage).toContain('function GoldenEggSubviewFrame');
    expect(goldenEggPage).toContain('Golden Egg subview');
    expect(goldenEggPage).toContain('Validation workbench');
    expect(goldenEggPage).toContain('Open Liquidity Sweep');
    expect(goldenEggPage).toContain('Move left to right: verdict, chart, evidence, then fundamentals.');
    expect(goldenEggPage).toContain('Answer first: alignment, data trust, reference, invalidation, and next check.');
    expect(goldenEggPage).toContain('<GoldenEggTabRail activeTab={activeTab} onSelectTab={setActiveTab} />');
    expect(goldenEggPage).not.toContain("activeTab === 'Liquidity'");
    expect(goldenEggPage).not.toContain('Loading Liquidity Sweep');
    expect(goldenEggPage).not.toContain('rounded-t-md whitespace-nowrap transition-colors');
    expect(goldenEggLayout).not.toContain('liquidity');
    expect(workflows).toContain("{ href: '/tools/liquidity-sweep', label: 'Liquidity Sweep', description: 'Broad sweep/reclaim scanner for liquidity-zone research.', tier: 'pro_trader', role: 'specialist' }");
  });

  it('keeps Golden Egg nested pages in embedded validation mode', () => {
    const goldenEggPage = read('app/tools/golden-egg/page.tsx');
    const chartPage = read('app/tools/intraday-charts/page.tsx');
    const fundamentalsPage = read('app/tools/company-overview/page.tsx');

    expect(goldenEggPage).toContain('<GoldenEggSubviewFrame tab="Chart" symbol={sym}>');
    expect(goldenEggPage).toContain('<GoldenEggSubviewFrame tab="Deep Analysis" symbol={sym}>');
    expect(goldenEggPage).toContain('<GoldenEggSubviewFrame tab="Fundamentals" symbol={sym}>');
    expect(chartPage).toContain('Golden Egg Chart Check');
    expect(chartPage).toContain('Validate price action around the Golden Egg scenario levels.');
    expect(chartPage).toContain('{!embeddedInGoldenEgg && (');
    expect(fundamentalsPage).toContain('const embeddedInGoldenEgg = Boolean(propSymbol);');
    expect(fundamentalsPage).toContain('padding: embeddedInGoldenEgg ? "8px 0 0" : "24px 16px"');
  });
});