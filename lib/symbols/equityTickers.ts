/**
 * Static equity tickers used to stop a crypto alert from pricing a stock.
 * Union of the sector map and the daily equity scan list (CVX is on both).
 */
import { SECTOR_ETFS, STOCK_SECTOR_MAP } from '@/lib/sectorMap';

const SCAN_DAILY_EQUITIES = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'ORCL', 'CRM',
  'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'BLK', 'SCHW', 'AXP',
  'UNH', 'JNJ', 'LLY', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY',
  'WMT', 'PG', 'KO', 'PEP', 'COST', 'MCD', 'NKE', 'SBUX', 'TGT', 'HD',
  'CAT', 'DE', 'UPS', 'FDX', 'BA', 'HON', 'GE', 'LMT', 'RTX', 'MMM',
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'PSX', 'VLO', 'MPC', 'KMI',
  'AMD', 'INTC', 'QCOM', 'MU', 'AMAT', 'LRCX', 'KLAC', 'TXN', 'ADI', 'MRVL',
  'NFLX', 'UBER', 'ABNB', 'SQ', 'SHOP', 'SNOW', 'PLTR', 'CRWD', 'ZS', 'DDOG',
  'BRK.B', 'DIS', 'CMCSA', 'VZ', 'T', 'PYPL', 'ADBE', 'NOW', 'INTU', 'IBM',
];

let cached: ReadonlySet<string> | null = null;

export function equityTickerSet(): ReadonlySet<string> {
  if (cached) return cached;
  const set = new Set<string>();
  for (const symbol of Object.keys(STOCK_SECTOR_MAP)) set.add(symbol.toUpperCase());
  for (const symbol of SECTOR_ETFS) set.add(symbol.toUpperCase());
  for (const symbol of SCAN_DAILY_EQUITIES) set.add(symbol.toUpperCase());
  cached = set;
  return set;
}

export function equityTickerList(): string[] {
  return [...equityTickerSet()].sort();
}
