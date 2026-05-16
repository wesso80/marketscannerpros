/**
 * lib/admin/macroOutlook.ts
 *
 * MSP macro market outlook snapshot.
 *
 * Pulls latest macro series from the local macro_series store (populated
 * by the FRED ingest cron) and the SPY index via Alpha Vantage for trend
 * context. Computes a deterministic packet that the AI memo layer can
 * reason over without inventing numbers.
 *
 * No execution. No order routing. Operator-grade research only.
 */

import { q } from "@/lib/db";
import { avFetchAdmin } from "@/lib/avRateGovernor";
import { FRED_SERIES } from "@/lib/macro/fred";

const SPY_TIMEFRAME = "TIME_SERIES_DAILY";

export interface MacroSeriesRead {
  seriesKey: string;
  fredId: string;
  description: string;
  units: string;
  latest: number | null;
  latestDate: string | null;
  prior: number | null;
  priorDate: string | null;
  delta: number | null;             // latest - prior
  deltaPct: number | null;          // pct vs prior
  oneMonthAgo: number | null;
  oneMonthAgoDate: string | null;
  deltaOneMonth: number | null;
  status: "ok" | "stale" | "missing";
  ageDays: number | null;
}

export interface SpyContext {
  status: "ok" | "stale" | "missing";
  price: number | null;
  asOf: string | null;
  sma50: number | null;
  sma200: number | null;
  pctVsSma50: number | null;
  pctVsSma200: number | null;
  return1mPct: number | null;
  return3mPct: number | null;
  return6mPct: number | null;
  /** Crude breadth proxy from SPY: fraction of last 200 closes above their own 200-bar SMA. */
  breadthProxyAbove200dPct: number | null;
}

export interface MacroOutlookSnapshot {
  generatedAt: string;
  source: "fred:macro_series + alpha-vantage:spy";
  spy: SpyContext;
  series: Record<string, MacroSeriesRead>;
  /** Series keys that came back stale (> cadence-aware threshold). */
  staleSeries: string[];
  /** Series keys missing entirely. */
  missingFields: string[];
  /** Aggregate health: ok if SPY ok AND ≥6 series ok. */
  health: "ok" | "degraded" | "unavailable";
}

interface MacroRow {
  series_key: string;
  observed_on: Date;
  value: string | number;
}

const STALE_THRESHOLD_DAYS: Record<"daily" | "weekly" | "monthly", number> = {
  daily: 7,
  weekly: 14,
  monthly: 60,
};

async function loadLatestSeries(seriesKey: string): Promise<{
  rows: Array<{ observed_on: Date; value: number }>;
}> {
  const rows = await q<MacroRow>(
    `SELECT series_key, observed_on, value
       FROM macro_series
      WHERE series_key = $1
      ORDER BY observed_on DESC
      LIMIT 60`,
    [seriesKey],
  );
  return {
    rows: rows.map((r) => ({
      observed_on: r.observed_on,
      value: typeof r.value === "number" ? r.value : parseFloat(String(r.value)),
    })),
  };
}

