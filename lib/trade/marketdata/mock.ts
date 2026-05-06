// Synthetic market data provider for offline UI development.
// NOT for any decision-making — clearly tagged source: "mock".

import type {
  BarHandler,
  BarsRequest,
  BarsResponse,
  LiveSubscription,
  MarketDataProvider,
  Resolution,
  SymbolMeta,
  TickHandler,
} from './types';

const RES_MS: Record<Resolution, number> = {
  '1S': 1_000,
  '5S': 5_000,
  '15S': 15_000,
  '30S': 30_000,
  '1': 60_000,
  '5': 5 * 60_000,
  '15': 15 * 60_000,
  '30': 30 * 60_000,
  '60': 60 * 60_000,
  '240': 240 * 60_000,
  D: 24 * 60 * 60_000,
  W: 7 * 24 * 60 * 60_000,
};

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function generateBars(symbol: string, resolution: Resolution, from: number, to: number) {
  const step = RES_MS[resolution];
  const start = Math.floor(from / step) * step;
  const rand = seededRand(symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  const bars = [];
  let price = 5000 + rand() * 100;
  for (let t = start; t < to; t += step) {
    const drift = (rand() - 0.5) * 2;
    const open = price;
    const close = +(open + drift).toFixed(2);
    const high = +(Math.max(open, close) + rand() * 1.5).toFixed(2);
    const low = +(Math.min(open, close) - rand() * 1.5).toFixed(2);
    const volume = Math.floor(rand() * 1000) + 50;
    bars.push({ time: t, open, high, low, close, volume });
    price = close;
  }
  return bars;
}

export class MockProvider implements MarketDataProvider {
  readonly name = 'mock';

  async resolveSymbol(input: string): Promise<SymbolMeta> {
    const id = input.toUpperCase();
    return {
      id,
      display: id,
      description: `Mock ${id}`,
      tickSize: 0.25,
      tickValue: 12.5,
      assetClass: 'future',
      exchange: 'MOCK',
      sessionTz: 'America/Chicago 17:00-16:00',
      currency: 'USD',
    };
  }

  async getBars(req: BarsRequest): Promise<BarsResponse> {
    const bars = generateBars(req.symbol, req.resolution, req.from, req.to);
    const limited = req.limit ? bars.slice(-req.limit) : bars;
    return {
      symbol: req.symbol,
      resolution: req.resolution,
      bars: limited,
      source: 'mock',
      fetchedAt: Date.now(),
      noData: limited.length === 0,
    };
  }

  async subscribeTicks(symbol: string, onTick: TickHandler): Promise<LiveSubscription> {
    let price = 5000;
    const id = setInterval(() => {
      price += (Math.random() - 0.5) * 0.5;
      onTick({ time: Date.now(), price: +price.toFixed(2), size: Math.ceil(Math.random() * 5) });
    }, 500);
    return { unsubscribe: () => clearInterval(id) };
  }

  async subscribeBars(
    symbol: string,
    resolution: Resolution,
    onBar: BarHandler
  ): Promise<LiveSubscription> {
    const step = RES_MS[resolution];
    let bucketStart = Math.floor(Date.now() / step) * step;
    let bar = generateBars(symbol, resolution, bucketStart, bucketStart + step)[0];
    const id = setInterval(() => {
      const now = Date.now();
      if (now >= bucketStart + step) {
        onBar(bar, true);
        bucketStart += step;
        bar = generateBars(symbol, resolution, bucketStart, bucketStart + step)[0];
      } else {
        const drift = (Math.random() - 0.5) * 0.5;
        bar.close = +(bar.close + drift).toFixed(2);
        bar.high = Math.max(bar.high, bar.close);
        bar.low = Math.min(bar.low, bar.close);
        bar.volume += Math.ceil(Math.random() * 5);
        onBar(bar, false);
      }
    }, 1000);
    return { unsubscribe: () => clearInterval(id) };
  }
}
