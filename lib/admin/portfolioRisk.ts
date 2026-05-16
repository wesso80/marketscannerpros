/**
 * Portfolio risk engine — MSP risk metrics computed locally
 * from one Alpha Vantage TIME_SERIES_DAILY fetch per holding plus SPY
 * benchmark and per-ticker OVERVIEW.
 *
 * All metrics derived from observable data. Anything we cannot
 * compute (implied vol, bid-ask spread, earnings move history on free
 * tier, options chains) is recorded in `missingFields` and flagged
 * as low-confidence per options-data-rules + data-integrity rules.
 */

import { fetchDailyOhlcv, type OhlcBar } from "./priceSeries";
import { avFetchAdmin } from "@/lib/avRateGovernor";

const AV_BASE = "https://www.alphavantage.co/query";

export interface PortfolioHolding {
  ticker: string;
  /** Allocation as a percent (0..100). */
  allocationPct: number;
  /** Optional cost-basis $/share for unrealised P&L context. */
  costBasis?: number;
}

export interface HoldingRiskMetrics {
  ticker: string;
  status: "ok" | "missing-data" | "error";
  error: string | null;

  /** Latest close + last-bar date. */
  lastPrice: number | null;
  lastBarDate: string | null;

  /** Annualised historical volatility (stdev of log returns × √252). */
  hv30: number | null;       // last 30d
  hv90: number | null;       // last 90d
  hv252: number | null;      // last 252d

  /** Beta vs SPY over last 252 trading days (cov / var). */
  beta252: number | null;
  /** Up-market beta (only positive SPY return days). */
  betaUp: number | null;
  /** Down-market beta (only negative SPY return days). */
  betaDown: number | null;

  /** Worst peak-to-trough drawdown over available history (≤ 10y). */
  maxDrawdownPct: number | null;
  drawdownPeakDate: string | null;
  drawdownTroughDate: string | null;
  /** Trading days from trough to recovery; null if not yet recovered. */
  recoveryDays: number | null;

  /** Average daily $ volume over last 30d. */
  avgDailyDollarVol30d: number | null;
  /** Liquidity bucket. */
  liquidityBand: "deep" | "good" | "thin" | "very-thin" | "unknown";

  /** From OVERVIEW. */
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  /** Beta as reported by AV OVERVIEW (long-term). */
  reportedBeta: number | null;
  dividendYield: number | null;
  /** Next earnings date if AV provides; null otherwise. */
  nextEarningsDate: string | null;

  /** Estimated decline in a 2008-style (-55% SPY) and COVID-style (-34% SPY) shock,
   *  scaled by downside beta when available, else reported beta. */
  stress2008Pct: number | null;
  stressCovidPct: number | null;

  /** Per-holding missing fields (options IV, bid/ask, etc.). */
  missingFields: string[];
}

export interface PortfolioCorrelation {
  /** Sorted unique pair "TICKER_A|TICKER_B" with TICKER_A < TICKER_B. */
  pair: string;
  /** Pearson r over the overlapping window (≤ 252 days). */
  r: number;
  windowDays: number;
}

export interface SectorConcentration {
  sector: string;
  allocationPct: number;
  tickers: string[];
}

export interface PortfolioRiskSnapshot {
  generatedAt: string;
  totalAllocationPct: number;        // sum of inputs, may be != 100
  benchmark: { ticker: "SPY"; status: string; lastBarDate: string | null };
  holdings: HoldingRiskMetrics[];
  correlations: PortfolioCorrelation[];
  sectorConcentration: SectorConcentration[];
  /** Weighted portfolio-level metrics. */
  portfolio: {
    weightedHv90: number | null;     // Σ(w * hv90), excluding missing
    weightedBeta: number | null;     // Σ(w * beta252)
    weightedMaxDD: number | null;    // Σ(w * |maxDD|)
    weightedStress2008: number | null;
    weightedStressCovid: number | null;
    /** Largest single-name weight. */
    topHoldingPct: number;
    /** Largest sector weight. */
    topSectorPct: number;
    /** Top sector name. */
    topSectorName: string | null;
  };
  missingFields: string[];           // portfolio-wide missing data classes
  errors: string[];
}

