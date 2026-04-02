/**
 * MSP Operator — Market Data Service
 * Fetches live OHLCV bars from Alpha Vantage and normalizes into operator schemas.
 * Computes key levels (PDH/PDL, weekly/monthly, VWAP, midpoint) from bar history.
 * @internal
 */

import type {
  Bar, KeyLevel, MarketDataSnapshot, MarketDataSnapshotRequest,
  CrossMarketState, EventWindow, Market,
} from '@/types/operator';
import type { MarketDataProvider } from './orchestrator';
import { avTryToken } from '@/lib/avRateGovernor';
import { avCircuit } from '@/lib/circuitBreaker';
import { makeEnvelope } from './shared';

const AV_KEY = () => process.env.ALPHA_VANTAGE_API_KEY || '';

/* ── Timeframe → AV function mapping ───────────────────────── */

interface AVFunctionConfig {
  fn: string;
  tsKey: string;
  extraParams?: string;
}

function resolveAVFunction(
  market: Market,
  timeframe: string,
): AVFunctionConfig {
  const tf = timeframe.toLowerCase();

  if (market === 'CRYPTO') {
    if (['5m', '15m', '15min', '1h', '60min'].includes(tf)) {
      const interval = tf === '5m' ? '5min' : tf === '1h' ? '60min' : tf.replace('m', 'min');
      return {
        fn: 'CRYPTO_INTRADAY',
        tsKey: `Time Series Crypto (${interval})`,
        extraParams: `&market=USD&interval=${interval}&outputsize=full`,
      };
    }
    return {
      fn: 'DIGITAL_CURRENCY_DAILY',
      tsKey: 'Time Series (Digital Currency Daily)',
      extraParams: '&market=USD',
    };
  }

  // Equities / Futures / Forex / Options → standard endpoints
  if (['5m', '5min'].includes(tf)) {
    return { fn: 'TIME_SERIES_INTRADAY', tsKey: 'Time Series (5min)', extraParams: '&interval=5min&outputsize=full&entitlement=realtime' };
  }
  if (['15m', '15min'].includes(tf)) {
    return { fn: 'TIME_SERIES_INTRADAY', tsKey: 'Time Series (15min)', extraParams: '&interval=15min&outputsize=full&entitlement=realtime' };
  }
  if (['1h', '60min'].includes(tf)) {
    return { fn: 'TIME_SERIES_INTRADAY', tsKey: 'Time Series (60min)', extraParams: '&interval=60min&outputsize=full&entitlement=realtime' };
  }
  // Daily, 4H, 1W all use daily adjusted (4H/1W aggregated from daily)
  return { fn: 'TIME_SERIES_DAILY_ADJUSTED', tsKey: 'Time Series (Daily)', extraParams: '&outputsize=full&entitlement=realtime' };
}

/* ── Core Bar Fetcher ───────────────────────────────────────── */

async function fetchAVBars(
  symbol: string,
  market: Market,
  timeframe: string,
): Promise<Bar[]> {
  if (!AV_KEY()) return [];
  if (!(await avTryToken())) return [];

  const cfg = resolveAVFunction(market, timeframe);
  const sym = market === 'CRYPTO'
    ? symbol.replace(/-?USD$/i, '').toUpperCase()
    : encodeURIComponent(symbol);

  const url = `https://www.alphavantage.co/query?function=${cfg.fn}&symbol=${sym}${cfg.extraParams || ''}&apikey=${AV_KEY()}`;

  try {
    const res = await avCircuit.call(() =>
      fetch(url, { signal: AbortSignal.timeout(20_000) }),
    );
    if (!res.ok) return [];

    const json = await res.json();

    // Handle AV error responses
    if (json['Error Message'] || json['Note']) {
      console.warn(`[operator:market-data] AV error for ${symbol}:`, json['Error Message'] || json['Note']);
      return [];
    }

    const timeSeries = json[cfg.tsKey];
    if (!timeSeries) {
      // Try dynamic key match
      const altKey = Object.keys(json).find(k => k.startsWith('Time Series'));
      if (!altKey || !json[altKey]) return [];
      return parseTimeSeries(json[altKey], symbol, market, timeframe);
    }

    return parseTimeSeries(timeSeries, symbol, market, timeframe);
  } catch (err) {
    console.error(`[operator:market-data] Fetch failed for ${symbol}:`, err);
    return [];
  }
}

