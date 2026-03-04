/**
 * Canonical mapping from tool route → PNG image path.
 * Used by Header nav, ToolsPageHeader, and homepage tiles.
 */
export const TOOL_IMAGES: Record<string, string> = {
  // Scanners
  '/tools/scanner': '/assets/scanners/multi-market-scanner.png',
  '/tools/options-confluence': '/assets/scanners/options-confluence.png',
  '/tools/confluence-scanner': '/assets/scanners/time-confluence.png',
  '/tools/deep-analysis': '/assets/scanners/golden-egg.png',

  // Platform tools
  '/operator': '/assets/platform-tools/operator-dashboard.png',
  '/tools/markets': '/assets/platform-tools/markets-dashboard.png',
  '/tools/crypto': '/assets/platform-tools/crypto-command.png',
  '/tools/gainers-losers': '/assets/platform-tools/top-gainers.png',
  '/tools/company-overview': '/assets/platform-tools/company-overview.png',
  '/tools/news': '/assets/platform-tools/news-sentiment.png',
  '/tools/heatmap': '/assets/platform-tools/sector-heatmap.png',
  '/tools/crypto-heatmap': '/assets/platform-tools/crypto-heatmap.png',
  '/tools/crypto-dashboard': '/assets/platform-tools/crypto-derivatives.png',
  '/tools/commodities': '/assets/platform-tools/commodities.png',
  '/tools/market-movers': '/assets/platform-tools/market-movers.png',
  '/tools/macro': '/assets/platform-tools/macro-dashboard.png',
  '/tools/crypto-explorer': '/assets/platform-tools/crypto-explorer.png',
  '/tools/equity-explorer': '/assets/platform-tools/equity-explorer.png',
  '/tools/options-terminal': '/assets/platform-tools/options-terminal.png',
  '/tools/intraday-charts': '/assets/platform-tools/intraday-charts.png',
  '/tools/alerts': '/assets/platform-tools/alerts.png',
  '/tools/backtest': '/assets/platform-tools/backtest.png',
  '/tools/watchlists': '/assets/platform-tools/watchlists.png',
  '/tools/journal': '/assets/platform-tools/trade-journal.png',
  '/tools/portfolio': '/assets/platform-tools/portfolio.png',
  '/tools/news?tab=earnings': '/assets/platform-tools/earnings-calendar.png',
  '/tools/economic-calendar': '/assets/platform-tools/earnings-calendar.png',
};

/** Look up the image for a tool href. Returns undefined if no image. */
export function getToolImage(href: string): string | undefined {
  return TOOL_IMAGES[href];
}
