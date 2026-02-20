export interface FundingRate {
  symbol: string;
  fundingRatePercent: number;
  annualized: number;
  sentiment: string;
}

export interface LongShortRatio {
  symbol: string;
  longAccount: number;
  shortAccount: number;
  longShortRatio: number;
}

export interface OpenInterestCoin {
  symbol: string;
  openInterestValue: number;
  change24h: number;
  signal: string;
}

export interface LiquidationCoin {
  symbol: string;
  longLiquidations: number;
  shortLiquidations: number;
  totalLiquidations: number;
  longValue: number;
  shortValue: number;
  totalValue: number;
  dominantSide: 'longs' | 'shorts' | 'balanced';
}

export interface DashboardData {
  fundingRates: { coins: FundingRate[]; avgRate: number; sentiment: string } | null;
  longShort: { coins: LongShortRatio[]; overall: string; avgLong: number; avgShort: number } | null;
  openInterest: { summary: any; coins: OpenInterestCoin[] } | null;
  liquidations: { summary: any; coins: LiquidationCoin[] } | null;
  prices: { [key: string]: { price: number; change24h: number } };
}

export interface DerivativesTradeIdea {
  id: string;
  symbol: string;
  direction: string;
  setupType: string;
  trigger: string;
  invalidation: string;
  riskMode: string;
}

export interface MarketStripItem {
  symbol: string;
  price?: number;
  change24h?: number;
  oiDelta: number;
  fundingSkew: number;
  volLabel: string;
}