function parseTimeSeries(
  ts: Record<string, Record<string, string>>,
  symbol: string,
  market: Market,
  timeframe: string,
): Bar[] {
  const bars: Bar[] = [];

  for (const [timestamp, v] of Object.entries(ts)) {
    const close = parseFloat(v['4. close'] || v['4a. close (USD)'] || '0');
    if (!Number.isFinite(close) || close <= 0) continue;

    bars.push({
      symbol,
      market,
      timeframe,
      timestamp,
      open: parseFloat(v['1. open'] || v['1a. open (USD)'] || '0'),
      high: parseFloat(v['2. high'] || v['2a. high (USD)'] || '0'),
      low: parseFloat(v['3. low'] || v['3a. low (USD)'] || '0'),
      close,
      volume: Math.round(parseFloat(v['5. volume'] || v['6. volume'] || '0')),
    });
  }

  bars.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return bars;
}

/* ── Key Level Computation ──────────────────────────────────── */

export function computeKeyLevels(bars: Bar[]): KeyLevel[] {
  if (bars.length < 2) return [];

  const levels: KeyLevel[] = [];
  const latest = bars[bars.length - 1];
  const prev = bars[bars.length - 2];

  // Previous Day High / Low
  levels.push({ name: 'PDH', price: prev.high, category: 'PDH', strength: 0.8 });
  levels.push({ name: 'PDL', price: prev.low, category: 'PDL', strength: 0.8 });

  // Midpoint of previous day range
  const mid = (prev.high + prev.low) / 2;
  levels.push({ name: 'Midpoint', price: mid, category: 'MIDPOINT', strength: 0.5 });

  // Weekly high/low (last 5 bars as proxy for daily data)
  if (bars.length >= 5) {
    const weekBars = bars.slice(-5);
    const weekHigh = Math.max(...weekBars.map(b => b.high));
    const weekLow = Math.min(...weekBars.map(b => b.low));
    levels.push({ name: 'Weekly High', price: weekHigh, category: 'WEEKLY_HIGH', strength: 0.7 });
    levels.push({ name: 'Weekly Low', price: weekLow, category: 'WEEKLY_LOW', strength: 0.7 });
  }

  // Monthly high/low (last 20 bars as proxy)
  if (bars.length >= 20) {
    const monthBars = bars.slice(-20);
    const monthHigh = Math.max(...monthBars.map(b => b.high));
    const monthLow = Math.min(...monthBars.map(b => b.low));
    levels.push({ name: 'Monthly High', price: monthHigh, category: 'MONTHLY_HIGH', strength: 0.6 });
    levels.push({ name: 'Monthly Low', price: monthLow, category: 'MONTHLY_LOW', strength: 0.6 });
  }

  // Simple VWAP approximation (cumulative price*volume / volume)
  let vwapNum = 0;
  let vwapDen = 0;
  for (const b of bars.slice(-20)) {
    const typical = (b.high + b.low + b.close) / 3;
    vwapNum += typical * b.volume;
    vwapDen += b.volume;
  }
  if (vwapDen > 0) {
    levels.push({ name: 'VWAP', price: vwapNum / vwapDen, category: 'VWAP', strength: 0.9 });
  }

  return levels;
}

/* ── Cross-Market State ─────────────────────────────────────── */

