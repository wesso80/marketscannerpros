/**
 * Sector rotation engine — Citadel-style relative strength + macro
 * positioning across the 11 GICS sectors via SPDR sector ETFs.
 *
 * For each sector ETF (XLK/XLV/XLF/XLY/XLC/XLI/XLP/XLE/XLU/XLRE/XLB)
 * we pull TIME_SERIES_DAILY from Alpha Vantage and compute locally:
 *   - 1m / 3m / 6m / YTD / 12m total return (close-to-close)
 *   - 20d, 50d, 200d SMA + price vs SMA distance
 *   - relative strength vs SPY (sector return / SPY return) per window
 *   - 20d realised volatility (annualised)
 *   - 20d / 50d momentum slope (linear regression)
 *   - distance from 52w high / low
 *
 * Macro context (best-effort, marked missing if rate-limited):
 *   - 10Y treasury yield + 1m delta (TREASURY_YIELD)
 *   - Fed funds rate + 1m delta (FEDERAL_FUNDS_RATE)
 *
 * Marked missing per data-integrity rules:
 *   - Forward P/E by sector (not available on AV free tier per-sector)
 *   - Sector forward EPS growth (not available)
 *   - Institutional money flow / fund flows (no AV source)
 *   - ETF expense ratios (static reference table maintained in code)
 *
 * Quota footprint: 12 daily-series + 2 macro = 14 AV calls per memo.
 */

import { fetchDailyOhlcv, type OhlcBar } from "./priceSeries";
import { avFetch } from "@/lib/avRateGovernor";

const AV_BASE = "https://www.alphavantage.co/query";

export const SECTOR_ETFS: Array<{
  ticker: string;
  sector: string;
  /** Static reference: SPDR sector fund expense ratios (Q1 2026 published). */
  expenseRatioPct: number;
  /** Cyclical / defensive / rate-sensitive classification. */
  classification: "cyclical" | "defensive" | "growth" | "rate-sensitive" | "commodity-linked";
}> = [
  { ticker: "XLK",  sector: "Technology",            expenseRatioPct: 0.09, classification: "growth" },
  { ticker: "XLV",  sector: "Health Care",           expenseRatioPct: 0.09, classification: "defensive" },
  { ticker: "XLF",  sector: "Financials",            expenseRatioPct: 0.09, classification: "rate-sensitive" },
  { ticker: "XLY",  sector: "Consumer Discretionary",expenseRatioPct: 0.09, classification: "cyclical" },
  { ticker: "XLC",  sector: "Communication Services",expenseRatioPct: 0.09, classification: "growth" },
  { ticker: "XLI",  sector: "Industrials",           expenseRatioPct: 0.09, classification: "cyclical" },
  { ticker: "XLP",  sector: "Consumer Staples",      expenseRatioPct: 0.09, classification: "defensive" },
  { ticker: "XLE",  sector: "Energy",                expenseRatioPct: 0.09, classification: "commodity-linked" },
  { ticker: "XLU",  sector: "Utilities",             expenseRatioPct: 0.09, classification: "defensive" },
  { ticker: "XLRE", sector: "Real Estate",           expenseRatioPct: 0.09, classification: "rate-sensitive" },
  { ticker: "XLB",  sector: "Materials",             expenseRatioPct: 0.09, classification: "cyclical" },
];

export interface SectorMetrics {
  ticker: string;
  sector: string;
  classification: string;
  expenseRatioPct: number;
  status: "ok" | "missing-data" | "error";
  error: string | null;

  lastClose: number | null;
  lastBarDate: string | null;

  /** Close-to-close % return windows. */
  return1mPct: number | null;
  return3mPct: number | null;
  return6mPct: number | null;
  returnYTDPct: number | null;
  return12mPct: number | null;

  /** Relative strength vs SPY = sectorReturn − spyReturn (in %). */
  rs1mPct: number | null;
  rs3mPct: number | null;
  rs6mPct: number | null;

  /** SMA + position. */
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  priceVsSma50Pct: number | null;
  priceVsSma200Pct: number | null;

