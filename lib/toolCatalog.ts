export interface ToolPage {
  key: string;          // unique identifier, used in DB
  href: string;         // route path
  label: string;        // display name
  description: string;  // short description
  icon: string;         // emoji for quick visual
  category: string;     // grouping
  tier?: 'free' | 'pro' | 'pro_trader';  // minimum tier required (undefined = free)
}

export const TOOL_CATALOG: ToolPage[] = [
  // ─── Markets ───
  { key: 'dashboard',          href: '/tools/dashboard',          label: 'Dashboard',            description: 'Command center with live market overview',         icon: '🏠', category: 'Markets' },
  { key: 'markets',            href: '/tools/markets',            label: 'Market Movers',        description: 'Top gainers, losers and active symbols',           icon: '📊', category: 'Markets' },
  { key: 'heatmap',            href: '/tools/heatmap',            label: 'Heatmap',              description: 'Visual sector and market heatmap',                 icon: '🗺️', category: 'Markets' },
  { key: 'gainers-losers',     href: '/tools/gainers-losers',     label: 'Gainers & Losers',     description: 'Ranked movers by percentage change',               icon: '📈', category: 'Markets' },
  { key: 'news',               href: '/tools/news',               label: 'News Feed',            description: 'Real-time market news with sentiment',             icon: '📰', category: 'Markets' },

  // ─── Scanning ───
  { key: 'scanner',            href: '/tools/scanner',            label: 'Scanner',              description: 'Multi-timeframe technical scanner',                icon: '🔍', category: 'Scanning' },
  { key: 'confluence-scanner', href: '/tools/confluence-scanner', label: 'Confluence Scanner',   description: 'Multi-indicator confluence detection',             icon: '🎯', category: 'Scanning' },
  { key: 'golden-egg',         href: '/tools/golden-egg',         label: 'Golden Egg',           description: 'Deep single-symbol technical analysis',            icon: '🥚', category: 'Scanning' },
  { key: 'time-scanner',       href: '/tools/time-scanner',       label: 'Time Scanner',         description: 'Time-based pattern detection',                     icon: '⏰', category: 'Scanning' },
  { key: 'signal-accuracy',    href: '/tools/signal-accuracy',    label: 'Signal Accuracy',      description: 'Historical signal performance tracking',           icon: '📡', category: 'Scanning' },

  // ─── Crypto ───
  { key: 'crypto',             href: '/tools/crypto',             label: 'Crypto Overview',      description: 'Cryptocurrency market overview',                   icon: '₿', category: 'Crypto' },
  { key: 'crypto-dashboard',   href: '/tools/crypto-dashboard',   label: 'Crypto Derivatives',   description: 'Funding rates, open interest, liquidations',       icon: '📉', category: 'Crypto', tier: 'pro' },
  { key: 'crypto-explorer',    href: '/tools/crypto-explorer',    label: 'Crypto Explorer',      description: 'Explore individual crypto assets',                 icon: '🔎', category: 'Crypto' },
  { key: 'crypto-heatmap',     href: '/tools/crypto-heatmap',     label: 'Crypto Heatmap',       description: 'Visual crypto sector heatmap',                     icon: '🌡️', category: 'Crypto' },
  { key: 'crypto-terminal',    href: '/tools/crypto-terminal',    label: 'Crypto Terminal',      description: 'Full crypto trading terminal',                     icon: '💹', category: 'Crypto', tier: 'pro' },
  { key: 'crypto-time-confluence', href: '/tools/crypto-time-confluence', label: 'Crypto Time Confluence', description: 'Crypto time-based patterns',             icon: '🕐', category: 'Crypto' },
  { key: 'crypto-intel',       href: '/tools/crypto-intel',       label: 'Crypto Intelligence',  description: 'GT Score, whale tracker, treasury & crypto news', icon: '🧠', category: 'Crypto' },

  // ─── Options ───
  { key: 'options',            href: '/tools/options',            label: 'Options',              description: 'Options chain overview',                           icon: '📋', category: 'Options', tier: 'pro' },
  { key: 'options-confluence', href: '/tools/options-confluence', label: 'Options Confluence',   description: 'Options multi-signal confluence',                  icon: '🔗', category: 'Options', tier: 'pro' },
  { key: 'options-flow',       href: '/tools/options-flow',       label: 'Options Flow',         description: 'Unusual options activity tracker',                 icon: '🌊', category: 'Options', tier: 'pro' },
  { key: 'options-terminal',   href: '/tools/options-terminal',   label: 'Options Terminal',     description: 'Full options trading terminal',                    icon: '🖥️', category: 'Options', tier: 'pro' },

  // ─── Research ───
  { key: 'ai-analyst',         href: '/tools/ai-analyst',         label: 'AI Analyst',           description: 'AI-powered market analysis chat',                  icon: '🤖', category: 'Research' },
  { key: 'research',           href: '/tools/research',           label: 'Research',             description: 'In-depth research and economic calendar',          icon: '📚', category: 'Research' },
  { key: 'deep-analysis',      href: '/tools/deep-analysis',      label: 'Deep Analysis',        description: 'Detailed technical + fundamental analysis',        icon: '🔬', category: 'Research' },
  { key: 'terminal',           href: '/tools/terminal',           label: 'Terminal',             description: 'Advanced data terminal interface',                 icon: '⌨️', category: 'Research' },
  { key: 'explorer',           href: '/tools/explorer',           label: 'Explorer',             description: 'Market structure explorer',                        icon: '🧭', category: 'Research' },

  // ─── Macro & Earnings ───
  { key: 'macro',              href: '/tools/macro',              label: 'Macro Dashboard',      description: 'Economic indicators and macro trends',             icon: '🌍', category: 'Macro', tier: 'pro' },
  { key: 'commodities',        href: '/tools/commodities',        label: 'Commodities',          description: 'Commodity prices and trends',                      icon: '🛢️', category: 'Macro' },
  { key: 'earnings',           href: '/tools/earnings',           label: 'Earnings',             description: 'Company earnings data and surprises',              icon: '💰', category: 'Macro' },
  { key: 'earnings-calendar',  href: '/tools/earnings-calendar',  label: 'Earnings Calendar',    description: 'Upcoming earnings release schedule',               icon: '📅', category: 'Macro' },
  { key: 'economic-calendar',  href: '/tools/economic-calendar',  label: 'Economic Calendar',    description: 'Economic events and indicators calendar',          icon: '🗓️', category: 'Macro' },

  // ─── Advanced ───
  { key: 'volatility-engine',  href: '/tools/volatility-engine',  label: 'Volatility Engine',    description: 'Volatility analysis and VIX tracking',             icon: '⚡', category: 'Advanced', tier: 'pro' },
  { key: 'liquidity-sweep',    href: '/tools/liquidity-sweep',    label: 'Liquidity Sweep',      description: 'Detect liquidity grabs and sweeps',                icon: '💧', category: 'Advanced', tier: 'pro' },
  { key: 'command-hub',        href: '/tools/command-hub',        label: 'Command Hub',          description: 'Centralised command and control',                  icon: '🎮', category: 'Advanced' },

  // ─── Portfolio & Journal ───
  { key: 'portfolio',          href: '/tools/portfolio',          label: 'Portfolio',            description: 'Track positions and P&L',                          icon: '💼', category: 'Portfolio' },
  { key: 'journal',            href: '/tools/journal',            label: 'Trade Journal',        description: 'Log and review your trades',                       icon: '📓', category: 'Portfolio', tier: 'pro_trader' },
  { key: 'backtest',           href: '/tools/backtest',           label: 'Backtester',           description: 'Test strategies on historical data',               icon: '🧪', category: 'Portfolio', tier: 'pro_trader' },
  { key: 'alerts',             href: '/tools/alerts',             label: 'Alerts',               description: 'Custom price and condition alerts',                icon: '🔔', category: 'Portfolio' },
  { key: 'watchlists',         href: '/tools/watchlists',         label: 'Watchlists',           description: 'Organise and track symbol lists',                  icon: '⭐', category: 'Portfolio' },
];

export const TOOL_CATEGORIES = [...new Set(TOOL_CATALOG.map(t => t.category))];

export function getToolByKey(key: string): ToolPage | undefined {
  return TOOL_CATALOG.find(t => t.key === key);
}
