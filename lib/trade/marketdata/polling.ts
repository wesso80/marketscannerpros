// Polling-based bar subscription for providers without a native push feed.
// Polls getBars every `intervalMs` and emits bars when they change.
//
// This is a pragmatic bootstrap for Databento historical-only access. For true
// tick-level execution, swap in a worker that consumes Databento Live (DBN)
// and rebroadcasts via this same MarketDataProvider.subscribeBars contract.

import type { Bar, MarketDataProvider, Resolution, BarHandler, LiveSubscription } from './types';

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
  D: 86_400_000,
  W: 7 * 86_400_000,
};

export function pollingBarSubscription(
  provider: MarketDataProvider,
  symbol: string,
  resolution: Resolution,
  onBar: BarHandler,
  intervalMs = 5_000
): LiveSubscription {
  let cancelled = false;
  let lastTime: number | null = null;
  let lastClose: number | null = null;

  const tick = async () => {
    if (cancelled) return;
    try {
      const step = RES_MS[resolution];
      const to = Date.now();
      const from = to - step * 3; // last 3 buckets covers boundary transitions
      const res = await provider.getBars({ symbol, resolution, from, to });
      const bars = res.bars;
      if (bars.length === 0) return;
      const latest = bars[bars.length - 1];
      const prev = bars.length > 1 ? bars[bars.length - 2] : null;

      // Emit closed bar if a new bucket appeared.
      if (prev && lastTime != null && prev.time === lastTime && prev.close !== lastClose) {
        onBar(prev, true);
      }

      // Emit current (live) bar on every poll so overlays and price update.
      if (latest.time !== lastTime || latest.close !== lastClose) {
        onBar(latest, false);
        lastTime = latest.time;
        lastClose = latest.close;
      }
    } catch (err) {
      // Surface but don't kill the loop.
      console.error('[trade.polling] poll failed', err);
    }
  };

  // Fire immediately, then on interval.
  void tick();
  const id = setInterval(tick, intervalMs);

  return {
    unsubscribe: () => {
      cancelled = true;
      clearInterval(id);
    },
  };
}

export function inferPollIntervalMs(resolution: Resolution): number {
  // Personal-use defaults; tune via env if you want lower latency.
  const env = Number(process.env.TRADE_POLL_INTERVAL_MS);
  if (Number.isFinite(env) && env >= 1000) return env;
  switch (resolution) {
    case '1S':
    case '5S':
    case '15S':
    case '30S':
    case '1':
      return 3_000;
    case '5':
    case '15':
    case '30':
      return 5_000;
    default:
      return 15_000;
  }
}

export type { Bar };