  /** Annualised realised vol from 20d log returns. */
  hv20Pct: number | null;

  /** Linear-regression slope per day (close), normalised to %/day. */
  momentumSlope20Pct: number | null;
  momentumSlope50Pct: number | null;

  /** 52-week high / low + distance %. */
  high52w: number | null;
  low52w: number | null;
  distFrom52wHighPct: number | null;
  distFrom52wLowPct: number | null;

  /** Composite relative strength rank score 0-100 (higher = stronger). */
  rsCompositeScore: number | null;
}

export interface MacroContext {
  treasury10y: { latest: number | null; oneMonthAgo: number | null; deltaBps: number | null; status: string };
  fedFunds:    { latest: number | null; oneMonthAgo: number | null; deltaBps: number | null; status: string };
}

export interface SectorRotationSnapshot {
  generatedAt: string;
  benchmark: { ticker: "SPY"; status: string; lastBarDate: string | null;
    return1mPct: number | null; return3mPct: number | null; return6mPct: number | null;
    return12mPct: number | null; hv20Pct: number | null; };
  sectors: SectorMetrics[];
  /** Sectors sorted by composite RS score (best first). */
  rankings: { byRs1m: string[]; byRs3m: string[]; byRs6m: string[]; byComposite: string[] };
  /** Average return across all sectors (breadth signal). */
  breadth: {
    avgReturn1mPct: number | null;
    avgReturn3mPct: number | null;
    pctSectorsAbove200dma: number | null;
    pctSectorsAbove50dma: number | null;
    leadership: "growth" | "defensive" | "cyclical" | "mixed" | "unknown";
  };
  macro: MacroContext;
  missingFields: string[];
  errors: string[];
}

/* ───────────── Public entry ───────────── */

