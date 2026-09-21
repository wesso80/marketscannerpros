export type ToolTier = 'free' | 'pro' | 'pro_trader';
export type WorkflowTool = { href: string; label: string; description: string; tier: ToolTier; role: 'primary' | 'advanced' | 'specialist' };
export type WorkflowArea = 'overview' | 'scanner' | 'research' | 'backtest' | 'track';
export type ToolWorkflow = { id: 'find' | 'validate' | 'mechanics' | 'test' | 'track' | 'advanced'; title: string; subtitle: string; outcome: string; tools: WorkflowTool[] };

export const primaryNavTools = [
  { id: 'overview', href: '/tools/command-center', label: 'Overview' },
  { id: 'scanner', href: '/tools/scanner', label: 'Scanner' },
  { id: 'research', href: '/tools/golden-egg', label: 'Research' },
  { id: 'backtest', href: '/tools/workspace?tab=backtest', label: 'Backtest' },
  { id: 'track', href: '/tools/workspace?tab=journal', label: 'Track' },
] as const;

export const areaLinks: Record<WorkflowArea, Array<{ href: string; label: string }>> = {
  overview: [
    { href: '/tools/command-center', label: 'Session overview' },
    { href: '/tools/msp-radar', label: 'Daily Radar' },
    { href: '/tools/dashboard', label: 'Market dashboard' },
    { href: '/tools/explorer', label: 'Markets & sectors' },
    { href: '/intelligence', label: 'Macro intelligence' },
  ],
  scanner: [
    { href: '/tools/scanner', label: 'Ranked & custom scans' },
    { href: '/tools/diamond-hunter', label: 'Diamond Hunter' },
    { href: '/tools/liquidity-sweep', label: 'Liquidity sweeps' },
    { href: '/tools/scalper', label: 'Intraday scanner' },
  ],
  research: [
    { href: '/tools/golden-egg', label: 'Symbol analysis' },
    { href: '/tools/terminal', label: 'Charts & mechanics' },
    { href: '/tools/research', label: 'News & calendar' },
    { href: '/tools/crypto-intel', label: 'Crypto intelligence' },
    { href: '/tools/volatility-engine', label: 'Volatility' },
  ],
  backtest: [
    { href: '/tools/workspace?tab=backtest', label: 'Strategy & scanner tests' },
    { href: '/tools/signal-accuracy', label: 'Recorded outcomes' },
  ],
  track: [
    { href: '/tools/workspace?tab=journal', label: 'Journal' },
    { href: '/tools/workspace?tab=portfolio', label: 'Portfolio' },
    { href: '/tools/workspace?tab=watchlists', label: 'Watchlists' },
    { href: '/tools/workspace?tab=alerts', label: 'Alerts' },
    { href: '/tools/workspace?tab=learning', label: 'Learning' },
  ],
};

export function workflowArea(pathname: string, tab = ''): WorkflowArea | null {
  if (pathname.includes('backtest') || pathname.includes('signal-accuracy') || (pathname === '/tools/workspace' && tab === 'backtest')) return 'backtest';
  if (pathname === '/tools/workspace' || /\/(journal|portfolio|watchlist|alerts|learning)(\/|$)/.test(pathname)) return 'track';
  if (/\/(scanner|diamond-hunter|liquidity-sweep|scalper)(\/|$)/.test(pathname)) return 'scanner';
  if (pathname.startsWith('/intelligence') || /\/(command-center|dashboard|msp-radar|explorer|markets)(\/|$)/.test(pathname)) return 'overview';
  if (pathname.startsWith('/tools/') && !/\/(referrals|settings|account)$/.test(pathname)) return 'research';
  return null;
}

const tool = (href: string, label: string, description: string, tier: ToolTier = 'pro', role: WorkflowTool['role'] = 'advanced'): WorkflowTool => ({ href, label, description, tier, role });
export const toolWorkflows: ToolWorkflow[] = [
  { id: 'find', title: '1. Overview', subtitle: 'Understand the session and market backdrop.', outcome: 'A dated market brief and the conditions worth investigating.', tools: [
    tool('/tools/command-center', 'Session overview', 'Regime, risk context and feed status.', 'free', 'primary'),
    tool('/tools/msp-radar', 'Daily Radar', 'Dated briefing with candidates and rejection reasons.'),
    tool('/tools/explorer', 'Markets & sectors', 'Broad equity, crypto and sector context.', 'free'),
    tool('/tools/dashboard?tab=macro', 'Macro dashboard', 'Rates, commodities and economic context.'),
    tool('/intelligence', 'Macro intelligence', 'Global M2, liquidity and fragility with source limitations.'),
  ] },
  { id: 'validate', title: '2. Scanner', subtitle: 'Build a shortlist for a defined universe and timeframe.', outcome: 'Ranked candidates with visible data limitations.', tools: [
    tool('/tools/scanner', 'Ranked & custom scans', 'Rank, filter and inspect research candidates.', 'free', 'primary'),
    tool('/tools/diamond-hunter', 'Diamond Hunter', 'Manual on-chain discovery and validation.', 'free', 'specialist'),
    tool('/tools/liquidity-sweep', 'Liquidity sweeps', 'Sweep and reclaim research.', 'pro', 'specialist'),
    tool('/tools/scalper', 'Intraday scanner', 'Short-timeframe research with freshness checks.', 'pro', 'specialist'),
  ] },
  { id: 'mechanics', title: '3. Research', subtitle: 'Follow one instrument through its supporting evidence.', outcome: 'A research thesis, valid scenario levels and clear limitations.', tools: [
    tool('/tools/golden-egg', 'Symbol analysis · Golden Egg', 'Summary, charts and deep analysis for one instrument.', 'pro', 'primary'),
    tool('/tools/terminal', 'Charts & mechanics · Terminal', 'Options, derivatives, timing and capital pressure in one workspace.'),
    tool('/tools/research', 'News & calendar', 'Source-dated news, events and earnings.'),
    tool('/tools/crypto-intel', 'Crypto intelligence', 'Crypto news and treasury context.'),
    tool('/tools/volatility-engine', 'Volatility', 'Compression, expansion and measured input coverage.', 'pro', 'specialist'),
  ] },
  { id: 'test', title: '4. Backtest', subtitle: 'Test assumptions against reproducible historical data.', outcome: 'Cost-aware results with sample size and validation limits.', tools: [
    tool('/tools/workspace?tab=backtest', 'Strategy & scanner tests', 'Historical simulation with explicit assumptions.', 'pro', 'primary'),
    tool('/tools/signal-accuracy', 'Recorded outcomes', 'Labelled outcomes and pending observations.'),
  ] },
  { id: 'track', title: '5. Track', subtitle: 'Review decisions, positions and outcomes.', outcome: 'A reconciled record for learning and risk review.', tools: [
    tool('/tools/workspace?tab=journal', 'Journal', 'Open and closed records with consistent totals.', 'free', 'primary'),
    tool('/tools/workspace?tab=portfolio', 'Portfolio', 'Positions, exposure and qualified risk statistics.'),
    tool('/tools/workspace?tab=watchlists', 'Watchlists', 'Saved symbols for research.', 'free'),
    tool('/tools/workspace?tab=alerts', 'Alerts', 'Explicit conditions and delivery status.'),
    tool('/tools/workspace?tab=learning', 'Learning', 'Review the process and accumulated evidence.'),
  ] },
];
export const secondaryToolLinks = toolWorkflows.flatMap((workflow) => workflow.tools).filter((entry) => entry.role !== 'primary');