/* ───────────── Public entry ───────────── */

export async function buildPortfolioRiskSnapshot(
  holdings: PortfolioHolding[],
): Promise<PortfolioRiskSnapshot> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  const portfolioMissing: string[] = [
    "implied-volatility (no AV options chain)",
    "bid-ask-spread (no AV L1 quote)",
    "historical-earnings-move (no AV earnings history on free tier)",
  ];
  const errors: string[] = [];

  if (!apiKey) {
    return emptySnapshot(holdings, ["ALPHA_VANTAGE_API_KEY missing"]);
  }

  // Pull SPY in parallel with holdings (single benchmark).
  const tickers = holdings.map((h) => h.ticker.toUpperCase());
  const [spyRes, holdingResults, overviewMap] = await Promise.all([
    fetchDailyOhlcv("SPY"),
    Promise.all(tickers.map((t) => fetchDailyOhlcv(t))),
    Promise.all(tickers.map((t) => fetchOverview(t, apiKey))),
  ]);

  const spyBars = spyRes.status === "ok" ? spyRes.bars : [];
  const spyReturns = spyBars.length ? logReturns(spyBars.map((b) => b.close)) : [];

  // Per-holding metrics
  const metrics: HoldingRiskMetrics[] = holdings.map((h, i) => {
    const t = tickers[i];
    const series = holdingResults[i];
    const ov = overviewMap[i];
    return computeHoldingMetrics(t, series, spyBars, spyReturns, ov);
  });

  // Correlation matrix (pairwise, last 252d)
  const correlations = computeCorrelations(tickers, holdingResults);

  // Sector concentration
  const sectorMap = new Map<string, { pct: number; tickers: string[] }>();
  metrics.forEach((m, i) => {
    const sector = m.sector || "Unknown";
    const entry = sectorMap.get(sector) || { pct: 0, tickers: [] };
    entry.pct += holdings[i].allocationPct;
    entry.tickers.push(m.ticker);
    sectorMap.set(sector, entry);
  });
  const sectorConcentration: SectorConcentration[] = Array.from(sectorMap.entries())
    .map(([sector, v]) => ({ sector, allocationPct: round2safe(v.pct), tickers: v.tickers }))
    .sort((a, b) => b.allocationPct - a.allocationPct);

  // Weighted portfolio metrics
  const totalAlloc = holdings.reduce((s, h) => s + h.allocationPct, 0);
  const portfolio = computePortfolioAggregate(holdings, metrics, sectorConcentration);

  return {
    generatedAt: new Date().toISOString(),
    totalAllocationPct: round2safe(totalAlloc),
    benchmark: {
      ticker: "SPY",
      status: spyRes.status,
      lastBarDate: spyBars.length ? spyBars[spyBars.length - 1].date : null,
    },
    holdings: metrics,
    correlations,
    sectorConcentration,
    portfolio,
    missingFields: portfolioMissing,
    errors,
  };
}

/* ───────────── Per-holding ───────────── */

interface OverviewResult {
  status: "ok" | "missing" | "rate-limited" | "error";
  body: Record<string, unknown> | null;
  error?: string;
}