export async function buildSectorRotationSnapshot(): Promise<SectorRotationSnapshot> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  const generatedAt = new Date().toISOString();
  const baseMissing = [
    "forward-PE-by-sector (not in AV free tier)",
    "forward-EPS-growth-by-sector (not in AV free tier)",
    "institutional-fund-flows (no AV source)",
    "options-positioning (no AV options chain)",
  ];

  if (!apiKey) {
    return emptySnapshot(generatedAt, ["ALPHA_VANTAGE_API_KEY missing"], baseMissing);
  }

  // Parallel: SPY benchmark + 11 sector ETFs + 2 macro endpoints.
  const [spyRes, sectorResults, treasury10y, fedFunds] = await Promise.all([
    fetchDailyOhlcv("SPY"),
    Promise.all(SECTOR_ETFS.map((s) => fetchDailyOhlcv(s.ticker))),
    fetchTreasuryYield(apiKey, "10year"),
    fetchFedFundsRate(apiKey),
  ]);

  const errors: string[] = [];
  const missing = [...baseMissing];

  if (spyRes.status !== "ok") {
    errors.push(`SPY benchmark: ${spyRes.error || spyRes.status}`);
    missing.push("spy-benchmark");
  }
  if (treasury10y.status !== "ok") missing.push(`treasury-10y:${treasury10y.status}`);
  if (fedFunds.status !== "ok") missing.push(`fed-funds:${fedFunds.status}`);

  const spyBars = spyRes.status === "ok" ? spyRes.bars : [];
  const spyReturns = computeReturnWindows(spyBars);
  const spyHv = spyBars.length ? annualisedHvFromBars(spyBars.slice(-20)) : null;

  // Per-sector metrics + RS vs SPY.
  const sectors: SectorMetricsInternal[] = SECTOR_ETFS.map((s, i) => {
    const r = sectorResults[i];
    return computeSectorMetrics(s, r, spyReturns);
  });

  // Composite RS rank: weight 1m=0.25, 3m=0.45, 6m=0.30 of relative-strength
  // (clamped to ±50pp), normalised 0-100.
  const composite = sectors.map((m) => {
    const parts: number[] = [];
    if (m.rs1m_norm != null) parts.push(0.25 * m.rs1m_norm);
    if (m.rs3m_norm != null) parts.push(0.45 * m.rs3m_norm);
    if (m.rs6m_norm != null) parts.push(0.30 * m.rs6m_norm);
    if (!parts.length) return { ticker: m.ticker, score: null as number | null };
    const wSum = (m.rs1m_norm != null ? 0.25 : 0) + (m.rs3m_norm != null ? 0.45 : 0) + (m.rs6m_norm != null ? 0.30 : 0);
    const score = parts.reduce((a, b) => a + b, 0) / wSum;
    return { ticker: m.ticker, score: Math.round(score * 100) / 100 };
  });
  composite.forEach((c) => {
    const target = sectors.find((s) => s.ticker === c.ticker);
    if (target) target.rsCompositeScore = c.score;
  });

  // Rankings (filter null, descending).
  const rank = (key: "rs1mPct" | "rs3mPct" | "rs6mPct" | "rsCompositeScore"): string[] =>
    [...sectors]
      .filter((s) => s[key] != null)
      .sort((a, b) => (b[key] as number) - (a[key] as number))
      .map((s) => s.ticker);
  const rankings = {
    byRs1m: rank("rs1mPct"),
    byRs3m: rank("rs3mPct"),
    byRs6m: rank("rs6mPct"),
    byComposite: rank("rsCompositeScore"),
  };

  // Breadth.
  const ret1mVals = sectors.map((s) => s.return1mPct).filter((v): v is number => v != null);
  const ret3mVals = sectors.map((s) => s.return3mPct).filter((v): v is number => v != null);
  const above200 = sectors.filter((s) => s.priceVsSma200Pct != null && s.priceVsSma200Pct > 0).length;
  const above50  = sectors.filter((s) => s.priceVsSma50Pct  != null && s.priceVsSma50Pct  > 0).length;
  const okCount = sectors.filter((s) => s.status === "ok").length || 1;
  const leadership = inferLeadership(sectors);
  const breadth = {
    avgReturn1mPct: ret1mVals.length ? round2(mean(ret1mVals)) : null,
    avgReturn3mPct: ret3mVals.length ? round2(mean(ret3mVals)) : null,
    pctSectorsAbove200dma: round2((above200 / okCount) * 100),
    pctSectorsAbove50dma:  round2((above50  / okCount) * 100),
    leadership,
  };

  // Strip helper fields before returning.
  const cleanSectors: SectorMetrics[] = sectors.map(({ rs1m_norm, rs3m_norm, rs6m_norm, ...rest }) => rest);

  return {
    generatedAt,
    benchmark: {
      ticker: "SPY",
      status: spyRes.status,
      lastBarDate: spyBars.length ? spyBars[spyBars.length - 1].date : null,
      return1mPct: spyReturns.r1m,
      return3mPct: spyReturns.r3m,
      return6mPct: spyReturns.r6m,
      return12mPct: spyReturns.r12m,
      hv20Pct: spyHv,
    },
    sectors: cleanSectors,
    rankings,
    breadth,
    macro: {
      treasury10y: {
        latest: treasury10y.latest, oneMonthAgo: treasury10y.oneMonthAgo,
        deltaBps: treasury10y.deltaBps, status: treasury10y.status,
      },
      fedFunds: {
        latest: fedFunds.latest, oneMonthAgo: fedFunds.oneMonthAgo,
        deltaBps: fedFunds.deltaBps, status: fedFunds.status,
      },
    },
    missingFields: missing,
    errors,
  };
}

/* ───────────── Per-sector ───────────── */

interface SectorMetricsInternal extends SectorMetrics {
  /** Helper normalised RS values (0-100 scale, clamped) used for compositing. */
  rs1m_norm: number | null;
  rs3m_norm: number | null;
  rs6m_norm: number | null;
}

interface ReturnWindows {
  r1m: number | null; r3m: number | null; r6m: number | null;
  rYTD: number | null; r12m: number | null;
}

