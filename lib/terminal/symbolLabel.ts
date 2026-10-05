/** Visible name on the three WP8b Terminal tabs. Routes stay /tools/golden-egg. */
const SYMBOL_LABEL_TABS = new Set(['Options Flow', 'Crypto', 'Time Confluence']);

export function terminalUsesSymbolLabel(tab: string): boolean {
  return SYMBOL_LABEL_TABS.has(tab);
}