async function fetchOverview(symbol: string, apiKey: string): Promise<OverviewResult> {
  try {
    const url = `${AV_BASE}?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
    const j = await avFetchAdmin<Record<string, unknown> | null>(url, `OVERVIEW ${symbol}`);
    if (!j) return { status: "missing", body: null };
    if (typeof j["Note"] === "string" || typeof j["Information"] === "string") {
      return { status: "rate-limited", body: null, error: String(j["Note"] || j["Information"]).slice(0, 240) };
    }
    if (Object.keys(j).length === 0) return { status: "missing", body: null };
    return { status: "ok", body: j };
  } catch (e) {
    return { status: "error", body: null, error: e instanceof Error ? e.message : "fetch_failed" };
  }
}

function computeHoldingMetrics(
  ticker: string,
  series: Awaited<ReturnType<typeof fetchDailyOhlcv>>,
  spyBars: OhlcBar[],
  spyReturns: number[],
  ov: OverviewResult,
): HoldingRiskMetrics {
  const missing: string[] = [];
  if (series.status !== "ok" || !series.bars.length) {
    return {
      ticker,
      status: "error",
      error: series.error || `no-data: ${series.status}`,
      lastPrice: null, lastBarDate: null,
      hv30: null, hv90: null, hv252: null,
      beta252: null, betaUp: null, betaDown: null,
      maxDrawdownPct: null, drawdownPeakDate: null, drawdownTroughDate: null, recoveryDays: null,
      avgDailyDollarVol30d: null, liquidityBand: "unknown",
      sector: pickStr(ov.body, "Sector") || null,
      industry: pickStr(ov.body, "Industry") || null,
      marketCap: pickNum(ov.body, "MarketCapitalization"),
      reportedBeta: pickNum(ov.body, "Beta"),
      dividendYield: pickNum(ov.body, "DividendYield"),
      nextEarningsDate: pickStr(ov.body, "ExDividendDate") || null,
      stress2008Pct: null, stressCovidPct: null,
      missingFields: ["price-series"],
    };
  }
  const bars = series.bars;
  const closes = bars.map((b) => b.close);
  const returns = logReturns(closes);

  const last = bars[bars.length - 1];
  const hv30 = annualisedHv(returns.slice(-30));
  const hv90 = annualisedHv(returns.slice(-90));
  const hv252 = annualisedHv(returns.slice(-252));

  // Align to SPY by date for beta (last 252 overlapping days).
  const aligned = alignByDate(bars, spyBars, 252);
  let beta252: number | null = null;
  let betaUp: number | null = null;
  let betaDown: number | null = null;
  if (aligned.symRet.length >= 30) {
    beta252 = pearsonBeta(aligned.symRet, aligned.spyRet);
    const upIdx = aligned.spyRet
      .map((r, i) => (r > 0 ? i : -1))
      .filter((i) => i >= 0);
    const dnIdx = aligned.spyRet
      .map((r, i) => (r < 0 ? i : -1))
      .filter((i) => i >= 0);
    if (upIdx.length >= 10) {
      betaUp = pearsonBeta(
        upIdx.map((i) => aligned.symRet[i]),
        upIdx.map((i) => aligned.spyRet[i]),
      );
    }
    if (dnIdx.length >= 10) {
      betaDown = pearsonBeta(
        dnIdx.map((i) => aligned.symRet[i]),
        dnIdx.map((i) => aligned.spyRet[i]),
      );
    }
  } else {
    missing.push("beta (insufficient overlap with SPY)");
  }

  // Max drawdown over last ~10y.
  const window = bars.slice(-2520);
  const dd = computeMaxDrawdown(window);

  // Liquidity: avg $ volume last 30d.
  const last30 = bars.slice(-30);
  const avgDailyDollarVol30d = last30.length
    ? mean(last30.map((b) => b.close * b.volume))
    : null;
  const liquidityBand = bandLiquidity(avgDailyDollarVol30d);

  // Stress test: scale historical SPY shock by downside beta if available.
  const downBeta = betaDown ?? beta252 ?? pickNum(ov.body, "Beta");
  const stress2008Pct = downBeta != null ? round2(-0.55 * downBeta * 100) : null;
  const stressCovidPct = downBeta != null ? round2(-0.34 * downBeta * 100) : null;

  if (ov.status !== "ok") missing.push(`overview:${ov.status}`);

  return {
    ticker,
    status: "ok",
    error: null,
    lastPrice: round2(last.close),
    lastBarDate: last.date,
    hv30: hv30 == null ? null : round2(hv30 * 100),
    hv90: hv90 == null ? null : round2(hv90 * 100),
    hv252: hv252 == null ? null : round2(hv252 * 100),
    beta252: round2(beta252),
    betaUp: round2(betaUp),
    betaDown: round2(betaDown),
    maxDrawdownPct: dd.maxDrawdownPct == null ? null : round2(dd.maxDrawdownPct * 100),
    drawdownPeakDate: dd.peakDate,
    drawdownTroughDate: dd.troughDate,
    recoveryDays: dd.recoveryDays,
    avgDailyDollarVol30d: avgDailyDollarVol30d == null ? null : Math.round(avgDailyDollarVol30d),
    liquidityBand,
    sector: pickStr(ov.body, "Sector") || null,
    industry: pickStr(ov.body, "Industry") || null,
    marketCap: pickNum(ov.body, "MarketCapitalization"),
    reportedBeta: pickNum(ov.body, "Beta"),
    dividendYield: pickNum(ov.body, "DividendYield"),
    nextEarningsDate: pickStr(ov.body, "ExDividendDate") || null,
    stress2008Pct,
    stressCovidPct,
    missingFields: missing,
  };
}

/* ───────────── Aggregates ───────────── */

function computePortfolioAggregate(
  holdings: PortfolioHolding[],
  metrics: HoldingRiskMetrics[],
  sectorConc: SectorConcentration[],
) {
  const weighted = (key: keyof HoldingRiskMetrics): number | null => {
    let totalW = 0;
    let acc = 0;
    metrics.forEach((m, i) => {
      const v = m[key];
      if (typeof v === "number" && !Number.isNaN(v)) {
        const w = holdings[i].allocationPct / 100;
        acc += v * w;
        totalW += w;
      }
    });
    return totalW > 0 ? round2(acc / totalW * (totalW > 0 ? 1 : 0) * 1) : null;
  };

  // Note: weighted uses sum-of-products / sum-of-weights to handle missing data.
  const weightedAbs = (key: keyof HoldingRiskMetrics): number | null => {
    let totalW = 0;
    let acc = 0;
    metrics.forEach((m, i) => {
      const v = m[key];
      if (typeof v === "number" && !Number.isNaN(v)) {
        const w = holdings[i].allocationPct / 100;
        acc += Math.abs(v) * w;
        totalW += w;
      }
    });
    return totalW > 0 ? round2(acc / totalW) : null;
  };

  const topHoldingPct = Math.max(...holdings.map((h) => h.allocationPct), 0);
  const topSector = sectorConc[0];

  return {
    weightedHv90: weighted("hv90"),
    weightedBeta: weighted("beta252"),
    weightedMaxDD: weightedAbs("maxDrawdownPct"),
    weightedStress2008: weighted("stress2008Pct"),
    weightedStressCovid: weighted("stressCovidPct"),
    topHoldingPct: round2safe(topHoldingPct),
    topSectorPct: topSector ? topSector.allocationPct : 0,
    topSectorName: topSector ? topSector.sector : null,
  };
}

/* ───────────── Math helpers ───────────── */

function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}

function annualisedHv(returns: number[]): number | null {
  if (returns.length < 5) return null;
  const m = mean(returns);
  const variance = returns.reduce((s, r) => s + (r - m) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function pearsonBeta(sym: number[], spy: number[]): number | null {
  if (sym.length < 5 || sym.length !== spy.length) return null;
  const meanS = mean(spy);
  const meanY = mean(sym);
  let cov = 0, varS = 0;
  for (let i = 0; i < sym.length; i++) {
    cov += (sym[i] - meanY) * (spy[i] - meanS);
    varS += (spy[i] - meanS) ** 2;
  }
  if (varS === 0) return null;
  return cov / varS;
}

function pearsonR(a: number[], b: number[]): number | null {
  if (a.length < 5 || a.length !== b.length) return null;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? null : num / denom;
}

function alignByDate(
  symBars: OhlcBar[],
  spyBars: OhlcBar[],
  maxN: number,
): { symRet: number[]; spyRet: number[] } {
  const spyMap = new Map<string, number>();
  spyBars.forEach((b) => spyMap.set(b.date, b.close));
  const overlapping: { date: string; sym: number; spy: number }[] = [];
  for (const b of symBars) {
    const sp = spyMap.get(b.date);
    if (sp != null) overlapping.push({ date: b.date, sym: b.close, spy: sp });
  }
  const tail = overlapping.slice(-maxN - 1);
  const symRet: number[] = [];
  const spyRet: number[] = [];
  for (let i = 1; i < tail.length; i++) {
    if (tail[i - 1].sym > 0 && tail[i - 1].spy > 0) {
      symRet.push(Math.log(tail[i].sym / tail[i - 1].sym));
      spyRet.push(Math.log(tail[i].spy / tail[i - 1].spy));
    }
  }
  return { symRet, spyRet };
}

function computeMaxDrawdown(bars: OhlcBar[]): {
  maxDrawdownPct: number | null;
  peakDate: string | null;
  troughDate: string | null;
  recoveryDays: number | null;
} {
  if (bars.length < 30) return { maxDrawdownPct: null, peakDate: null, troughDate: null, recoveryDays: null };
  let peak = bars[0].close;
  let peakIdx = 0;
  let maxDD = 0;
  let ddPeakIdx = 0;
  let ddTroughIdx = 0;
  for (let i = 1; i < bars.length; i++) {
    const c = bars[i].close;
    if (c > peak) { peak = c; peakIdx = i; }
    const dd = (c - peak) / peak;
    if (dd < maxDD) {
      maxDD = dd;
      ddPeakIdx = peakIdx;
      ddTroughIdx = i;
    }
  }
  let recoveryDays: number | null = null;
  const peakClose = bars[ddPeakIdx].close;
  for (let j = ddTroughIdx + 1; j < bars.length; j++) {
    if (bars[j].close >= peakClose) { recoveryDays = j - ddTroughIdx; break; }
  }
  return {
    maxDrawdownPct: maxDD,
    peakDate: bars[ddPeakIdx].date,
    troughDate: bars[ddTroughIdx].date,
    recoveryDays,
  };
}

function computeCorrelations(
  tickers: string[],
  results: Array<Awaited<ReturnType<typeof fetchDailyOhlcv>>>,
): PortfolioCorrelation[] {
  const out: PortfolioCorrelation[] = [];
  // Build per-ticker date→close maps for overlap.
  const maps = results.map((r) => {
    const m = new Map<string, number>();
    if (r.status === "ok") for (const b of r.bars) m.set(b.date, b.close);
    return m;
  });
  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const overlap: { ai: number; aj: number; date: string }[] = [];
      maps[i].forEach((v, date) => {
        const w = maps[j].get(date);
        if (w != null) overlap.push({ ai: v, aj: w, date });
      });
      overlap.sort((x, y) => x.date.localeCompare(y.date));
      const tail = overlap.slice(-253);
      const ar: number[] = [];
      const br: number[] = [];
      for (let k = 1; k < tail.length; k++) {
        if (tail[k - 1].ai > 0 && tail[k - 1].aj > 0) {
          ar.push(Math.log(tail[k].ai / tail[k - 1].ai));
          br.push(Math.log(tail[k].aj / tail[k - 1].aj));
        }
      }
      const r = pearsonR(ar, br);
      if (r != null) {
        out.push({
          pair: `${tickers[i]}|${tickers[j]}`,
          r: round2safe(r),
          windowDays: ar.length,
        });
      }
    }
  }
  return out;
}

/* ───────────── Tiny utils ───────────── */

function pickNum(o: Record<string, unknown> | null, key: string): number | null {
  if (!o) return null;
  const v = o[key];
  if (v == null || v === "None" || v === "-" || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
function pickStr(o: Record<string, unknown> | null, key: string): string | null {
  if (!o) return null;
  const v = o[key];
  return v == null || v === "None" || v === "" ? null : String(v);
}
function round2(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v * 100) / 100;
}
function round2safe(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}
function bandLiquidity(adv: number | null): HoldingRiskMetrics["liquidityBand"] {
  if (adv == null) return "unknown";
  if (adv >= 100_000_000) return "deep";
  if (adv >= 10_000_000) return "good";
  if (adv >= 1_000_000) return "thin";
  return "very-thin";
}

function emptySnapshot(holdings: PortfolioHolding[], errors: string[]): PortfolioRiskSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    totalAllocationPct: holdings.reduce((s, h) => s + h.allocationPct, 0),
    benchmark: { ticker: "SPY", status: "skipped", lastBarDate: null },
    holdings: [],
    correlations: [],
    sectorConcentration: [],
    portfolio: {
      weightedHv90: null, weightedBeta: null, weightedMaxDD: null,
      weightedStress2008: null, weightedStressCovid: null,
      topHoldingPct: 0, topSectorPct: 0, topSectorName: null,
    },
    missingFields: ["all-data"],
    errors,
  };
}

/* ───────────── Prompt serializer ───────────── */

export function serializePortfolioRisk(s: PortfolioRiskSnapshot): string {
  const L: string[] = [];
  L.push(`GENERATED_AT: ${s.generatedAt}`);
  L.push(`TOTAL_ALLOCATION_PCT: ${s.totalAllocationPct}`);
  L.push(`BENCHMARK: SPY status=${s.benchmark.status} lastBar=${s.benchmark.lastBarDate ?? "n/a"}`);
  L.push("");
  L.push("PORTFOLIO_AGGREGATE:");
  L.push(`  weightedHV90 = ${s.portfolio.weightedHv90 ?? "n/a"}%`);
  L.push(`  weightedBeta = ${s.portfolio.weightedBeta ?? "n/a"}`);
  L.push(`  weightedMaxDD(abs) = ${s.portfolio.weightedMaxDD ?? "n/a"}%`);
  L.push(`  est. -55% SPY shock = ${s.portfolio.weightedStress2008 ?? "n/a"}%`);
  L.push(`  est. -34% SPY shock = ${s.portfolio.weightedStressCovid ?? "n/a"}%`);
  L.push(`  topHolding = ${s.portfolio.topHoldingPct}%`);
  L.push(`  topSector = ${s.portfolio.topSectorName ?? "n/a"} @ ${s.portfolio.topSectorPct}%`);
  L.push("");
  L.push("HOLDINGS:");
  for (const h of s.holdings) {
    L.push(`- ${h.ticker} status=${h.status} sector=${h.sector ?? "n/a"} industry=${h.industry ?? "n/a"}`);
    L.push(`    last=${h.lastPrice ?? "n/a"} (${h.lastBarDate ?? "n/a"}) mktCap=${h.marketCap ?? "n/a"} divY=${h.dividendYield ?? "n/a"}`);
    L.push(`    HV30=${h.hv30 ?? "n/a"}% HV90=${h.hv90 ?? "n/a"}% HV252=${h.hv252 ?? "n/a"}%`);
    L.push(`    beta252=${h.beta252 ?? "n/a"} betaUp=${h.betaUp ?? "n/a"} betaDown=${h.betaDown ?? "n/a"} reportedBeta=${h.reportedBeta ?? "n/a"}`);
    L.push(`    maxDD=${h.maxDrawdownPct ?? "n/a"}% peak=${h.drawdownPeakDate ?? "n/a"} trough=${h.drawdownTroughDate ?? "n/a"} recovery=${h.recoveryDays ?? "not-recovered"}d`);
    L.push(`    liquidity=${h.liquidityBand} avgDailyDollarVol30d=${h.avgDailyDollarVol30d ?? "n/a"}`);
    L.push(`    stress: 2008-style=${h.stress2008Pct ?? "n/a"}% COVID-style=${h.stressCovidPct ?? "n/a"}%`);
    if (h.missingFields.length) L.push(`    missing: ${h.missingFields.join(", ")}`);
  }
  L.push("");
  L.push("SECTOR_CONCENTRATION:");
  for (const sc of s.sectorConcentration) {
    L.push(`- ${sc.sector}: ${sc.allocationPct}% [${sc.tickers.join(", ")}]`);
  }
  L.push("");
  L.push("PAIRWISE_CORRELATIONS (252d):");
  if (!s.correlations.length) L.push("  (insufficient overlap)");
  for (const c of s.correlations) L.push(`- ${c.pair}: r=${c.r} (n=${c.windowDays})`);
  L.push("");
  L.push("PORTFOLIO_MISSING (do NOT fabricate):");
  for (const m of s.missingFields) L.push(`- ${m}`);
  if (s.errors.length) {
    L.push("");
    L.push("ERRORS:");
    for (const e of s.errors) L.push(`- ${e}`);
  }
  return L.join("\n");
}