function computeSectorMetrics(
  meta: typeof SECTOR_ETFS[number],
  series: Awaited<ReturnType<typeof fetchDailyOhlcv>>,
  spyReturns: ReturnWindows,
): SectorMetricsInternal {
  if (series.status !== "ok" || !series.bars.length) {
    return {
      ticker: meta.ticker, sector: meta.sector, classification: meta.classification,
      expenseRatioPct: meta.expenseRatioPct,
      status: series.status === "rate-limited" ? "missing-data" : "error",
      error: series.error || `no-data: ${series.status}`,
      lastClose: null, lastBarDate: null,
      return1mPct: null, return3mPct: null, return6mPct: null, returnYTDPct: null, return12mPct: null,
      rs1mPct: null, rs3mPct: null, rs6mPct: null,
      sma20: null, sma50: null, sma200: null,
      priceVsSma50Pct: null, priceVsSma200Pct: null,
      hv20Pct: null, momentumSlope20Pct: null, momentumSlope50Pct: null,
      high52w: null, low52w: null, distFrom52wHighPct: null, distFrom52wLowPct: null,
      rsCompositeScore: null,
      rs1m_norm: null, rs3m_norm: null, rs6m_norm: null,
    };
  }

  const bars = series.bars;
  const closes = bars.map((b) => b.close);
  const last = bars[bars.length - 1];
  const r = computeReturnWindows(bars);

  const rs1m = r.r1m != null && spyReturns.r1m != null ? round2(r.r1m - spyReturns.r1m) : null;
  const rs3m = r.r3m != null && spyReturns.r3m != null ? round2(r.r3m - spyReturns.r3m) : null;
  const rs6m = r.r6m != null && spyReturns.r6m != null ? round2(r.r6m - spyReturns.r6m) : null;

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);

  const priceVsSma50Pct  = sma50  ? round2(((last.close - sma50)  / sma50)  * 100) : null;
  const priceVsSma200Pct = sma200 ? round2(((last.close - sma200) / sma200) * 100) : null;

  const hv20 = annualisedHvFromBars(bars.slice(-20));
  const slope20 = linRegSlopePctPerDay(closes.slice(-20));
  const slope50 = linRegSlopePctPerDay(closes.slice(-50));

  // 52w window = last 252 bars.
  const window52w = bars.slice(-252);
  const high52w = window52w.length ? Math.max(...window52w.map((b) => b.high)) : null;
  const low52w  = window52w.length ? Math.min(...window52w.map((b) => b.low))  : null;
  const distFrom52wHighPct = high52w ? round2(((last.close - high52w) / high52w) * 100) : null;
  const distFrom52wLowPct  = low52w  ? round2(((last.close - low52w)  / low52w)  * 100) : null;

  // Normalise RS to 0-100 (centre 50, ±50pp full scale).
  const norm = (v: number | null): number | null =>
    v == null ? null : Math.max(0, Math.min(100, 50 + (v / 50) * 50));

  return {
    ticker: meta.ticker, sector: meta.sector, classification: meta.classification,
    expenseRatioPct: meta.expenseRatioPct,
    status: "ok", error: null,
    lastClose: round2(last.close), lastBarDate: last.date,
    return1mPct: r.r1m, return3mPct: r.r3m, return6mPct: r.r6m,
    returnYTDPct: r.rYTD, return12mPct: r.r12m,
    rs1mPct: rs1m, rs3mPct: rs3m, rs6mPct: rs6m,
    sma20: round2(sma20), sma50: round2(sma50), sma200: round2(sma200),
    priceVsSma50Pct, priceVsSma200Pct,
    hv20Pct: hv20,
    momentumSlope20Pct: slope20, momentumSlope50Pct: slope50,
    high52w: round2(high52w), low52w: round2(low52w),
    distFrom52wHighPct, distFrom52wLowPct,
    rsCompositeScore: null, // filled by caller
    rs1m_norm: norm(rs1m), rs3m_norm: norm(rs3m), rs6m_norm: norm(rs6m),
  };
}

