export type ToolTier = 'free' | 'pro';
export type WorkflowTool = { href: string; label: string; description: string; tier: ToolTier; role: 'primary' | 'advanced' | 'specialist' };
export type WorkflowArea = 'today' | 'scan' | 'markets' | 'intelligence' | 'track' | 'learn' | 'account';
export type ToolWorkflow = { id: 'find' | 'validate' | 'mechanics' | 'test' | 'track' | 'advanced'; title: string; subtitle: string; outcome: string; tools: WorkflowTool[] };
export type NavigationLink = { href: string; label: string };
const link = (href: string, label: string): NavigationLink => ({href, label});
/** One destination map for desktop, phone and the workflow sub-bar. Entitlements stay at the page/API. */
export const areaLinks: Record<WorkflowArea, NavigationLink[]> = {
  today: [link('/tools/command-center','Overview'), link('/tools/msp-radar','Daily Radar'), link('/daily-pick','Daily Picks'), link('/tools','All tools'), link('/tools/start','Free Today')],
  scan: [link('/tools/scanner','Scanner'),link('/tools/golden-egg','Symbol'),link('/tools/options','Options'),link('/tools/terminal','Terminal'),link('/tools/liquidity-sweep','Liquidity Sweep'),link('/tools/scalper','Scalper'),link('/tools/volatility-engine','Volatility'),link('/tools/terminal?tab=time-confluence','Time Confluence'),link('/tools/terminal?tab=time-scanner','Time Scanner'),link('/tools/terminal?tab=crypto-terminal','Crypto Terminal')],
  markets: [link('/tools/explorer','Explorer'),link('/tools/research','Research'),link('/tools/dashboard?tab=macro','Macro'),link('/tools/crypto-dashboard','Crypto Derivatives'),link('/tools/explorer?tab=movers','Market Movers'),link('/tools/explorer?tab=heatmap','Heatmap'),link('/tools/explorer?tab=commodities','Commodities'),link('/tools/explorer?tab=crypto-command','Crypto Overview'),link('/tools/explorer?tab=crypto-command&section=heatmap','Crypto Heatmap'),link('/tools/explorer?tab=crypto-intel','Crypto Intelligence'),link('/tools/research?tab=earnings','Earnings'),link('/tools/research?tab=calendar','Economic Calendar')],
  intelligence: [link('/intelligence','Overview'),link('/intelligence/global-m2','Global M2'),link('/intelligence/fragility','Fragility'),link('/intelligence/liquidity','Liquidity')],
  track: [link('/tools/workspace?tab=journal','Journal'),link('/tools/workspace?tab=portfolio','Portfolio'),link('/tools/workspace?tab=watchlists','Watchlists'),link('/tools/workspace?tab=alerts','Alerts'),link('/tools/workspace?tab=backtest','Backtest'),link('/tools/workspace?tab=learning','Learning'),link('/tools/workspace?tab=settings','Settings'),link('/tools/signal-accuracy','Signal Accuracy'),link('/tools/dashboard?tab=pages','My Pages')],
  learn: [link('/guide','Guide'),link('/methodology','Methodology'),link('/blog','Blog'),link('/about','About'),link('/contact','Contact'),link('/partners','Partners'),link('/guide/open-interest','Open Interest Guide'),link('/','Home')],
  account: [link('/account','Account'),link('/auth','Sign In'),link('/pricing','Pricing'),link('/tools/referrals','Referrals'),link('/compliance-hub','Compliance Hub'),link('/privacy','Privacy'),link('/terms','Terms'),link('/cookie-policy','Cookies'),link('/refund-policy','Refund policy'),link('/disclaimer','Disclaimer')],
};
export const primaryNavTools = [
  {id:'today',href:'/tools/command-center',label:'Today'},
  {id:'scan',href:'/tools/scanner',label:'Scan & Analyse'},
  {id:'markets',href:'/tools/explorer',label:'Markets'},
  {id:'intelligence',href:'/intelligence',label:'Intelligence'},
  {id:'track',href:'/tools/workspace?tab=journal',label:'Track'},
  {id:'learn',href:'/guide',label:'Learn'},
  {id:'account',href:'/account',label:'Account'},
] as const;
export function workflowArea(pathname: string, tab = ''): WorkflowArea | null {
  const selected = tab.toLowerCase();
  if (pathname.startsWith('/admin') || pathname.startsWith('/operator')) return null;
  if (pathname.startsWith('/intelligence')) return 'intelligence';
  if (pathname === '/tools/dashboard') return selected === 'macro' ? 'markets' : selected === 'command' ? 'today' : 'track';
  if (pathname === '/tools/workspace' || /\/(journal|portfolio|watchlists|alerts|backtest|learning|settings|signal-accuracy)(\/|$)/.test(pathname)) return 'track';
  if (/^\/(guide|methodology|blog|about|contact|partners|resources)(\/|$)/.test(pathname)) return 'learn';
  if (/^\/(account|pricing|auth|compliance-hub|privacy|terms|cookie-policy|refund-policy|disclaimer|legal)(\/|$)/.test(pathname) || pathname === '/tools/referrals') return 'account';
  if (pathname === '/tools' || /\/(command-center|msp-radar|daily-pick|start)(\/|$)/.test(pathname)) return 'today';
  if (/\/(explorer|research|macro|crypto-dashboard|crypto-intel|markets|market-movers|gainers-losers|heatmap|commodities)(\/|$)/.test(pathname)) return 'markets';
  if (/\/(scanner|golden-egg|options|terminal|liquidity-sweep|scalper|volatility-engine)(\/|$)/.test(pathname)) return 'scan';
  return null;
}
export function isNavigationLinkActive(href: string, pathname: string, tab = '', section = '') {
  const [path, query = ''] = href.split('?');
  if (path !== pathname) return false;
  const params = new URLSearchParams(query);
  const expectedTab = params.get('tab');
  const actual = tab.toLowerCase() || (pathname === '/tools/workspace' ? 'journal' : pathname === '/tools/dashboard' ? 'command' : '');
  if (expectedTab) return expectedTab === actual && (params.get('section') ?? '') === section;
  // The parent page is current only when no named tab destination matches.
  return !Object.values(areaLinks).flat().some(item => {
    const [candidate, search = ''] = item.href.split('?');
    const named = new URLSearchParams(search);
    return candidate === pathname && named.has('tab') && named.get('tab') === actual;
  });
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
