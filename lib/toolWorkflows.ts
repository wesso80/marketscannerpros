export type ToolTier = 'free' | 'pro' | 'pro_trader';

export type WorkflowTool = {
  href: string;
  label: string;
  description: string;
  tier: ToolTier;
  role: 'primary' | 'advanced' | 'specialist';
};

export type ToolWorkflow = {
  id: 'find' | 'validate' | 'mechanics' | 'test' | 'track' | 'advanced';
  title: string;
  subtitle: string;
  outcome: string;
  tools: WorkflowTool[];
};

export const primaryNavTools = [
  { href: '/tools/dashboard', label: 'Dashboard' },
  { href: '/tools', label: 'Workflow' },
  { href: '/tools/scanner', label: 'Scanner' },
  { href: '/tools/golden-egg', label: 'Golden Egg' },
  { href: '/tools/terminal', label: 'Terminal' },
  { href: '/tools/workspace?tab=backtest', label: 'Backtest' },
  { href: '/tools/workspace?tab=journal', label: 'Journal' },
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
      { href: '/tools/explorer', label: 'Markets', description: 'Macro, sector, breadth, and market-state context.', tier: 'free', role: 'primary' },
      { href: '/tools/explorer?tab=macro', label: 'Macro', description: 'Rates, economic calendar, and broad-risk backdrop.', tier: 'pro', role: 'advanced' },
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
      { href: '/tools/golden-egg', label: 'Deep Analysis', description: 'More detailed symbol research, risks, and evidence checks.', tier: 'pro', role: 'primary' },
      { href: '/tools/terminal?tab=options-flow', label: 'Options Flow', description: 'Large-options-flow estimates and unusual activity context.', tier: 'pro_trader', role: 'advanced' },
    ],
  },
  {
    id: 'mechanics',
    title: '3. Inspect market mechanics',
    subtitle: 'Check timing, options, flow, crypto derivatives, and close-calendar pressure before testing.',
    outcome: 'A mechanics read that explains whether the validated scenario has timing, flow, and positioning support.',
    tools: [
      { href: '/tools/terminal', label: 'Terminal', description: 'Close calendar, options, crypto, flow, and time-confluence checks before backtesting.', tier: 'pro', role: 'primary' },
      { href: '/tools/terminal?tab=options-terminal', label: 'Options Terminal', description: 'Options chain, strikes, spreads, IV, and liquidity context.', tier: 'pro_trader', role: 'advanced' },
      { href: '/tools/terminal?tab=options-confluence', label: 'Options Confluence', description: 'Options positioning and confluence dashboard.', tier: 'pro_trader', role: 'advanced' },
      { href: '/tools/terminal?tab=time-scanner', label: 'Time Scanner', description: 'Time-window and session confluence research.', tier: 'pro_trader', role: 'advanced' },
    ],
  },
  {
    id: 'test',
    title: '4. Test the idea',
    subtitle: 'Check whether similar conditions had useful historical behaviour.',
    outcome: 'A paper/simulation view of the research idea before journaling it.',
    tools: [
      { href: '/tools/workspace?tab=backtest', label: 'Backtest', description: 'Strategy simulation and historical condition testing.', tier: 'pro_trader', role: 'primary' },
      { href: '/tools/signal-accuracy', label: 'Signal Accuracy', description: 'Outcome tracking and historical scanner-quality review.', tier: 'pro_trader', role: 'advanced' },
      { href: '/tools/workspace?tab=backtest', label: 'Scanner Backtest', description: 'Scanner-specific historical scenario testing.', tier: 'pro_trader', role: 'advanced' },
    ],
  },
  {
    id: 'track',
    title: '5. Track and improve',
    subtitle: 'Turn research into a repeatable learning loop.',
    outcome: 'A logged process, performance history, and better future filters.',
    tools: [
      { href: '/tools/workspace?tab=journal', label: 'Journal', description: 'Record decisions, reviews, outcomes, and lessons.', tier: 'free', role: 'primary' },
      { href: '/tools/workspace?tab=portfolio', label: 'Portfolio', description: 'Track positions, exposure, and performance context.', tier: 'pro', role: 'primary' },
      { href: '/tools/workspace', label: 'Workspace', description: 'Command workspace for saved research, plans, and notes.', tier: 'pro', role: 'primary' },
      { href: '/tools/workspace?tab=alerts', label: 'Alerts', description: 'Educational watch alerts for market conditions and levels.', tier: 'pro', role: 'advanced' },
    ],
  },
  {
    id: 'advanced',
    title: 'Advanced research tools',
    subtitle: 'Specialist tools for experienced users after the core workflow is clear.',
    outcome: 'More granular context for options, intraday, crypto, volatility, and market structure.',
    tools: [
      { href: '/tools/scalper', label: 'Scalper', description: 'Intraday 5/15m educational scan surface.', tier: 'pro_trader', role: 'specialist' },
      { href: '/tools/liquidity-sweep', label: 'Liquidity Sweep', description: 'Broad sweep/reclaim scanner for liquidity-zone research.', tier: 'pro_trader', role: 'specialist' },
      { href: '/tools/volatility-engine', label: 'Volatility Engine', description: 'Volatility expansion/compression research.', tier: 'pro_trader', role: 'specialist' },
      { href: '/tools/dashboard?tab=crypto', label: 'Crypto Derivatives', description: 'Crypto derivatives, funding, and open-interest context.', tier: 'pro_trader', role: 'specialist' },
    ],
  },
];

export const secondaryToolLinks = toolWorkflows.flatMap((workflow) => workflow.tools).filter((tool) => tool.role !== 'primary');