function computeReturnWindows(bars: OhlcBar[]): ReturnWindows {
  if (!bars.length) return { r1m: null, r3m: null, r6m: null, rYTD: null, r12m: null };
  const last = bars[bars.length - 1].close;
  const ret = (lookback: number): number | null => {
    if (bars.length <= lookback) return null;
    const prior = bars[bars.length - 1 - lookback].close;
    if (!Number.isFinite(prior) || prior <= 0) return null;
    return round2(((last - prior) / prior) * 100);
  };
  // YTD: find first bar of current calendar year.
  const lastDate = bars[bars.length - 1].date;
  const year = lastDate.slice(0, 4);
  let ytdAnchor: number | null = null;
  for (const b of bars) {
    if (b.date.slice(0, 4) === year) { ytdAnchor = b.close; break; }
  }
  const rYTD = ytdAnchor && ytdAnchor > 0 ? round2(((last - ytdAnchor) / ytdAnchor) * 100) : null;
  return { r1m: ret(21), r3m: ret(63), r6m: ret(126), rYTD, r12m: ret(252) };
}

function inferLeadership(sectors: SectorMetrics[]): SectorRotationSnapshot["breadth"]["leadership"] {
  const top3 = [...sectors]
    .filter((s) => s.rsCompositeScore != null)
    .sort((a, b) => (b.rsCompositeScore as number) - (a.rsCompositeScore as number))
    .slice(0, 3);
  if (!top3.length) return "unknown";
  const counts: Record<string, number> = { growth: 0, defensive: 0, cyclical: 0, "rate-sensitive": 0, "commodity-linked": 0 };
  for (const s of top3) counts[s.classification] = (counts[s.classification] || 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] >= 2) {
    const k = sorted[0][0];
    if (k === "growth") return "growth";
    if (k === "defensive") return "defensive";
    if (k === "cyclical") return "cyclical";
  }
  return "mixed";
}

/* ───────────── Macro fetchers ───────────── */

interface MacroSeriesResult {
  status: "ok" | "rate-limited" | "error" | "missing";
  latest: number | null;
  oneMonthAgo: number | null;
  deltaBps: number | null;
  error?: string;
}

async function fetchTreasuryYield(apiKey: string, maturity: string): Promise<MacroSeriesResult> {
  const url = `${AV_BASE}?function=TREASURY_YIELD&interval=daily&maturity=${maturity}&apikey=${encodeURIComponent(apiKey)}`;
  return fetchMacroSeries(url);
}
async function fetchFedFundsRate(apiKey: string): Promise<MacroSeriesResult> {
  const url = `${AV_BASE}?function=FEDERAL_FUNDS_RATE&interval=daily&apikey=${encodeURIComponent(apiKey)}`;
  return fetchMacroSeries(url);
}
async function fetchMacroSeries(url: string): Promise<MacroSeriesResult> {
  try {
    const j = await avFetch<Record<string, unknown> | null>(url, 'MACRO_SERIES');
    if (!j) return { status: "missing", latest: null, oneMonthAgo: null, deltaBps: null };
    if (typeof j["Note"] === "string" || typeof j["Information"] === "string") {
      const note = String(j["Note"] || j["Information"]);
      if (/limit|frequency|quota|premium/i.test(note)) {
        return { status: "rate-limited", latest: null, oneMonthAgo: null, deltaBps: null, error: note.slice(0, 200) };
      }
    }
    const data = Array.isArray(j["data"]) ? (j["data"] as Array<Record<string, unknown>>) : [];
    if (!data.length) return { status: "missing", latest: null, oneMonthAgo: null, deltaBps: null };
    // AV returns most-recent first usually.
    const numericRows = data
      .map((row) => ({ date: String(row.date || ""), value: Number(row.value) }))
      .filter((r) => r.date && Number.isFinite(r.value));
    if (!numericRows.length) return { status: "missing", latest: null, oneMonthAgo: null, deltaBps: null };
    numericRows.sort((a, b) => b.date.localeCompare(a.date));
    const latest = numericRows[0].value;
    const oneMonth = numericRows.find((row) => {
      const target = new Date(numericRows[0].date);
      target.setDate(target.getDate() - 30);
      return row.date <= target.toISOString().slice(0, 10);
    })?.value ?? null;
    const deltaBps = oneMonth != null ? Math.round((latest - oneMonth) * 100) : null;
    return { status: "ok", latest: round2(latest), oneMonthAgo: round2(oneMonth), deltaBps };
  } catch (e) {
    return { status: "error", latest: null, oneMonthAgo: null, deltaBps: null, error: e instanceof Error ? e.message : "fetch_failed" };
  }
}

