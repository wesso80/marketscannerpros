// Provider factory. Pick implementation via TRADE_DATA_PROVIDER env var.
// Defaults to "mock" so a missing key never silently fabricates real-looking data.

import { DatabentoProvider } from './databento';
import { MockProvider } from './mock';
import type { MarketDataProvider } from './types';

let cached: MarketDataProvider | null = null;

export function getMarketDataProvider(): MarketDataProvider {
  if (cached) return cached;
  const choice = (process.env.TRADE_DATA_PROVIDER ?? 'mock').toLowerCase();
  switch (choice) {
    case 'databento':
      cached = new DatabentoProvider();
      break;
    case 'mock':
    default:
      cached = new MockProvider();
      break;
  }
  return cached;
}

export type { MarketDataProvider } from './types';
export * from './types';
