export const BRAND = 'MarketScannerPros';
export const TITLE_TEMPLATE = `%s | ${BRAND}`;

/** One brand, appended once. A segment that already names the brand would double it. */
export function pageTitle(segment: string): string {
  if (segment.includes(BRAND) || segment.includes('MarketScanner Pros')) {
    throw new Error('Page title already includes the brand');
  }
  return TITLE_TEMPLATE.replace('%s', segment);
}