/* ───────────── Serialization for prompt ───────────── */

export function serializeSectorRotation(s: SectorRotationSnapshot): string {
  const L: string[] = [];
  L.push(`GENERATED_AT: ${s.generatedAt}`);
  L.push(`BENCHMARK SPY: status=${s.benchmark.status} | last=${s.benchmark.lastBarDate} | 1m=${fmtPct(s.benchmark.return1mPct)} | 3m=${fmtPct(s.benchmark.return3mPct)} | 6m=${fmtPct(s.benchmark.return6mPct)} | 12m=${fmtPct(s.benchmark.return12mPct)} | HV20=${fmtPct(s.benchmark.hv20Pct)}`);
  L.push("");
  L.push("MACRO_CONTEXT:");
  L.push(`  10Y_TREASURY: latest=${fmtPct(s.macro.treasury10y.latest)} | 1m_ago=${fmtPct(s.macro.treasury10y.oneMonthAgo)} | delta=${s.macro.treasury10y.deltaBps != null ? s.macro.treasury10y.deltaBps + "bps" : "n/a"} | status=${s.macro.treasury10y.status}`);
  L.push(`  FED_FUNDS:    latest=${fmtPct(s.macro.fedFunds.latest)} | 1m_ago=${fmtPct(s.macro.fedFunds.oneMonthAgo)} | delta=${s.macro.fedFunds.deltaBps != null ? s.macro.fedFunds.deltaBps + "bps" : "n/a"} | status=${s.macro.fedFunds.status}`);
  L.push("");
  L.push("BREADTH:");
  L.push(`  avg_1m=${fmtPct(s.breadth.avgReturn1mPct)} | avg_3m=${fmtPct(s.breadth.avgReturn3mPct)} | %above200dma=${fmtPct(s.breadth.pctSectorsAbove200dma)} | %above50dma=${fmtPct(s.breadth.pctSectorsAbove50dma)} | leadership=${s.breadth.leadership}`);
  L.push("");
  L.push("SECTORS (sorted by composite RS, best→worst):");
  const ordered = [...s.sectors].sort((a, b) => (b.rsCompositeScore ?? -999) - (a.rsCompositeScore ?? -999));
  for (const m of ordered) {
    L.push(`  ${m.ticker} (${m.sector} / ${m.classification}) | status=${m.status}`);
    L.push(`     last=${fmtNum(m.lastClose)} on ${m.lastBarDate ?? "n/a"} | exp=${m.expenseRatioPct.toFixed(2)}%`);
    L.push(`     ret 1m=${fmtPct(m.return1mPct)} 3m=${fmtPct(m.return3mPct)} 6m=${fmtPct(m.return6mPct)} YTD=${fmtPct(m.returnYTDPct)} 12m=${fmtPct(m.return12mPct)}`);
    L.push(`     RS-vs-SPY 1m=${fmtPct(m.rs1mPct)} 3m=${fmtPct(m.rs3mPct)} 6m=${fmtPct(m.rs6mPct)} | composite=${m.rsCompositeScore ?? "n/a"}/100`);
    L.push(`     vs SMA50=${fmtPct(m.priceVsSma50Pct)} vs SMA200=${fmtPct(m.priceVsSma200Pct)} | HV20=${fmtPct(m.hv20Pct)}`);
    L.push(`     momentum slope 20d=${fmtPct(m.momentumSlope20Pct)}/d 50d=${fmtPct(m.momentumSlope50Pct)}/d`);
    L.push(`     52w high=${fmtNum(m.high52w)} (dist=${fmtPct(m.distFrom52wHighPct)}) | 52w low=${fmtNum(m.low52w)} (dist=${fmtPct(m.distFrom52wLowPct)})`);
    if (m.error) L.push(`     ERROR: ${m.error}`);
  }
  L.push("");
  L.push("RANKINGS:");
  L.push(`  by_RS_1m:  ${s.rankings.byRs1m.join(" > ") || "n/a"}`);
  L.push(`  by_RS_3m:  ${s.rankings.byRs3m.join(" > ") || "n/a"}`);
  L.push(`  by_RS_6m:  ${s.rankings.byRs6m.join(" > ") || "n/a"}`);
  L.push(`  by_composite: ${s.rankings.byComposite.join(" > ") || "n/a"}`);
  L.push("");
  if (s.errors.length) {
    L.push("ERRORS:");
    for (const e of s.errors) L.push(`  - ${e}`);
    L.push("");
  }
  L.push("MISSING_FIELDS (cannot be fabricated):");
  for (const m of s.missingFields) L.push(`  - ${m}`);
  return L.join("\n");
}

