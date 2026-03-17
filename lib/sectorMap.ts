/**
 * Stock → SPDR Sector ETF mapping for relative strength calculations.
 * Maps common equity symbols to their GICS sector ETF.
 */

export const SECTOR_ETFS = [
  'XLK', 'XLF', 'XLV', 'XLE', 'XLY', 'XLP', 'XLI', 'XLB', 'XLU', 'XLRE', 'XLC',
] as const;

export type SectorETF = typeof SECTOR_ETFS[number];

/**
 * Static stock → sector ETF mapping.
 * Covers the ~55 symbol equity universe + additional common names.
 */
export const STOCK_SECTOR_MAP: Record<string, SectorETF> = {
  // Technology (XLK)
  AAPL: 'XLK', MSFT: 'XLK', NVDA: 'XLK', AVGO: 'XLK', ORCL: 'XLK', CRM: 'XLK',
  AMD: 'XLK', INTC: 'XLK', QCOM: 'XLK', MU: 'XLK', AMAT: 'XLK',
  ADBE: 'XLK', NOW: 'XLK', INTU: 'XLK',
  V: 'XLK', MA: 'XLK', // Visa/Mastercard classified under XLK (IT sector)

  // Financials (XLF)
  JPM: 'XLF', BAC: 'XLF', WFC: 'XLF', GS: 'XLF', MS: 'XLF', BLK: 'XLF',
  PYPL: 'XLF', SQ: 'XLF',

  // Healthcare (XLV)
  UNH: 'XLV', JNJ: 'XLV', LLY: 'XLV', PFE: 'XLV', ABBV: 'XLV', MRK: 'XLV',

  // Energy (XLE)
  XOM: 'XLE', CVX: 'XLE', COP: 'XLE', SLB: 'XLE',

  // Consumer Discretionary (XLY)
  AMZN: 'XLY', TSLA: 'XLY', HD: 'XLY', MCD: 'XLY', NKE: 'XLY',
  COST: 'XLY', UBER: 'XLY', ABNB: 'XLY',

  // Consumer Staples (XLP)
  WMT: 'XLP', PG: 'XLP', KO: 'XLP', PEP: 'XLP',

  // Industrials (XLI)
  CAT: 'XLI', DE: 'XLI', UPS: 'XLI', BA: 'XLI', HON: 'XLI', GE: 'XLI',

  // Communication Services (XLC)
  GOOGL: 'XLC', GOOG: 'XLC', META: 'XLC', DIS: 'XLC', NFLX: 'XLC',

  // Growth/Cloud (map to XLK as closest sector)
  SHOP: 'XLK', SNOW: 'XLK', PLTR: 'XLK', CRWD: 'XLK',
};

/**
 * Get the sector ETF for a stock symbol. Returns undefined if not mapped.
 */
export function getSectorETF(symbol: string): SectorETF | undefined {
  return STOCK_SECTOR_MAP[symbol.toUpperCase()];
}

/**
 * Compute sector-relative strength: stockChange% − sectorETFChange%.
 * Positive = outperforming sector, negative = underperforming.
 */
export function computeSectorRelativeStrength(
  stockChangePct: number,
  sectorETFChangePct: number
): { relativeStrength: number; outperforming: boolean } {
  const relativeStrength = Math.round((stockChangePct - sectorETFChangePct) * 100) / 100;
  return { relativeStrength, outperforming: relativeStrength > 0 };
}