function ageDays(d: Date | string | null): number | null {
  if (!d) return null;
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function findOnOrBefore(
  rows: Array<{ observed_on: Date; value: number }>,
  targetISO: string,
): { observed_on: Date; value: number } | null {
  const target = new Date(targetISO).getTime();
  for (const r of rows) {
    if (r.observed_on.getTime() <= target) return r;
  }
  return null;
}

async function buildSeriesRead(seriesKey: string): Promise<MacroSeriesRead> {
  const meta = FRED_SERIES[seriesKey];
  if (!meta) {
    return {
      seriesKey,
      fredId: "",
      description: "unknown",
      units: "",
      latest: null,
      latestDate: null,
      prior: null,
      priorDate: null,
      delta: null,
      deltaPct: null,
      oneMonthAgo: null,
      oneMonthAgoDate: null,
      deltaOneMonth: null,
      status: "missing",
      ageDays: null,
    };
  }
  const { rows } = await loadLatestSeries(seriesKey);
  if (rows.length === 0) {
    return {
      seriesKey,
      fredId: meta.fredId,
      description: meta.description,
      units: meta.units,
      latest: null,
      latestDate: null,
      prior: null,
      priorDate: null,
      delta: null,
      deltaPct: null,
      oneMonthAgo: null,
      oneMonthAgoDate: null,
      deltaOneMonth: null,
      status: "missing",
      ageDays: null,
    };
  }
  const latestRow = rows[0];
  const priorRow = rows[1] ?? null;
  const oneMonthTarget = new Date(latestRow.observed_on.getTime() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const oneMonthRow = findOnOrBefore(rows, oneMonthTarget);
  const age = ageDays(latestRow.observed_on);
  const threshold = STALE_THRESHOLD_DAYS[meta.cadence];
  const status: "ok" | "stale" = age != null && age > threshold ? "stale" : "ok";

  const delta = priorRow ? latestRow.value - priorRow.value : null;
  const deltaPct = priorRow && priorRow.value !== 0 ? (delta! / priorRow.value) * 100 : null;
  const deltaOneMonth = oneMonthRow ? latestRow.value - oneMonthRow.value : null;

  // Special case: CPI_YOY — convert from index to YoY %
  let latestValue = latestRow.value;
  let priorValue = priorRow?.value ?? null;
  let oneMonthValue = oneMonthRow?.value ?? null;
  if (seriesKey === "CPI_YOY") {
    const yoyTarget = new Date(latestRow.observed_on.getTime() - 365 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const yoyRow = findOnOrBefore(rows, yoyTarget);
    if (yoyRow && yoyRow.value !== 0) {
      latestValue = ((latestRow.value - yoyRow.value) / yoyRow.value) * 100;
      // Prior month YoY
      if (priorRow) {
        const priorYoyTarget = new Date(priorRow.observed_on.getTime() - 365 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const priorYoyRow = findOnOrBefore(rows, priorYoyTarget);
        if (priorYoyRow && priorYoyRow.value !== 0) {
          priorValue = ((priorRow.value - priorYoyRow.value) / priorYoyRow.value) * 100;
        }
      }
      oneMonthValue = priorValue;
    }
  }

  return {
    seriesKey,
    fredId: meta.fredId,
    description: meta.description,
    units: seriesKey === "CPI_YOY" ? "% YoY" : meta.units,
    latest: latestValue,
    latestDate: latestRow.observed_on.toISOString().slice(0, 10),
    prior: priorValue,
    priorDate: priorRow?.observed_on.toISOString().slice(0, 10) ?? null,
    delta: priorValue != null ? latestValue - priorValue : null,
    deltaPct:
      priorValue != null && priorValue !== 0
        ? ((latestValue - priorValue) / Math.abs(priorValue)) * 100
        : deltaPct,
    oneMonthAgo: oneMonthValue,
    oneMonthAgoDate: oneMonthRow?.observed_on.toISOString().slice(0, 10) ?? null,
    deltaOneMonth: oneMonthValue != null ? latestValue - oneMonthValue : deltaOneMonth,
    status,
    ageDays: age,
  };
}

function sma(arr: number[], period: number): number | null {
  if (arr.length < period) return null;
  const slice = arr.slice(0, period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function pctDiff(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0) return null;
  return ((a - b) / b) * 100;
}

async function buildSpyContext(): Promise<SpyContext> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || "";
  if (!apiKey) {
    return {
      status: "missing",
      price: null,
      asOf: null,
      sma50: null,
      sma200: null,
      pctVsSma50: null,
      pctVsSma200: null,
      return1mPct: null,
      return3mPct: null,
      return6mPct: null,
      breadthProxyAbove200dPct: null,
    };
  }
  try {
    const url = `https://www.alphavantage.co/query?function=${SPY_TIMEFRAME}&symbol=SPY&outputsize=full&apikey=${encodeURIComponent(apiKey)}`;
    const json = await avFetchAdmin<Record<string, unknown>>(url, 'SPY_DAILY');
    const series = (json?.["Time Series (Daily)"] ?? {}) as Record<string, Record<string, string>>;
    const entries = Object.entries(series).sort(([a], [b]) => (a > b ? -1 : 1));
    if (entries.length === 0) {
      return {
        status: "stale",
        price: null,
        asOf: null,
        sma50: null,
        sma200: null,
        pctVsSma50: null,
        pctVsSma200: null,
        return1mPct: null,
        return3mPct: null,
        return6mPct: null,
        breadthProxyAbove200dPct: null,
      };
    }
    const closes: number[] = [];
    const dates: string[] = [];
    for (const [date, bar] of entries.slice(0, 300)) {
      const close = parseFloat(bar?.["4. close"] || "");
      if (Number.isFinite(close)) {
        closes.push(close);
        dates.push(date);
      }
    }
    const latest = closes[0];
    const asOf = dates[0];
    const sma50v = sma(closes, 50);
    const sma200v = sma(closes, 200);
    // Returns
    const ret1m = closes.length >= 21 ? pctDiff(latest, closes[21]) : null;
    const ret3m = closes.length >= 63 ? pctDiff(latest, closes[63]) : null;
    const ret6m = closes.length >= 126 ? pctDiff(latest, closes[126]) : null;

    // Breadth proxy: fraction of last 200 closes that sit above their own trailing 200-bar SMA.
    // (Real breadth needs constituent data; this is documented proxy only.)
    let breadthProxy: number | null = null;
    if (closes.length >= 200) {
      let above = 0;
      let counted = 0;
      // Only need most-recent slice; cap at 60 windows to keep O(n*200) cheap
      const windows = Math.min(60, closes.length - 200);
      for (let i = 0; i < windows; i++) {
        const window = closes.slice(i, i + 200);
        const avg = window.reduce((s, v) => s + v, 0) / 200;
        if (closes[i] > avg) above++;
        counted++;
      }
      breadthProxy = counted > 0 ? (above / counted) * 100 : null;
    }

    return {
      status: "ok",
      price: latest,
      asOf,
      sma50: sma50v,
      sma200: sma200v,
      pctVsSma50: pctDiff(latest, sma50v),
      pctVsSma200: pctDiff(latest, sma200v),
      return1mPct: ret1m,
      return3mPct: ret3m,
      return6mPct: ret6m,
      breadthProxyAbove200dPct: breadthProxy,
    };
  } catch {
    return {
      status: "missing",
      price: null,
      asOf: null,
      sma50: null,
      sma200: null,
      pctVsSma50: null,
      pctVsSma200: null,
      return1mPct: null,
      return3mPct: null,
      return6mPct: null,
      breadthProxyAbove200dPct: null,
    };
  }
}

const SERIES_KEYS = [
  "FED_FUNDS_RATE",
  "US10Y",
  "US2Y",
  "YIELD_2S10S",
  "VIX",
  "DXY",
  "CREDIT_HY_OAS",
  "UNRATE",
  "CPI_YOY",
] as const;

export async function buildMacroOutlookSnapshot(): Promise<MacroOutlookSnapshot> {
  const [spy, ...seriesReads] = await Promise.all([
    buildSpyContext(),
    ...SERIES_KEYS.map((k) => buildSeriesRead(k)),
  ]);

  const series: Record<string, MacroSeriesRead> = {};
  const stale: string[] = [];
  const missing: string[] = [];
  let okCount = 0;
  for (const r of seriesReads) {
    series[r.seriesKey] = r;
    if (r.status === "missing") missing.push(r.seriesKey);
    else if (r.status === "stale") stale.push(r.seriesKey);
    else okCount++;
  }

  if (spy.status !== "ok") missing.push(`spy:${spy.status}`);

  const health: "ok" | "degraded" | "unavailable" =
    spy.status === "ok" && okCount >= 6
      ? "ok"
      : okCount >= 3
        ? "degraded"
        : "unavailable";

  return {
    generatedAt: new Date().toISOString(),
    source: "fred:macro_series + alpha-vantage:spy",
    spy,
    series,
    staleSeries: stale,
    missingFields: missing,
    health,
  };
}

function fmt(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  return n.toFixed(digits);
}

export function serializeMacroOutlook(s: MacroOutlookSnapshot): string {
  const L: string[] = [];
  L.push(`generatedAt: ${s.generatedAt}`);
  L.push(`source: ${s.source}`);
  L.push(`health: ${s.health}`);
  if (s.missingFields.length) L.push(`missing: ${s.missingFields.join(", ")}`);
  if (s.staleSeries.length) L.push(`stale: ${s.staleSeries.join(", ")}`);
  L.push("");
  L.push("SPY_CONTEXT:");
  L.push(`  status=${s.spy.status} asOf=${s.spy.asOf ?? "n/a"} price=${fmt(s.spy.price)}`);
  L.push(
    `  sma50=${fmt(s.spy.sma50)} (pctVsSma50=${fmt(s.spy.pctVsSma50)}%) sma200=${fmt(s.spy.sma200)} (pctVsSma200=${fmt(s.spy.pctVsSma200)}%)`,
  );
  L.push(
    `  returns: 1m=${fmt(s.spy.return1mPct)}% 3m=${fmt(s.spy.return3mPct)}% 6m=${fmt(s.spy.return6mPct)}%`,
  );
  L.push(`  breadthProxyAbove200dPct=${fmt(s.spy.breadthProxyAbove200dPct, 1)}% (PROXY ONLY — derived from SPY rolling SMA200, not constituent breadth)`);
  L.push("");
  L.push("MACRO_SERIES (FRED):");
  for (const key of SERIES_KEYS) {
    const r = s.series[key];
    L.push(
      `  ${key} [${r.fredId}] status=${r.status} ageDays=${r.ageDays ?? "n/a"} latest=${fmt(r.latest)} ${r.units} (${r.latestDate ?? "n/a"}) Δ1m=${fmt(r.deltaOneMonth)}`,
    );
    L.push(`    -- ${r.description}`);
  }
  L.push("");
  L.push("HARD CONSTRAINTS FOR THE MODEL:");
  L.push("  - Use ONLY the numbers above. If a value is 'n/a', do NOT invent — say 'unavailable' and lower confidence.");
  L.push("  - breadthProxyAbove200dPct is a SPY-rolling-SMA200 proxy. Real advance-decline / % above 200dma is NOT in this packet.");
  L.push("  - Put-call ratio, AAII survey, CNN Fear & Greed, IG spreads (LQD OAS), GDP, consumer spending series are NOT in this packet — flag as unavailable, do NOT fabricate.");
  L.push("  - Aggregate S&P 500 forward EPS / earnings season aggregate are NOT in this packet — flag unavailable; use price trend + breadth proxy only.");
  L.push("  - Geopolitical / election risks: respond ONLY if operator supplied context in OPERATOR_NOTES. Otherwise flag as outside-data.");
  return L.join("\n");
}