/* ───────────── Math helpers ───────────── */

function sma(xs: number[], n: number): number | null {
  if (xs.length < n) return null;
  let s = 0;
  for (let i = xs.length - n; i < xs.length; i++) s += xs[i];
  return s / n;
}
function annualisedHvFromBars(bars: OhlcBar[]): number | null {
  if (bars.length < 5) return null;
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1].close;
    const b = bars[i].close;
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  if (rets.length < 4) return null;
  const m = mean(rets);
  let v = 0;
  for (const r of rets) v += (r - m) ** 2;
  v = v / (rets.length - 1);
  return round2(Math.sqrt(v) * Math.sqrt(252) * 100);
}
function linRegSlopePctPerDay(xs: number[]): number | null {
  if (xs.length < 5) return null;
  const n = xs.length;
  const xMean = (n - 1) / 2;
  const yMean = mean(xs);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (xs[i] - yMean);
    den += (i - xMean) ** 2;
  }
  if (den === 0 || yMean === 0) return null;
  const slope = num / den;
  return round4((slope / yMean) * 100);
}
function mean(xs: number[]): number {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
function round2(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}
function round4(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10000) / 10000;
}
function fmtNum(n: number | null): string {
  if (n == null) return "n/a";
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return String(n);
}
function fmtPct(n: number | null): string {
  if (n == null) return "n/a";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function emptySnapshot(generatedAt: string, errors: string[], baseMissing: string[]): SectorRotationSnapshot {
  return {
    generatedAt,
    benchmark: { ticker: "SPY", status: "missing", lastBarDate: null,
      return1mPct: null, return3mPct: null, return6mPct: null, return12mPct: null, hv20Pct: null },
    sectors: SECTOR_ETFS.map((s) => ({
      ticker: s.ticker, sector: s.sector, classification: s.classification,
      expenseRatioPct: s.expenseRatioPct,
      status: "error", error: "no API key",
      lastClose: null, lastBarDate: null,
      return1mPct: null, return3mPct: null, return6mPct: null, returnYTDPct: null, return12mPct: null,
      rs1mPct: null, rs3mPct: null, rs6mPct: null,
      sma20: null, sma50: null, sma200: null,
      priceVsSma50Pct: null, priceVsSma200Pct: null,
      hv20Pct: null, momentumSlope20Pct: null, momentumSlope50Pct: null,
      high52w: null, low52w: null, distFrom52wHighPct: null, distFrom52wLowPct: null,
      rsCompositeScore: null,
    })),
    rankings: { byRs1m: [], byRs3m: [], byRs6m: [], byComposite: [] },
    breadth: { avgReturn1mPct: null, avgReturn3mPct: null, pctSectorsAbove200dma: null, pctSectorsAbove50dma: null, leadership: "unknown" },
    macro: {
      treasury10y: { latest: null, oneMonthAgo: null, deltaBps: null, status: "missing" },
      fedFunds:    { latest: null, oneMonthAgo: null, deltaBps: null, status: "missing" },
    },
    missingFields: baseMissing,
    errors,
  };
}
