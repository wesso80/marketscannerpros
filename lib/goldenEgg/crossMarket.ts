/**
 * Cross-market context: a few named reference instruments with a trend read, and whether they support, oppose, or are
 * neutral to the symbol's direction. Replaces the dead "No cross-market data" card.
 */

export interface CrossMarketItem {
  symbol: string;
  label: string;
  price: number | null;
  changePct: number | null; // recent change used for the read (session or 5-bar)
  trend: 'up' | 'down' | 'flat' | 'unknown';
  detail: string;
  /** How this instrument's trend relates to the symbol's direction. */
  relation: 'supportive' | 'headwind' | 'neutral' | 'unknown';
  /** True when the instrument moves inversely to risk assets (VIX, USD). */
  inverse?: boolean;
  asOf?: string | null;
}

export interface CrossMarketContext {
  alignment: 'supportive' | 'neutral' | 'headwind' | 'unknown';
  items: CrossMarketItem[];
  summary: string;
}

export function trendFromLevels(price: number | null, sma20: number | null, sma50: number | null, changePct: number | null): { trend: CrossMarketItem['trend']; detail: string } {
  if (price == null) return { trend: 'unknown', detail: 'no quote' };
  const parts: string[] = [];
  let votes = 0;
  if (sma20 != null) { votes += price > sma20 ? 1 : -1; parts.push(`${price > sma20 ? 'above' : 'below'} 20-bar mean`); }
  if (sma50 != null) { votes += price > sma50 ? 1 : -1; parts.push(`${price > sma50 ? 'above' : 'below'} 50-bar mean`); }
  if (changePct != null) { if (Math.abs(changePct) >= 0.75) votes += changePct > 0 ? 1 : -1; parts.push(`${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% recent`); }
  const trend: CrossMarketItem['trend'] = votes >= 2 ? 'up' : votes <= -2 ? 'down' : parts.length ? 'flat' : 'unknown';
  return { trend, detail: parts.join(' · ') || 'insufficient data' };
}

export function relate(trend: CrossMarketItem['trend'], direction: 'LONG' | 'SHORT' | 'NEUTRAL', inverse = false): CrossMarketItem['relation'] {
  if (trend === 'unknown') return 'unknown';
  if (trend === 'flat' || direction === 'NEUTRAL') return 'neutral';
  const riskOn = inverse ? trend === 'down' : trend === 'up';
  const wantsRiskOn = direction === 'LONG';
  return riskOn === wantsRiskOn ? 'supportive' : 'headwind';
}

export function summarizeCrossMarket(items: CrossMarketItem[], direction: 'LONG' | 'SHORT' | 'NEUTRAL'): CrossMarketContext {
  const known = items.filter((i) => i.relation !== 'unknown');
  if (known.length === 0) return { alignment: 'unknown', items, summary: 'Cross-market reference data unavailable right now.' };
  const sup = known.filter((i) => i.relation === 'supportive').length;
  const head = known.filter((i) => i.relation === 'headwind').length;
  const alignment: CrossMarketContext['alignment'] = direction === 'NEUTRAL' ? 'neutral' : sup > head ? 'supportive' : head > sup ? 'headwind' : 'neutral';
  const names = (rel: CrossMarketItem['relation']) => known.filter((i) => i.relation === rel).map((i) => i.symbol).join(', ');
  const summary = direction === 'NEUTRAL'
    ? `${known.length} reference markets read: ${known.map((i) => `${i.symbol} ${i.trend}`).join(', ')}. Symbol direction is neutral, so no alignment is claimed.`
    : `${sup} supportive${sup ? ` (${names('supportive')})` : ''} · ${head} headwind${head ? ` (${names('headwind')})` : ''} · ${known.length - sup - head} neutral for a ${direction.toLowerCase()} read.`;
  return { alignment, items, summary };
}

/** Sector → liquid sector ETF (Alpha Vantage OVERVIEW sector strings). */
export const SECTOR_ETF: Record<string, string> = {
  'TECHNOLOGY': 'XLK',
  'COMMUNICATION SERVICES': 'XLC',
  'CONSUMER CYCLICAL': 'XLY',
  'CONSUMER DISCRETIONARY': 'XLY',
  'CONSUMER DEFENSIVE': 'XLP',
  'CONSUMER STAPLES': 'XLP',
  'FINANCIAL SERVICES': 'XLF',
  'FINANCIALS': 'XLF',
  'HEALTHCARE': 'XLV',
  'HEALTH CARE': 'XLV',
  'INDUSTRIALS': 'XLI',
  'ENERGY': 'XLE',
  'UTILITIES': 'XLU',
  'REAL ESTATE': 'XLRE',
  'BASIC MATERIALS': 'XLB',
  'MATERIALS': 'XLB',
  'LIFE SCIENCES': 'XLV',
  'TRADE & SERVICES': 'XLY',
  'MANUFACTURING': 'XLI',
  'FINANCE': 'XLF',
};
