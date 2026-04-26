export type ToolTier = 'free' | 'pro' | 'pro_trader';

export type WorkflowTool = {
  href: string;
  label: string;
  description: string;
  tier: ToolTier;
  role: 'primary' | 'advanced' | 'specialist';
};

export type ToolWorkflow = {
  id: 'find' | 'validate' | 'test' | 'track' | 'advanced';
  title: string;
  subtitle: string;
  outcome: string;
  tools: WorkflowTool[];
};

export const primaryNavTools = [
  { href: '/tools/dashboard', label: 'Dashboard' },
  { href: '/tools', label: 'Tools' },
  { href: '/tools/scanner', label: 'Scanner' },
  { href: '/tools/golden-egg', label: 'Golden Egg' },
  { href: '/tools/backtest', label: 'Backtest' },
  { href: '/tools/journal', label: 'Journal' },
  { href: '/tools/workspace', label: 'Workspace' },
];

export const toolWorkflows: ToolWorkflow[] = [
  {
    id: 'find',
    title: '1. Find market scenarios',
    subtitle: 'Start with broad scans and market context.',
    outcome: 'A short list of symbols or markets worth researching further.',
    tools: [
      { href: '/tools/scanner', label: 'Market Scanner', description: 'Ranked multi-factor scan for educational research scenarios.', tier: 'free', role: 'primary' },
      { href: '/tools/markets', label: 'Markets', description: 'Macro, sector, breadth, and market-state context.', tier: 'free', role: 'primary' },
      { href: '/tools/macro', label: 'Macro', description: 'Rates, economic calendar, and broad-risk backdrop.', tier: 'pro', role: 'advanced' },
      { href: '/tools/crypto-intel', label: 'Crypto Intel', description: 'Crypto market context, narratives, and flows.', tier: 'pro', role: 'specialist' },
    ],
  },
  {
    id: 'validate',
    title: '2. Validate one symbol',
    subtitle: 'Move from a scan result to deeper confluence.',
    outcome: 'A clearer research thesis, risk zones, and invalidation context.',
    tools: [
      { href: '/tools/golden-egg', label: 'Golden Egg', description: 'Single-symbol confluence summary and educational scenario view.', tier: 'pro', role: 'primary' },
      { href: '/tools/deep-analysis', label: 'Deep Analysis', description: 'More detailed symbol research, risks, and evidence checks.', tier: 'pro', role: 'primary' },
      { href: '/tools/options-flow', label: 'Options Flow', description: 'Large-options-flow estimates and unusual activity context.', tier: 'pro_trader', role: 'advanced' },
      { href: '/tools/liquidity-sweep', label: 'Liquidity Sweep', description: 'Sweep/reclaim style context and liquidity-zone research.', tier: 'pro_trader', role: 'advanced' },
    ],
  },
  {
    id: 'test',
    title: '3. Test the idea',
    subtitle: 'Check whether similar conditions had useful historical behaviour.',
    outcome: 'A paper/simulation view of the research idea before journaling it.',
    tools: [
      { href: '/tools/backtest', label: 'Backtest', description: 'Strategy simulation and historical condition testing.', tier: 'pro_trader', role: 'primary' },
      { href: '/tools/signal-accuracy', label: 'Signal Accuracy', description: 'Outcome tracking and historical scanner-quality review.', tier: 'pro_trader', role: 'advanced' },
      { href: '/tools/scanner/backtest', label: 'Scanner Backtest', description: 'Scanner-specific historical scenario testing.', tier: 'pro_trader', role: 'advanced' },
    ],
  },
  {
    id: 'track',
    title: '4. Track and improve',
    subtitle: 'Turn research into a repeatable learning loop.',
    outcome: 'A logged process, performance history, and better future filters.',
    tools: [
      { href: '/tools/journal', label: 'Journal', description: 'Record decisions, reviews, outcomes, and lessons.', tier: 'free', role: 'primary' },
      { href: '/tools/portfolio', label: 'Portfolio', description: 'Track positions, exposure, and performance context.', tier: 'pro', role: 'primary' },
      { href: '/tools/workspace', label: 'Workspace', description: 'Command workspace for saved research, plans, and notes.', tier: 'pro', role: 'primary' },
      { href: '/tools/alerts', label: 'Alerts', description: 'Educational watch alerts for market conditions and levels.', tier: 'pro', role: 'advanced' },
    ],
  },
  {
    id: 'advanced',
    title: 'Advanced research tools',
    subtitle: 'Specialist tools for experienced users after the core workflow is clear.',
    outcome: 'More granular context for options, intraday, crypto, volatility, and market structure.',
    tools: [
      { href: '/tools/options-terminal', label: 'Options Terminal', description: 'Advanced options chain and Greeks research.', tier: 'pro_trader', role: 'specialist' },
      { href: '/tools/options-confluence', label: 'Options Confluence', description: 'Options positioning and confluence dashboard.', tier: 'pro_trader', role: 'specialist' },
      { href: '/tools/scalper', label: 'Scalper', description: 'Intraday 5/15m educational scan surface.', tier: 'pro_trader', role: 'specialist' },
      { href: '/tools/time-scanner', label: 'Time Scanner', description: 'Time-window and session confluence research.', tier: 'pro_trader', role: 'specialist' },
      { href: '/tools/volatility-engine', label: 'Volatility Engine', description: 'Volatility expansion/compression research.', tier: 'pro_trader', role: 'specialist' },
      { href: '/tools/crypto-dashboard', label: 'Crypto Derivatives', description: 'Crypto derivatives, funding, and open-interest context.', tier: 'pro_trader', role: 'specialist' },
    ],
  },
];

export const secondaryToolLinks = toolWorkflows.flatMap((workflow) => workflow.tools).filter((tool) => tool.role !== 'primary');
