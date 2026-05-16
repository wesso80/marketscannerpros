/**
 * Local technical-indicator engine for admin briefs.
 *
 * Fetches a single TIME_SERIES_DAILY_ADJUSTED call from Alpha Vantage,
 * then computes every indicator client-side. This keeps quota burn at
 * ONE call per ticker per brief (vs 8+ if we used AV's RSI/MACD/BBANDS
 * endpoints separately).
 *
 * No fabricated values. If a series is too short for an indicator,
 * that field is null and added to missingFields.
 */

import { avFetch } from "@/lib/avRateGovernor";

const AV_BASE = "https://www.alphavantage.co/query";

export interface OhlcBar {
  date: string;        // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalSnapshot {
  symbol: string;
  fetchedAt: string;
  status: "ok" | "rate-limited" | "error" | "missing";
  error?: string;

  /** Most recent bar — never extrapolated. */
  lastBar: OhlcBar | null;
  bars: OhlcBar[];

  /** Trend across timeframes (price vs SMA + SMA slope). */
  trend: {
    daily: TrendCall;
    weekly: TrendCall;
    monthly: TrendCall;
  };

  sma: {
    sma20: number | null;
    sma50: number | null;
    sma100: number | null;
    sma200: number | null;
  };
  /** Detected SMA crossovers in the last 20 bars. */
  smaCrossovers: string[];

  rsi14: number | null;
  rsiState: "overbought" | "oversold" | "neutral" | "unknown";

  macd: {
    macd: number | null;
    signal: number | null;
    histogram: number | null;
    /** "bullish" if histogram crossed above zero in last 5 bars; etc. */
    recentSignal: "bullish-cross" | "bearish-cross" | "no-cross";
  };

  bbands: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
    /** % position within band: 0 at lower, 1 at upper. */
    pctB: number | null;
    /** "squeeze" if BB width < 30-day median, "expansion" if > 1.3x. */
    state: "squeeze" | "expansion" | "neutral" | "unknown";
  };

  volume: {
    last: number | null;
    avg20: number | null;
    /** last/avg20. */
    ratio: number | null;
    confirming: "confirming" | "contradicting" | "neutral" | "unknown";
  };

  /** Recent swing levels for support/resistance + Fibonacci. */
  swing: {
    /** Highest high over last 60 bars. */
    swingHigh: number | null;
    swingHighDate: string | null;
    /** Lowest low over last 60 bars. */
    swingLow: number | null;
    swingLowDate: string | null;
  };

  /** Standard Fibonacci retracement levels (from swingLow → swingHigh). */
  fibonacci: {
    level_0_236: number | null;
    level_0_382: number | null;
    level_0_500: number | null;
    level_0_618: number | null;
    level_0_786: number | null;
  };

  /** Pivot-based S/R from last 20 bars. */
  supportResistance: {
    nearestSupport: number | null;
    nearestResistance: number | null;
  };

  atr14: number | null;
  high52w: number | null;
  low52w: number | null;

  missingFields: string[];
}

export type TrendCall = "up" | "down" | "sideways" | "unknown";

/* ───────────── Fetch ───────────── */

interface AvDailyResponse {
  "Time Series (Daily)"?: Record<string, Record<string, string>>;
  Note?: string;
  Information?: string;
}

