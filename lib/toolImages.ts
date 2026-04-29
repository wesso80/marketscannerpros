/**
 * Canonical mapping from tool route → PNG image path.
 * Used by Header nav, ToolsPageHeader, and homepage tiles.
 */
export const TOOL_IMAGES: Record<string, string> = {
  // Scanners
  '/tools/scanner': '/assets/scanners/multi-market-scanner.png',
  '/tools/terminal?tab=options-confluence': '/assets/scanners/options-confluence.png',
  '/tools/terminal?tab=time-confluence': '/assets/scanners/time-confluence.png',
  '/tools/golden-egg': '/assets/scanners/golden-egg.png',

  // Platform tools
  '/operator': '/assets/platform-tools/operator-dashboard.png',
  '/tools/explorer': '/assets/platform-tools/markets-dashboard.png',
  '/tools/explorer?tab=crypto-command': '/assets/platform-tools/crypto-command.png',
  '/tools/explorer?tab=movers': '/assets/platform-tools/top-gainers.png',
  '/tools/company-overview': '/assets/platform-tools/company-overview.png',
  '/tools/research': '/assets/platform-tools/news-sentiment.png',
  '/tools/explorer?tab=heatmap': '/assets/platform-tools/sector-heatmap.png',
  '/tools/crypto-heatmap': '/assets/platform-tools/crypto-heatmap.png',
  '/tools/dashboard?tab=crypto': '/assets/platform-tools/crypto-derivatives.png',
  '/tools/explorer?tab=commodities': '/assets/platform-tools/commodities.png',
  '/tools/explorer?tab=macro': '/assets/platform-tools/macro-dashboard.png',
  '/tools/explorer?tab=crypto': '/assets/platform-tools/crypto-explorer.png',
  '/tools/explorer?tab=equity': '/assets/platform-tools/equity-explorer.png',
  '/tools/terminal?tab=options-terminal': '/assets/platform-tools/options-terminal.png',
  '/tools/workspace?tab=alerts': '/assets/platform-tools/alerts.png',
  '/tools/workspace?tab=backtest': '/assets/platform-tools/backtest.png',
  '/tools/workspace?tab=watchlists': '/assets/platform-tools/watchlists.png',
  '/tools/workspace?tab=journal': '/assets/platform-tools/trade-journal.png',
  '/tools/workspace?tab=portfolio': '/assets/platform-tools/portfolio.png',
  '/tools/research?tab=earnings': '/assets/platform-tools/earnings-calendar.png',
  '/tools/research?tab=calendar': '/assets/platform-tools/earnings-calendar.png',
  '/tools/liquidity-sweep': '/assets/platform-tools/liquidity-sweep.png',
  '/tools/terminal?tab=options-flow': '/assets/platform-tools/options-flow.png',
  '/tools/explorer?tab=cross': '/assets/platform-tools/cross-asset-correlation.png',
};

/** Look up the image for a tool href. Returns undefined if no image. */
export function getToolImage(href: string): string | undefined {
  if (TOOL_IMAGES[href]) return TOOL_IMAGES[href];
  const [path, query] = href.split('?');
  if (!query) return TOOL_IMAGES[path];
  const params = new URLSearchParams(query);
  const tab = params.get('tab');
  return tab ? TOOL_IMAGES[`${path}?tab=${tab}`] || TOOL_IMAGES[path] : TOOL_IMAGES[path];
}