async function fetchCrossMarketState(): Promise<CrossMarketState> {
  // Fetch VIX and DXY via compact daily to get current state
  const state: CrossMarketState = {
    dxyState: 'neutral',
    vixState: 'normal',
    breadthState: 'neutral',
  };

  try {
    // VIX check (use CBOE VIX ticker via AV)
    if (AV_KEY() && (await avTryToken())) {
      const vixUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=VIX&outputsize=compact&entitlement=realtime&apikey=${AV_KEY()}`;
      const res = await avCircuit.call(() => fetch(vixUrl, { signal: AbortSignal.timeout(15_000) }));
      if (res.ok) {
        const json = await res.json();
        const ts = json['Time Series (Daily)'];
        if (ts) {
          const dates = Object.keys(ts).sort().reverse();
          if (dates.length > 0) {
            const vix = parseFloat(ts[dates[0]]['4. close'] || '20');
            state.vixState = vix > 30 ? 'elevated' : vix > 20 ? 'cautious' : 'normal';
          }
        }
      }
    }
  } catch {
    // Keep defaults
  }

  return state;
}

/* ── Event Window ───────────────────────────────────────────── */

/**
 * Known high-impact economic events.
 * Dates are in YYYY-MM-DD format (UTC).
 * FOMC: 2-day meetings, we mark the announcement day (day 2).
 * CPI/PPI: release day. NFP (Jobs): first Friday of month.
 */
interface ScheduledEvent {
  date: string;
  name: string;
  severity: 'high' | 'medium';
  /** Hours before the event to start the caution window */
  leadHours: number;
  /** Hours after the event to keep the window active */
  trailHours: number;
}

const ECONOMIC_CALENDAR_2026: ScheduledEvent[] = [
  // FOMC announcements (2:00 PM ET on day 2)
  { date: '2026-01-28', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  { date: '2026-03-18', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  { date: '2026-04-29', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  { date: '2026-06-17', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  { date: '2026-07-29', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  { date: '2026-09-16', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  { date: '2026-10-28', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  { date: '2026-12-16', name: 'FOMC', severity: 'high', leadHours: 24, trailHours: 2 },
  // CPI releases (8:30 AM ET, typically mid-month)
  { date: '2026-01-14', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-02-11', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-03-11', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-04-14', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-05-12', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-06-10', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-07-14', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-08-12', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-09-11', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-10-13', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-11-12', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-12-10', name: 'CPI', severity: 'high', leadHours: 12, trailHours: 2 },
  // NFP / Jobs Report (8:30 AM ET, first Friday)
  { date: '2026-01-09', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-02-06', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-03-06', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-04-03', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-05-01', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-06-05', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-07-02', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-08-07', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-09-04', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-10-02', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-11-06', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  { date: '2026-12-04', name: 'NFP', severity: 'high', leadHours: 12, trailHours: 2 },
  // PPI (day after CPI, medium impact)
  { date: '2026-01-15', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-02-12', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-03-12', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-04-15', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-05-13', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-06-11', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-07-15', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-08-13', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-09-14', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-10-14', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-11-13', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
  { date: '2026-12-11', name: 'PPI', severity: 'medium', leadHours: 6, trailHours: 1 },
];

/**
 * Evaluate whether the current moment falls within (or near) a known
 * high-impact economic event window.  Returns the nearest event that
 * the lead/trail window overlaps with "now".
 */
function getEventWindow(_symbol: string): EventWindow {
  const now = Date.now();

  let nearest: { event: ScheduledEvent; eventMs: number; distMs: number } | null = null;

  for (const ev of ECONOMIC_CALENDAR_2026) {
    // Parse date as 13:30 UTC for CPI/NFP/PPI, 18:00 UTC for FOMC
    const releaseHour = ev.name === 'FOMC' ? 18 : 13;
    const eventMs = new Date(`${ev.date}T${String(releaseHour).padStart(2, '0')}:30:00Z`).getTime();

    const leadStart = eventMs - ev.leadHours * 3600_000;
    const trailEnd = eventMs + ev.trailHours * 3600_000;

    // Is now inside the event window?
    if (now >= leadStart && now <= trailEnd) {
      return {
        isActive: true,
        severity: ev.severity,
        nextEventAt: new Date(eventMs).toISOString(),
      };
    }

    // Track nearest future event
    if (eventMs > now) {
      const dist = eventMs - now;
      if (!nearest || dist < nearest.distMs) {
        nearest = { event: ev, eventMs, distMs: dist };
      }
    }
  }

  return {
    isActive: false,
    severity: null,
    nextEventAt: nearest ? new Date(nearest.eventMs).toISOString() : null,
  };
}

/* ── Public Provider ────────────────────────────────────────── */

/**
 * Live Alpha Vantage market data provider for the Operator Engine.
 * Wired into avRateGovernor and circuit breaker for production safety.
 */
export const alphaVantageProvider: MarketDataProvider = {
  async getBars(symbol: string, market: Market, timeframe: string): Promise<Bar[]> {
    return fetchAVBars(symbol, market, timeframe);
  },

  async getKeyLevels(symbol: string, market: Market): Promise<KeyLevel[]> {
    // Fetch daily bars and compute levels from them
    const bars = await fetchAVBars(symbol, market, '1D');
    return computeKeyLevels(bars);
  },

  async getCrossMarketState(): Promise<CrossMarketState> {
    return fetchCrossMarketState();
  },

  async getEventWindow(symbol: string): Promise<EventWindow> {
    return getEventWindow(symbol);
  },
};

/* ── Snapshot helper ────────────────────────────────────────── */

export async function getMarketSnapshot(
  req: MarketDataSnapshotRequest,
): Promise<MarketDataSnapshot> {
  const bars = await fetchAVBars(req.symbol, req.market, req.timeframe);
  const keyLevels = computeKeyLevels(bars);
  const crossMarket = await fetchCrossMarketState();
  const eventWindow = getEventWindow(req.symbol);

  return {
    latestBar: bars.length > 0 ? bars[bars.length - 1] : null,
    keyLevels,
    eventWindow,
    crossMarket,
  };
}

/** Wrap result in standard API envelope */
export function createSnapshotResponse(snapshot: MarketDataSnapshot) {
  return makeEnvelope('market-data', snapshot);
}