export async function fetchDailyOhlcv(symbol: string): Promise<{
  status: TechnicalSnapshot["status"];
  bars: OhlcBar[];
  error?: string;
}> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return {
      status: "error",
      bars: [],
      error: "ALPHA_VANTAGE_API_KEY missing",
    };
  }
  const url = `${AV_BASE}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const json = await avFetch<AvDailyResponse | null>(url, `TIME_SERIES_DAILY ${symbol}`);
    if (!json) {
      return { status: "missing", bars: [], error: "no data" };
    }
    if (json.Note || json.Information) {
      const msg = (json.Note || json.Information) as string;
      if (/limit|frequency|quota|premium/i.test(msg)) {
        return { status: "rate-limited", bars: [], error: msg.slice(0, 240) };
      }
    }
    const series = json["Time Series (Daily)"];
    if (!series) {
      return { status: "missing", bars: [], error: "no Time Series (Daily) field" };
    }
    const bars: OhlcBar[] = Object.entries(series)
      .map(([date, row]) => ({
        date,
        open: Number(row["1. open"]),
        high: Number(row["2. high"]),
        low: Number(row["3. low"]),
        close: Number(row["4. close"]),
        volume: Number(row["5. volume"]),
      }))
      .filter(
        (b) =>
          Number.isFinite(b.open) &&
          Number.isFinite(b.high) &&
          Number.isFinite(b.low) &&
          Number.isFinite(b.close),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    return { status: "ok", bars };
  } catch (err) {
    return {
      status: "error",
      bars: [],
      error: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

/* ───────────── Indicators ───────────── */

function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (prev == null) {
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += values[j];
      prev = s / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

function macd(values: number[]): {
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
} {
  const ema12 = ema(values, 12);
  const ema26 = ema(values, 26);
  const macdLine = values.map((_, i) => {
    const a = ema12[i];
    const b = ema26[i];
    return a != null && b != null ? a - b : null;
  });
  const macdValid = macdLine.map((v) => (v == null ? 0 : v));
  const firstValidIdx = macdLine.findIndex((v) => v != null);
  const signalRaw = ema(macdValid, 9);
  const signalLine = signalRaw.map((v, i) =>
    i < firstValidIdx + 8 ? null : v,
  );
  const histogram = macdLine.map((m, i) => {
    const s = signalLine[i];
    return m != null && s != null ? m - s : null;
  });
  return { macdLine, signalLine, histogram };
}

function bbands(
  values: number[],
  period = 20,
  stddev = 2,
): {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
} {
  const middle = sma(values, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const m = middle[i] as number;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (values[j] - m) ** 2;
    const sd = Math.sqrt(v / period);
    upper.push(m + stddev * sd);
    lower.push(m - stddev * sd);
  }
  return { upper, middle, lower };
}

function atr(bars: OhlcBar[], period = 14): (number | null)[] {
  const trs: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      trs.push(bars[i].high - bars[i].low);
      continue;
    }
    const prevClose = bars[i - 1].close;
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prevClose),
      Math.abs(bars[i].low - prevClose),
    );
    trs.push(tr);
  }
  return sma(trs, period);
}

/* ───────────── Snapshot builder ───────────── */

export function buildTechnicalSnapshot(
  symbol: string,
  bars: OhlcBar[],
  fetchStatus: TechnicalSnapshot["status"],
  fetchError?: string,
): TechnicalSnapshot {
  const missing: string[] = [];
  const empty: TechnicalSnapshot = {
    symbol,
    fetchedAt: new Date().toISOString(),
    status: fetchStatus,
    error: fetchError,
    lastBar: null,
    bars: [],
    trend: { daily: "unknown", weekly: "unknown", monthly: "unknown" },
    sma: { sma20: null, sma50: null, sma100: null, sma200: null },
    smaCrossovers: [],
    rsi14: null,
    rsiState: "unknown",
    macd: { macd: null, signal: null, histogram: null, recentSignal: "no-cross" },
    bbands: { upper: null, middle: null, lower: null, pctB: null, state: "unknown" },
    volume: { last: null, avg20: null, ratio: null, confirming: "unknown" },
    swing: { swingHigh: null, swingHighDate: null, swingLow: null, swingLowDate: null },
    fibonacci: {
      level_0_236: null,
      level_0_382: null,
      level_0_500: null,
      level_0_618: null,
      level_0_786: null,
    },
    supportResistance: { nearestSupport: null, nearestResistance: null },
    atr14: null,
    high52w: null,
    low52w: null,
    missingFields: ["all"],
  };
  if (fetchStatus !== "ok" || bars.length < 30) {
    return { ...empty, bars };
  }

  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume);
  const last = bars[bars.length - 1];
  const i = bars.length - 1;

  // SMA
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s100 = sma(closes, 100);
  const s200 = sma(closes, 200);
  const sma20 = s20[i];
  const sma50 = s50[i];
  const sma100 = s100[i];
  const sma200 = s200[i];
  if (sma20 == null) missing.push("sma20");
  if (sma50 == null) missing.push("sma50");
  if (sma100 == null) missing.push("sma100");
  if (sma200 == null) missing.push("sma200");

  // SMA crossovers (in last 20 bars)
  const crossovers: string[] = [];
  const checkCross = (a: (number | null)[], b: (number | null)[], aN: string, bN: string) => {
    for (let k = Math.max(20, i - 20); k <= i; k++) {
      const a0 = a[k - 1];
      const a1 = a[k];
      const b0 = b[k - 1];
      const b1 = b[k];
      if (a0 == null || a1 == null || b0 == null || b1 == null) continue;
      if (a0 < b0 && a1 >= b1) crossovers.push(`${aN} crossed ABOVE ${bN} on ${bars[k].date}`);
      else if (a0 > b0 && a1 <= b1) crossovers.push(`${aN} crossed BELOW ${bN} on ${bars[k].date}`);
    }
  };
  checkCross(s50, s200, "SMA50", "SMA200"); // golden/death cross
  checkCross(s20, s50, "SMA20", "SMA50");

  // RSI
  const r = rsi(closes, 14);
  const rsi14 = r[i];
  let rsiState: TechnicalSnapshot["rsiState"] = "unknown";
  if (rsi14 != null) {
    rsiState = rsi14 >= 70 ? "overbought" : rsi14 <= 30 ? "oversold" : "neutral";
  } else missing.push("rsi14");

  // MACD
  const m = macd(closes);
  const macdV = m.macdLine[i];
  const sigV = m.signalLine[i];
  const histV = m.histogram[i];
  let recentSignal: TechnicalSnapshot["macd"]["recentSignal"] = "no-cross";
  for (let k = Math.max(1, i - 5); k <= i; k++) {
    const h0 = m.histogram[k - 1];
    const h1 = m.histogram[k];
    if (h0 == null || h1 == null) continue;
    if (h0 < 0 && h1 >= 0) recentSignal = "bullish-cross";
    else if (h0 > 0 && h1 <= 0) recentSignal = "bearish-cross";
  }
  if (macdV == null) missing.push("macd");

  // Bollinger
  const bb = bbands(closes, 20, 2);
  const upper = bb.upper[i];
  const middle = bb.middle[i];
  const lower = bb.lower[i];
  let pctB: number | null = null;
  let bbState: TechnicalSnapshot["bbands"]["state"] = "unknown";
  if (upper != null && lower != null) {
    pctB = (last.close - lower) / Math.max(upper - lower, 1e-9);
    // BB width state via 30-day median
    const widths: number[] = [];
    for (let k = i; k > Math.max(0, i - 30); k--) {
      const u = bb.upper[k];
      const l = bb.lower[k];
      const mi = bb.middle[k];
      if (u != null && l != null && mi != null && mi !== 0)
        widths.push((u - l) / mi);
    }
    if (widths.length >= 10) {
      const sorted = [...widths].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const cur = widths[0];
      bbState = cur < median * 0.7 ? "squeeze" : cur > median * 1.3 ? "expansion" : "neutral";
    }
  } else missing.push("bbands");

  // Volume
  const vAvg = sma(vols, 20)[i];
  let vRatio: number | null = null;
  let vConfirming: TechnicalSnapshot["volume"]["confirming"] = "unknown";
  if (vAvg != null && vAvg > 0) {
    vRatio = last.volume / vAvg;
    const dailyMove = bars.length >= 2 ? last.close - bars[i - 1].close : 0;
    if (vRatio >= 1.3 && Math.abs(dailyMove) > 0) vConfirming = "confirming";
    else if (vRatio < 0.7) vConfirming = "contradicting";
    else vConfirming = "neutral";
  } else missing.push("volume_avg");

  // Swing high/low (last 60 bars)
  const lookback = Math.min(60, bars.length);
  const window = bars.slice(-lookback);
  let swingHigh = window[0].high;
  let swingHighDate = window[0].date;
  let swingLow = window[0].low;
  let swingLowDate = window[0].date;
  for (const b of window) {
    if (b.high > swingHigh) { swingHigh = b.high; swingHighDate = b.date; }
    if (b.low < swingLow) { swingLow = b.low; swingLowDate = b.date; }
  }
  const range = swingHigh - swingLow;
  const fib = {
    level_0_236: swingHigh - range * 0.236,
    level_0_382: swingHigh - range * 0.382,
    level_0_500: swingHigh - range * 0.5,
    level_0_618: swingHigh - range * 0.618,
    level_0_786: swingHigh - range * 0.786,
  };

  // Pivot S/R from last 20 bars
  const sr20 = bars.slice(-20);
  const recentHigh = Math.max(...sr20.map((b) => b.high));
  const recentLow = Math.min(...sr20.map((b) => b.low));
  const nearestResistance = recentHigh > last.close ? recentHigh : swingHigh;
  const nearestSupport = recentLow < last.close ? recentLow : swingLow;

  // ATR
  const a = atr(bars, 14);
  const atr14 = a[i];

  // 52w
  const w52 = bars.slice(-252);
  const high52w = Math.max(...w52.map((b) => b.high));
  const low52w = Math.min(...w52.map((b) => b.low));

  // Trend (daily/weekly/monthly via SMA slope and price-vs-SMA)
  const trendCall = (period: number): TrendCall => {
    const ssma = sma(closes, period);
    const cur = ssma[i];
    const prev = ssma[Math.max(0, i - period)];
    if (cur == null || prev == null) return "unknown";
    const slope = (cur - prev) / Math.max(prev, 1e-9);
    const above = last.close > cur;
    if (slope > 0.02 && above) return "up";
    if (slope < -0.02 && !above) return "down";
    return "sideways";
  };

  return {
    symbol,
    fetchedAt: new Date().toISOString(),
    status: "ok",
    lastBar: last,
    bars,
    trend: {
      daily: trendCall(50),
      weekly: trendCall(50 * 5),  // ~weekly equivalent
      monthly: trendCall(50 * 21), // ~monthly equivalent
    },
    sma: { sma20, sma50, sma100, sma200 },
    smaCrossovers: crossovers,
    rsi14,
    rsiState,
    macd: { macd: macdV, signal: sigV, histogram: histV, recentSignal },
    bbands: { upper, middle, lower, pctB, state: bbState },
    volume: { last: last.volume, avg20: vAvg, ratio: vRatio, confirming: vConfirming },
    swing: { swingHigh, swingHighDate, swingLow, swingLowDate },
    fibonacci: fib,
    supportResistance: { nearestSupport, nearestResistance },
    atr14,
    high52w,
    low52w,
    missingFields: missing,
  };
}

/** Compact human-readable serialization for the LLM prompt. */
export function serializeTechnicalSnapshot(s: TechnicalSnapshot): string {
  const lines: string[] = [];
  const f = (n: number | null | undefined, d = 2) =>
    n == null || !Number.isFinite(n) ? "n/a" : n.toFixed(d);
  lines.push(`SYMBOL: ${s.symbol}`);
  lines.push(`FETCHED_AT: ${s.fetchedAt}`);
  lines.push(`STATUS: ${s.status}`);
  if (s.error) lines.push(`ERROR: ${s.error}`);
  if (!s.lastBar) {
    lines.push("NO_BARS");
    return lines.join("\n");
  }
  const lb = s.lastBar;
  lines.push("");
  lines.push(`LAST_BAR ${lb.date}: open=${f(lb.open)} high=${f(lb.high)} low=${f(lb.low)} close=${f(lb.close)} vol=${lb.volume}`);
  lines.push(`52W_HIGH: ${f(s.high52w)}  52W_LOW: ${f(s.low52w)}`);
  lines.push(`TREND_DAILY: ${s.trend.daily}  TREND_WEEKLY: ${s.trend.weekly}  TREND_MONTHLY: ${s.trend.monthly}`);
  lines.push("");
  lines.push(`SMA: 20=${f(s.sma.sma20)} 50=${f(s.sma.sma50)} 100=${f(s.sma.sma100)} 200=${f(s.sma.sma200)}`);
  if (s.smaCrossovers.length) {
    lines.push("CROSSOVERS:");
    for (const c of s.smaCrossovers) lines.push(`  - ${c}`);
  }
  lines.push("");
  lines.push(`RSI14: ${f(s.rsi14)} (${s.rsiState})`);
  lines.push(`MACD: macd=${f(s.macd.macd, 4)} signal=${f(s.macd.signal, 4)} hist=${f(s.macd.histogram, 4)} recent=${s.macd.recentSignal}`);
  lines.push(`BBANDS: upper=${f(s.bbands.upper)} mid=${f(s.bbands.middle)} lower=${f(s.bbands.lower)} %B=${f(s.bbands.pctB, 3)} state=${s.bbands.state}`);
  lines.push(`VOLUME: last=${lb.volume} avg20=${f(s.volume.avg20, 0)} ratio=${f(s.volume.ratio, 2)} ${s.volume.confirming}`);
  lines.push("");
  lines.push(`SWING_HIGH: ${f(s.swing.swingHigh)} on ${s.swing.swingHighDate}`);
  lines.push(`SWING_LOW: ${f(s.swing.swingLow)} on ${s.swing.swingLowDate}`);
  lines.push(`FIB_RETRACEMENT (from swingLow→swingHigh):`);
  lines.push(`  0.236=${f(s.fibonacci.level_0_236)}  0.382=${f(s.fibonacci.level_0_382)}  0.500=${f(s.fibonacci.level_0_500)}  0.618=${f(s.fibonacci.level_0_618)}  0.786=${f(s.fibonacci.level_0_786)}`);
  lines.push(`NEAREST_SUPPORT: ${f(s.supportResistance.nearestSupport)}`);
  lines.push(`NEAREST_RESISTANCE: ${f(s.supportResistance.nearestResistance)}`);
  lines.push(`ATR14: ${f(s.atr14)}`);
  if (s.missingFields.length) {
    lines.push(`MISSING_FIELDS: ${s.missingFields.join(",")}`);
  }
  return lines.join("\n");
}
