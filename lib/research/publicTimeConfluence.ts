/**
 * Public Time Confluence contract (/api/confluence-scan, mode "hierarchical").
 *
 * The internal hierarchical scan (lib/confluence-learning-agent) also produces a direction call, confidence, a
 * "target" level, an entry/stop/take-profit trade setup with R:R, a signal strength, weighted scores, banners, a
 * "best entry window", supply/demand structure and raw candles. None of that is published. The public reading is
 * the measured timing evidence only: when each timeframe's candle closes, which closes coincide, each timeframe's
 * prior-candle midpoint (50% level) and its distance from price, and which midpoints sit close together. Each part
 * carries its basis. Built leaf by leaf; nothing is copied by reference from the internal result.
 */
import type { HierarchicalScanResult } from '@/lib/confluence-learning-agent';

export const PUBLIC_TIME_CONFLUENCE_CONTRACT = 'public-time-confluence-v1';

export interface PublicCloseRow { tf: string; tfMinutes: number; nextCloseAt: string; minsToClose: number; midpoint: number | null; distanceToMidpointPct: number | null }
export interface PublicMidpoint { tf: string; level: number; distancePct: number }
export interface PublicMidpointGroup { tfs: string[]; levels: number[]; averageLevel: number }

export interface PublicTimeConfluence {
  contract: typeof PUBLIC_TIME_CONFLUENCE_CONTRACT;
  symbol: string;
  scanMode: string;
  modeLabel: string;
  primaryTF: string;
  includedTFs: string[];
  /** Timeframes in the scan whose midpoint could not be measured from the bars collected. */
  unmeasuredTFs: string[];
  price: { value: number | null; basis: 'live quote' | 'last 30-minute bar close'; source: string };
  observedAt: string;
  latestBarAt: string | null;
  closes: {
    schedule: PublicCloseRow[];
    closingNow: { count: number; timeframes: string[]; highestTF: string | null; windowMins: 5 };
    closingSoon: { count: number; timeframes: { tf: string; minsAway: number }[] };
    /** The 120-minute span (starting at a close) containing the most timeframe closes; earliest on a tie. */
    densestWindow: { count: number; timeframes: string[]; startMins: number; endMins: number; spanMins: 120 } | null;
    calendarEvents: { monthEnd: boolean; weekEnd: boolean; quarterEnd: boolean; yearEnd: boolean; sessionClose: 'ny' | 'london' | 'asia' | 'none' };
    marketOpen: boolean;
    basis: string;
  };
  midpoints: { levels: PublicMidpoint[]; groups: PublicMidpointGroup[]; basis: string };
  note: string;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;
const SESSION = new Set(['ny', 'london', 'asia', 'none']);

const DENSEST_SPAN_MINS = 120;

/**
 * Count-based densest span over the published schedule. The engine's own "peak cluster" is chosen by summed importance
 * weight, which is not published, so it is recomputed here by count. Earliest span wins a tie.
 */
function densestByCount(rows: PublicCloseRow[]): PublicTimeConfluence['closes']['densestWindow'] {
  const sorted = rows.filter((r) => r.minsToClose >= 0).sort((a, b) => a.minsToClose - b.minsToClose);
  let best: PublicTimeConfluence['closes']['densestWindow'] = null;
  for (let i = 0; i < sorted.length; i++) {
    const inSpan = sorted.filter((r, j) => j >= i && r.minsToClose - sorted[i].minsToClose <= DENSEST_SPAN_MINS);
    if (inSpan.length >= 2 && (!best || inSpan.length > best.count)) {
      best = { count: inSpan.length, timeframes: inSpan.map((r) => r.tf), startMins: sorted[i].minsToClose, endMins: inSpan[inSpan.length - 1].minsToClose, spanMins: DENSEST_SPAN_MINS };
    }
  }
  return best;
}

function latestBar(candles: HierarchicalScanResult['candlesByTf']): string | null {
  let max = -Infinity;
  for (const bars of Object.values(candles ?? {})) {
    const ts = num(Array.isArray(bars) ? bars.at(-1)?.ts : null);
    if (ts != null && ts > max) max = ts;
  }
  return Number.isFinite(max) ? new Date(max).toISOString() : null;
}

export function toPublicTimeConfluence(
  r: HierarchicalScanResult,
  ctx: { symbol: string; assetClass: 'equity' | 'crypto'; observedAt: number | string | Date },
): PublicTimeConfluence {
  const ccc = r.candleCloseConfluence;
  const schedule: PublicCloseRow[] = (ccc?.closes ?? []).map((c) => {
    const midpoint = num(c.mid50Level);
    const measured = midpoint != null && midpoint > 0;
    return {
      tf: str(c.tf), tfMinutes: num(c.tfMinutes) ?? 0, nextCloseAt: str(c.nextCloseAt), minsToClose: num(c.minsToClose) ?? 0,
      midpoint: measured ? midpoint : null,
      distanceToMidpointPct: measured && num(c.distanceToMid50) != null ? round(c.distanceToMid50 as number, 2) : null,
    };
  });
  const closingNowTFs = strs(ccc?.closingNow?.timeframes);
  const minutesOf = new Map(schedule.map((r) => [r.tf, r.tfMinutes]));
  // Longest timeframe closing now, by its length in minutes (not the engine's importance weight).
  const highestTF = closingNowTFs.reduce<string | null>((top, tf) => (top == null || (minutesOf.get(tf) ?? 0) > (minutesOf.get(top) ?? 0) ? tf : top), null);
  const ev = ccc?.specialEvents;
  const session = str(ev?.sessionClose);

  return {
    contract: PUBLIC_TIME_CONFLUENCE_CONTRACT,
    symbol: ctx.symbol,
    scanMode: str(r.mode),
    modeLabel: str(r.modeLabel),
    primaryTF: str(r.primaryTF),
    includedTFs: strs(r.includedTFs),
    unmeasuredTFs: strs(r.decompression?.unmeasuredTFs),
    price: {
      value: num(r.currentPrice),
      basis: r.isLivePrice ? 'live quote' : 'last 30-minute bar close',
      source: ctx.assetClass === 'crypto' ? 'CoinGecko' : 'Alpha Vantage',
    },
    observedAt: new Date(ctx.observedAt).toISOString(),
    latestBarAt: latestBar(r.candlesByTf),
    closes: {
      schedule,
      closingNow: { count: num(ccc?.closingNow?.count) ?? 0, timeframes: closingNowTFs, highestTF, windowMins: 5 },
      closingSoon: {
        count: num(ccc?.closingSoon?.count) ?? 0,
        timeframes: (ccc?.closingSoon?.timeframes ?? []).map((t) => ({ tf: str(t.tf), minsAway: num(t.minsAway) ?? 0 })),
      },
      densestWindow: densestByCount(schedule),
      calendarEvents: { monthEnd: !!ev?.isMonthEnd, weekEnd: !!ev?.isWeekEnd, quarterEnd: !!ev?.isQuarterEnd, yearEnd: !!ev?.isYearEnd, sessionClose: (SESSION.has(session) ? session : 'none') as PublicTimeConfluence['closes']['calendarEvents']['sessionClose'] },
      marketOpen: ccc?.isMarketOpen !== false,
      basis: 'Calculated from each timeframe\'s candle schedule (exchange session hours for equities, UTC for crypto). "Closing now" is within 5 minutes; "closing soon" is after 5 minutes and within 4 hours. The busiest 120-minute span is the one containing the most timeframe closes.',
    },
    midpoints: {
      levels: (r.mid50Levels ?? []).filter((m) => (num(m.level) ?? 0) > 0).map((m) => ({ tf: str(m.tf), level: m.level, distancePct: round(num(m.distance) ?? 0, 2) })),
      groups: (r.clusters ?? []).map((c) => ({ tfs: strs(c.tfs), levels: (c.levels ?? []).filter((l) => num(l) != null), averageLevel: num(c.avgLevel) ?? 0 })),
      basis: 'Midpoint = (high + low) / 2 of each timeframe\'s previous completed candle. Distance = (price − midpoint) ÷ midpoint; positive means price is above the midpoint. Groups are midpoints within one 30-minute ATR of each other.',
    },
    note: 'Measured timing and price-level evidence only. Coinciding candle closes and midpoints are descriptions of the schedule and recent candles, not a direction, target or trade level.',
  };
}
