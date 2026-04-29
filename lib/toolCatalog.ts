export interface ToolPage {
  key: string;          // unique identifier, used in DB
  href: string;         // route path
  label: string;        // display name
  description: string;  // short description
  icon: string;         // short visual code for quick scanning
  category: string;     // grouping
  tier?: 'free' | 'pro' | 'pro_trader';  // minimum tier required (undefined = free)
}

export const TOOL_CATALOG: ToolPage[] = [
  // ─── Markets ───
  { key: 'dashboard',          href: '/tools/dashboard',          label: 'Dashboard',            description: 'Command center with live market overview',         icon: 'DB', category: 'Markets' },
  { key: 'markets',            href: '/tools/explorer?tab=movers', label: 'Market Movers',       description: 'Top gainers, losers and active symbols',           icon: 'MV', category: 'Markets' },
  { key: 'heatmap',            href: '/tools/explorer?tab=heatmap', label: 'Heatmap',            description: 'Visual sector and market heatmap',                 icon: 'HM', category: 'Markets' },
  { key: 'gainers-losers',     href: '/tools/explorer?tab=movers', label: 'Gainers & Losers',    description: 'Ranked movers by percentage change',               icon: 'GL', category: 'Markets' },
  { key: 'news',               href: '/tools/research',           label: 'News Feed',            description: 'Real-time market news with sentiment',             icon: 'NW', category: 'Markets' },

  // ─── Scanning ───
  { key: 'scanner',            href: '/tools/scanner',            label: 'Scanner',              description: 'Multi-timeframe technical scanner',                icon: 'SC', category: 'Scanning' },
  { key: 'confluence-scanner', href: '/tools/terminal?tab=time-confluence', label: 'Confluence Scanner', description: 'Multi-indicator confluence detection',     icon: 'CF', category: 'Scanning' },
  { key: 'golden-egg',         href: '/tools/golden-egg',         label: 'Golden Egg',           description: 'Deep single-symbol technical analysis',            icon: 'GE', category: 'Scanning' },
  { key: 'time-scanner',       href: '/tools/terminal?tab=time-scanner', label: 'Time Scanner',  description: 'Time-based pattern detection',                     icon: 'TM', category: 'Scanning' },
  { key: 'signal-accuracy',    href: '/tools/signal-accuracy',    label: 'Signal Accuracy',      description: 'Historical signal performance tracking',           icon: 'AC', category: 'Scanning' },

  // ─── Crypto ───
  { key: 'crypto',             href: '/tools/explorer?tab=crypto-command', label: 'Crypto Overview', description: 'Cryptocurrency market overview',               icon: 'CR', category: 'Crypto' },
  { key: 'crypto-dashboard',   href: '/tools/dashboard?tab=crypto', label: 'Crypto Derivatives', description: 'Funding rates, open interest, liquidations',       icon: 'DV', category: 'Crypto', tier: 'pro' },
  { key: 'crypto-explorer',    href: '/tools/explorer?tab=crypto', label: 'Crypto Explorer',     description: 'Explore individual crypto assets',                 icon: 'CE', category: 'Crypto' },
  { key: 'crypto-heatmap',     href: '/tools/crypto-heatmap',     label: 'Crypto Heatmap',       description: 'Visual crypto sector heatmap',                     icon: 'CH', category: 'Crypto' },
  { key: 'crypto-terminal',    href: '/tools/terminal?tab=crypto', label: 'Crypto Terminal',     description: 'Full crypto trading terminal',                     icon: 'CT', category: 'Crypto', tier: 'pro' },
  { key: 'crypto-time-confluence', href: '/tools/terminal?tab=time-confluence', label: 'Crypto Time Confluence', description: 'Crypto time-based patterns', icon: 'TC', category: 'Crypto' },
  { key: 'crypto-intel',       href: '/tools/explorer?tab=crypto-intel', label: 'Crypto Intelligence',  description: 'GT Score, whale tracker, treasury & crypto news (in Markets)', icon: 'CI', category: 'Crypto' },

  // ─── Options ───
  { key: 'options',            href: '/tools/terminal?tab=options-terminal', label: 'Options',   description: 'Options chain overview',                           icon: 'OP', category: 'Options', tier: 'pro' },
  { key: 'options-confluence', href: '/tools/terminal?tab=options-confluence', label: 'Options Confluence', description: 'Options multi-signal confluence',        icon: 'OC', category: 'Options', tier: 'pro' },
  { key: 'options-flow',       href: '/tools/terminal?tab=options-flow', label: 'Options Flow',  description: 'Unusual options activity tracker',                 icon: 'OF', category: 'Options', tier: 'pro' },
  { key: 'options-terminal',   href: '/tools/terminal?tab=options-terminal', label: 'Options Terminal', description: 'Full options trading terminal',              icon: 'OT', category: 'Options', tier: 'pro' },

  // ─── Research ───
  { key: 'ai-analyst',         href: '/tools/scanner',            label: 'ARCA AI Panel',         description: 'AI research support from live scanner context',     icon: 'AI', category: 'Research' },
  { key: 'research',           href: '/tools/research',           label: 'Research',             description: 'In-depth research and economic calendar',          icon: 'RS', category: 'Research' },
  { key: 'deep-analysis',      href: '/tools/golden-egg',         label: 'Deep Analysis',        description: 'Detailed technical + fundamental analysis',        icon: 'DA', category: 'Research' },
  { key: 'terminal',           href: '/tools/terminal',           label: 'Terminal',             description: 'Advanced data terminal interface',                 icon: 'TR', category: 'Research' },
  { key: 'explorer',           href: '/tools/explorer',           label: 'Explorer',             description: 'Market structure explorer',                        icon: 'EX', category: 'Research' },

  // ─── Macro & Earnings ───
  { key: 'macro',              href: '/tools/explorer?tab=macro', label: 'Macro Dashboard',      description: 'Economic indicators and macro trends',             icon: 'MA', category: 'Macro', tier: 'pro' },
  { key: 'commodities',        href: '/tools/explorer?tab=commodities', label: 'Commodities',    description: 'Commodity prices and trends',                      icon: 'CM', category: 'Macro' },
  { key: 'earnings',           href: '/tools/research?tab=earnings', label: 'Earnings',          description: 'Company earnings catalysts in Research',           icon: 'ER', category: 'Macro' },
  { key: 'earnings-calendar',  href: '/tools/research?tab=earnings', label: 'Earnings Calendar', description: 'Upcoming earnings schedule in Research',           icon: 'EC', category: 'Macro' },
  { key: 'economic-calendar',  href: '/tools/research?tab=calendar', label: 'Economic Calendar', description: 'Economic events and indicators calendar',          icon: 'MC', category: 'Macro' },

  // ─── Advanced ───
  { key: 'volatility-engine',  href: '/tools/volatility-engine',  label: 'Volatility Engine',    description: 'Volatility analysis and VIX tracking',             icon: 'VE', category: 'Advanced', tier: 'pro' },
  { key: 'liquidity-sweep',    href: '/tools/liquidity-sweep',    label: 'Liquidity Sweep',      description: 'Detect liquidity grabs and sweeps',                icon: 'LS', category: 'Advanced', tier: 'pro' },
  { key: 'command-hub',        href: '/tools/command-hub',        label: 'Command Hub',          description: 'Centralised command and control',                  icon: 'CH', category: 'Advanced' },

  // ─── Portfolio & Journal ───
  { key: 'portfolio',          href: '/tools/workspace?tab=portfolio', label: 'Portfolio',       description: 'Review positions and exposure in Workspace',       icon: 'PF', category: 'Portfolio' },
  { key: 'journal',            href: '/tools/workspace?tab=journal', label: 'Trade Journal',     description: 'Log and review trades in Workspace',               icon: 'JR', category: 'Portfolio', tier: 'pro_trader' },
  { key: 'backtest',           href: '/tools/workspace?tab=backtest', label: 'Backtester',       description: 'Test strategies inside Workspace',                 icon: 'BT', category: 'Portfolio', tier: 'pro_trader' },
  { key: 'alerts',             href: '/tools/workspace?tab=alerts', label: 'Alerts',             description: 'Manage condition alerts in Workspace',             icon: 'AL', category: 'Portfolio' },
  { key: 'watchlists',         href: '/tools/workspace?tab=watchlists', label: 'Watchlists',      description: 'Organise symbol lists in Workspace',              icon: 'WL', category: 'Portfolio' },
];

export const TOOL_CATEGORIES = [...new Set(TOOL_CATALOG.map(t => t.category))];

export function getToolByKey(key: string): ToolPage | undefined {
  return TOOL_CATALOG.find(t => t.key === key);
}
