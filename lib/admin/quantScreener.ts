/**
 * MSP multi-factor quant screener engine (admin only).
 *
 * For each ticker in the universe we pull two Alpha Vantage calls:
 *   - OVERVIEW            (P/E, P/B, EV/EBITDA, ROE, margins, growth, beta)
 *   - TIME_SERIES_DAILY   (200dma, 52w distance, RS vs SPY, momentum slope)
 *
 * Plus ONE SPY pull (benchmark for momentum / RS).
 *
 * All factor scores are computed LOCALLY. No fabricated values.
 *
 * Quota footprint: 2 × universe.length + 1 AV calls per screen.
 * (e.g. 25 tickers → 51 calls). Caller should cap universe accordingly.
 *
 * MARKED MISSING per data-integrity rules (NOT in AV free tier):
 *   - Sector medians for P/E (we use absolute thresholds + cross-screen z-score)
 *   - P/FCF, EV/EBITDA ranking against true sector universe
 *   - Insider buying / cluster signals
 *   - Institutional accumulation (13F flow)
 *   - Short interest + days-to-cover
 *   - Sell-side earnings revisions
 *   - Analyst rating changes (raw count only, no direction history)
 */

import { fetchDailyOhlcv, type OhlcBar } from "./priceSeries";
import { avFetchAdmin } from "@/lib/avRateGovernor";

const AV_BASE = "https://www.alphavantage.co/query";

export interface OverviewRaw {
  Symbol?: string;
  Name?: string;
  Sector?: string;
  Industry?: string;
  MarketCapitalization?: string;
  PERatio?: string;
  ForwardPE?: string;
  PEGRatio?: string;
  PriceToBookRatio?: string;
  PriceToSalesRatioTTM?: string;
  EVToRevenue?: string;
  EVToEBITDA?: string;
  ProfitMargin?: string;
  OperatingMarginTTM?: string;
  ReturnOnEquityTTM?: string;
  ReturnOnAssetsTTM?: string;
  RevenueTTM?: string;
  EBITDA?: string;
  QuarterlyEarningsGrowthYOY?: string;
  QuarterlyRevenueGrowthYOY?: string;
  DilutedEPSTTM?: string;
  Beta?: string;
  "52WeekHigh"?: string;
  "52WeekLow"?: string;
  AnalystTargetPrice?: string;
  DividendYield?: string;
  SharesOutstanding?: string;
}

export interface FactorScores {
  /** All scores 0..100 (higher = better on that factor). null if data missing. */
  value: number | null;
  quality: number | null;
  momentum: number | null;
  growth: number | null;
  /** sentiment is hard-locked null per data-integrity rules. */
  sentiment: null;
  /** Composite = weighted blend of available factors, rescaled 0..100. */
  composite: number | null;
}

export interface TickerScreenResult {
  ticker: string;
  status: "ok" | "missing-data" | "rate-limited" | "error";
  error: string | null;

  name: string | null;
  sector: string | null;
  industry: string | null;
  marketCapUSD: number | null;

  /* Raw factor inputs (so the AI can quote them, not invent them) */
  peRatio: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  evToEbitda: number | null;
  evToRevenue: number | null;

  roeTTM: number | null;           // already in %
  roaTTM: number | null;
  profitMargin: number | null;     // decimal in AV; we convert to %
  operatingMargin: number | null;  // %
  beta: number | null;

  qEarningsGrowthYoY: number | null; // %
  qRevenueGrowthYoY: number | null;  // %

  /* Computed price-derived */
  lastClose: number | null;
  lastBarDate: string | null;
  sma200: number | null;
  priceVsSma200Pct: number | null;
  return3mPct: number | null;
  return6mPct: number | null;
  return12mPct: number | null;
  rs3mPctVsSpy: number | null;
  rs6mPctVsSpy: number | null;
  momentumSlope50Pct: number | null; // %/day
  distFrom52wHighPct: number | null;

  factorScores: FactorScores;

  /** Fields that were unavailable for THIS ticker (logged). */
  missingFields: string[];
}

export interface QuantScreenSnapshot {
  generatedAt: string;
  universe: string[];                // tickers actually screened
  /** Universe-wide cross-sectional medians (computed across OK tickers). */
  universeStats: {
    medianPE: number | null;
    medianEVToEBITDA: number | null;
    medianROE: number | null;
    medianRevGrowth: number | null;
    okCount: number;
    failedCount: number;
  };
  benchmark: { ticker: "SPY"; status: string;
    return3mPct: number | null; return6mPct: number | null; return12mPct: number | null;
  };
  results: TickerScreenResult[];
  /** Results sorted by composite score desc (nulls last). */
  rankedTickers: string[];
  missingFields: string[];
  errors: string[];
}

/* ───────────── Public entry ───────────── */

const HARD_MISSING = [
  "insider-buying (not in AV free tier)",
  "institutional-accumulation-13F (not in AV free tier)",
  "short-interest (not in AV free tier)",
  "days-to-cover (not in AV free tier)",
  "sell-side-earnings-revisions (not in AV free tier)",
  "true-sector-median-PE (no cross-sector universe pull)",
  "options-positioning (no AV options chain)",
];

export async function buildQuantScreenSnapshot(
  rawUniverse: string[],
): Promise<QuantScreenSnapshot> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  const generatedAt = new Date().toISOString();

  // De-dup + uppercase + cap at 30 to protect AV quota.
  const universe = Array.from(
    new Set(rawUniverse.map((t) => t.trim().toUpperCase()).filter(Boolean)),
  ).slice(0, 30);

  if (!apiKey) {
    return {
      generatedAt,
      universe,
      universeStats: { medianPE: null, medianEVToEBITDA: null, medianROE: null, medianRevGrowth: null, okCount: 0, failedCount: universe.length },
      benchmark: { ticker: "SPY", status: "error", return3mPct: null, return6mPct: null, return12mPct: null },
      results: [],
      rankedTickers: [],
      missingFields: [...HARD_MISSING, "ALPHA_VANTAGE_API_KEY missing"],
      errors: ["ALPHA_VANTAGE_API_KEY missing"],
    };
  }

  // Fetch SPY benchmark + per-ticker (parallel within concurrency limit).
  const spyRes = await fetchDailyOhlcv("SPY");
  const spyReturns = spyRes.status === "ok"
    ? computeReturnWindows(spyRes.bars)
    : { r3m: null, r6m: null, r12m: null };

  // Per ticker: OVERVIEW + DAILY in parallel.
  const results = await runConcurrent(universe, 5, async (ticker) =>
    fetchTickerFactors(ticker, apiKey, spyReturns),
  );

  // Cross-sectional medians.
  const okList = results.filter((r) => r.status === "ok");
  const universeStats = {
    medianPE: median(okList.map((r) => r.peRatio).filter(isNum)),
    medianEVToEBITDA: median(okList.map((r) => r.evToEbitda).filter(isNum)),
    medianROE: median(okList.map((r) => r.roeTTM).filter(isNum)),
    medianRevGrowth: median(okList.map((r) => r.qRevenueGrowthYoY).filter(isNum)),
    okCount: okList.length,
    failedCount: results.length - okList.length,
  };

  // Score factors per ticker (now that we have the universe medians).
  for (const r of results) {
    r.factorScores = scoreFactors(r, universeStats);
  }

  // Ranking by composite (nulls last, ties broken by quality).
  const ranked = [...results].sort((a, b) => {
    const ac = a.factorScores.composite;
    const bc = b.factorScores.composite;
    if (ac == null && bc == null) return 0;
    if (ac == null) return 1;
    if (bc == null) return -1;
    return bc - ac;
  });

  const errors = results.filter((r) => r.error).map((r) => `${r.ticker}: ${r.error}`);

  return {
    generatedAt,
    universe,
    universeStats,
    benchmark: {
      ticker: "SPY",
      status: spyRes.status,
      return3mPct: spyReturns.r3m,
      return6mPct: spyReturns.r6m,
      return12mPct: spyReturns.r12m,
    },
    results,
    rankedTickers: ranked.map((r) => r.ticker),
    missingFields: HARD_MISSING,
    errors,
  };
}

/* ───────────── Per-ticker fetch ───────────── */

async function fetchTickerFactors(
  ticker: string,
  apiKey: string,
  spyReturns: { r3m: number | null; r6m: number | null; r12m: number | null },
): Promise<TickerScreenResult> {
  const result: TickerScreenResult = {
    ticker,
    status: "ok",
    error: null,
    name: null, sector: null, industry: null, marketCapUSD: null,
    peRatio: null, forwardPE: null, pegRatio: null,
    priceToBook: null, priceToSales: null,
    evToEbitda: null, evToRevenue: null,
    roeTTM: null, roaTTM: null,
    profitMargin: null, operatingMargin: null, beta: null,
    qEarningsGrowthYoY: null, qRevenueGrowthYoY: null,
    lastClose: null, lastBarDate: null,
    sma200: null, priceVsSma200Pct: null,
    return3mPct: null, return6mPct: null, return12mPct: null,
    rs3mPctVsSpy: null, rs6mPctVsSpy: null,
    momentumSlope50Pct: null, distFrom52wHighPct: null,
    factorScores: { value: null, quality: null, momentum: null, growth: null, sentiment: null, composite: null },
    missingFields: [],
  };

  // Parallel OVERVIEW + DAILY.
  const [overview, daily] = await Promise.all([
    avOverview(ticker, apiKey),
    fetchDailyOhlcv(ticker),
  ]);

  // OVERVIEW.
  if (overview.status !== "ok" || !overview.body) {
    result.missingFields.push("overview");
    if (overview.status === "rate-limited") {
      result.status = "rate-limited";
      result.error = overview.error || "AV rate limited";
    } else if (overview.status === "error") {
      result.status = "error";
      result.error = overview.error || "OVERVIEW error";
    }
  } else {
    const o = overview.body;
    result.name = o.Name || null;
    result.sector = o.Sector || null;
    result.industry = o.Industry || null;
    result.marketCapUSD = toNum(o.MarketCapitalization);
    result.peRatio = toNum(o.PERatio);
    result.forwardPE = toNum(o.ForwardPE);
    result.pegRatio = toNum(o.PEGRatio);
    result.priceToBook = toNum(o.PriceToBookRatio);
    result.priceToSales = toNum(o.PriceToSalesRatioTTM);
    result.evToEbitda = toNum(o.EVToEBITDA);
    result.evToRevenue = toNum(o.EVToRevenue);
    // AV reports these as decimals (e.g. "0.215" for 21.5%) — convert to %.
    const pm = toNum(o.ProfitMargin); result.profitMargin = pm != null ? pm * 100 : null;
    const om = toNum(o.OperatingMarginTTM); result.operatingMargin = om != null ? om * 100 : null;
    const roe = toNum(o.ReturnOnEquityTTM); result.roeTTM = roe != null ? roe * 100 : null;
    const roa = toNum(o.ReturnOnAssetsTTM); result.roaTTM = roa != null ? roa * 100 : null;
    const qeg = toNum(o.QuarterlyEarningsGrowthYOY); result.qEarningsGrowthYoY = qeg != null ? qeg * 100 : null;
    const qrg = toNum(o.QuarterlyRevenueGrowthYOY); result.qRevenueGrowthYoY = qrg != null ? qrg * 100 : null;
    result.beta = toNum(o.Beta);
  }

  // DAILY.
  if (daily.status !== "ok") {
    result.missingFields.push("price-series");
    if (result.status === "ok") {
      result.status = daily.status === "rate-limited" ? "rate-limited" : "missing-data";
      result.error = result.error || daily.error || "no price data";
    }
  } else {
    const bars = daily.bars;
    if (bars.length > 0) {
      const last = bars[bars.length - 1];
      result.lastClose = last.close;
      result.lastBarDate = last.date;
      result.sma200 = bars.length >= 200 ? sma(bars.slice(-200).map((b) => b.close)) : null;
      result.priceVsSma200Pct = result.sma200 ? round2(((last.close - result.sma200) / result.sma200) * 100) : null;
      const w = computeReturnWindows(bars);
      result.return3mPct = w.r3m;
      result.return6mPct = w.r6m;
      result.return12mPct = w.r12m;
      result.rs3mPctVsSpy = w.r3m != null && spyReturns.r3m != null ? round2(w.r3m - spyReturns.r3m) : null;
      result.rs6mPctVsSpy = w.r6m != null && spyReturns.r6m != null ? round2(w.r6m - spyReturns.r6m) : null;
      result.momentumSlope50Pct = bars.length >= 50 ? slopePctPerDay(bars.slice(-50).map((b) => b.close)) : null;
      const last260 = bars.slice(-260);
      const hi52 = Math.max(...last260.map((b) => b.high));
      result.distFrom52wHighPct = round2(((last.close - hi52) / hi52) * 100);
    }
  }

  // Mark fields that were null but should have been present.
  if (result.peRatio == null) result.missingFields.push("peRatio");
  if (result.evToEbitda == null) result.missingFields.push("evToEbitda");
  if (result.roeTTM == null) result.missingFields.push("roeTTM");
  if (result.qRevenueGrowthYoY == null) result.missingFields.push("qRevenueGrowthYoY");

  return result;
}

/* ───────────── Factor scoring ───────────── */

interface UniverseStats {
  medianPE: number | null;
  medianEVToEBITDA: number | null;
  medianROE: number | null;
  medianRevGrowth: number | null;
}

/**
 * Score one ticker 0..100 per factor.
 * All factors that lack inputs are returned as null (NOT 50, NOT 0).
 */
function scoreFactors(r: TickerScreenResult, u: UniverseStats): FactorScores {
  /* ── Value (lower P/E, P/B, EV/EBITDA = better) ── */
  const valueParts: number[] = [];
  // P/E vs universe median (lower is better).
  if (r.peRatio != null && r.peRatio > 0 && u.medianPE && u.medianPE > 0) {
    const ratio = r.peRatio / u.medianPE; // <1 = cheaper than median
    valueParts.push(clamp(100 - (ratio - 0.5) * 100, 0, 100));
  }
  // EV/EBITDA — absolute thresholds (<10 great, <15 ok, >20 expensive).
  if (r.evToEbitda != null && r.evToEbitda > 0) {
    const v = r.evToEbitda;
    const s = v <= 6 ? 100 : v >= 30 ? 0 : 100 - ((v - 6) / 24) * 100;
    valueParts.push(clamp(s, 0, 100));
  }
  // P/B (<1 = deep value, >5 = expensive).
  if (r.priceToBook != null && r.priceToBook > 0) {
    const v = r.priceToBook;
    const s = v <= 1 ? 100 : v >= 8 ? 0 : 100 - ((v - 1) / 7) * 100;
    valueParts.push(clamp(s, 0, 100));
  }
  const value = valueParts.length ? round2(mean(valueParts)) : null;

  /* ── Quality (ROE, margins) ── */
  const qualityParts: number[] = [];
  if (r.roeTTM != null) {
    // ROE ≥30% = 100, 15% = 50, ≤0 = 0.
    qualityParts.push(clamp(((r.roeTTM) / 30) * 100, 0, 100));
  }
  if (r.operatingMargin != null) {
    // Op margin: 30% = 100, 15% = 50, ≤0 = 0.
    qualityParts.push(clamp(((r.operatingMargin) / 30) * 100, 0, 100));
  }
  if (r.profitMargin != null) {
    // Net margin: 20% = 100, 10% = 50, ≤0 = 0.
    qualityParts.push(clamp(((r.profitMargin) / 20) * 100, 0, 100));
  }
  const quality = qualityParts.length ? round2(mean(qualityParts)) : null;

  /* ── Momentum (above 200dma + RS vs SPY + slope) ── */
  const momParts: number[] = [];
  if (r.priceVsSma200Pct != null) {
    // +20% above 200dma = 100, 0% = 50, -20% = 0.
    momParts.push(clamp(50 + r.priceVsSma200Pct * 2.5, 0, 100));
  }
  if (r.rs3mPctVsSpy != null) {
    // RS +15% over 3m = 100, 0 = 50, -15% = 0.
    momParts.push(clamp(50 + r.rs3mPctVsSpy * (50 / 15), 0, 100));
  }
  if (r.rs6mPctVsSpy != null) {
    momParts.push(clamp(50 + r.rs6mPctVsSpy * (50 / 25), 0, 100));
  }
  if (r.momentumSlope50Pct != null) {
    // Slope +0.3%/day = 100, 0 = 50, -0.3%/day = 0.
    momParts.push(clamp(50 + r.momentumSlope50Pct * (50 / 0.3), 0, 100));
  }
  const momentum = momParts.length ? round2(mean(momParts)) : null;

  /* ── Growth (revenue + earnings YoY) ── */
  const growthParts: number[] = [];
  if (r.qRevenueGrowthYoY != null) {
    // 30% = 100, 10% = 50, ≤-10% = 0.
    growthParts.push(clamp(((r.qRevenueGrowthYoY + 10) / 40) * 100, 0, 100));
  }
  if (r.qEarningsGrowthYoY != null) {
    growthParts.push(clamp(((r.qEarningsGrowthYoY + 25) / 75) * 100, 0, 100));
  }
  const growth = growthParts.length ? round2(mean(growthParts)) : null;

  /* ── Composite: equal-weight available factors ──
        sentiment is excluded entirely (we cannot fetch it). */
  const compParts: number[] = [];
  if (value != null) compParts.push(value);
  if (quality != null) compParts.push(quality);
  if (momentum != null) compParts.push(momentum);
  if (growth != null) compParts.push(growth);
  const composite = compParts.length >= 2 ? round2(mean(compParts)) : null;

  return { value, quality, momentum, growth, sentiment: null, composite };
}

/* ───────────── AV fetchers ───────────── */

async function avOverview(
  symbol: string,
  apiKey: string,
): Promise<{ status: "ok" | "rate-limited" | "error" | "missing"; body: OverviewRaw | null; error?: string }> {
  const url = `${AV_BASE}?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const json = await avFetchAdmin<Record<string, unknown> | null>(url, `OVERVIEW ${symbol}`);
    if (!json) return { status: "missing", body: null, error: "no data" };
    if (typeof json.Note === "string" || typeof json.Information === "string") {
      const note = (json.Note || json.Information) as string;
      if (/limit|frequency|quota|premium/i.test(note)) {
        return { status: "rate-limited", body: null, error: note.slice(0, 200) };
      }
    }
    if (!json.Symbol) return { status: "missing", body: null, error: "no Symbol in response" };
    return { status: "ok", body: json as OverviewRaw };
  } catch (e) {
    return { status: "error", body: null, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

/* ───────────── Concurrency helper ───────────── */

async function runConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/* ───────────── Math helpers ───────────── */

function toNum(v: string | undefined | null): number | null {
  if (v == null) return null;
  if (v === "None" || v === "-" || v === "" || v === "NaN") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isNum(v: number | null): v is number {
  return v != null && Number.isFinite(v);
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function sma(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function slopePctPerDay(values: number[]): number | null {
  if (values.length < 2) return null;
  const n = values.length;
  const xs = Array.from({ length: n }, (_, i) => i);
  const meanX = (n - 1) / 2;
  const meanY = mean(values);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (values[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0 || meanY === 0) return null;
  const slope = num / den;
  return round2((slope / meanY) * 100);
}

function computeReturnWindows(bars: OhlcBar[]): {
  r3m: number | null; r6m: number | null; r12m: number | null;
} {
  if (!bars.length) return { r3m: null, r6m: null, r12m: null };
  const last = bars[bars.length - 1].close;
  const pick = (lookback: number) => {
    if (bars.length <= lookback) return null;
    const past = bars[bars.length - 1 - lookback].close;
    if (!past) return null;
    return round2(((last - past) / past) * 100);
  };
  return { r3m: pick(63), r6m: pick(126), r12m: pick(252) };
}

/* ───────────── Serialization for prompt ───────────── */

export function serializeQuantScreen(s: QuantScreenSnapshot): string {
  const L: string[] = [];
  L.push(`GENERATED_AT: ${s.generatedAt}`);
  L.push(`UNIVERSE_SIZE: ${s.universe.length} (ok=${s.universeStats.okCount} failed=${s.universeStats.failedCount})`);
  L.push(`UNIVERSE: ${s.universe.join(",")}`);
  L.push(`BENCHMARK_SPY: status=${s.benchmark.status} r3m=${s.benchmark.return3mPct ?? "n/a"}% r6m=${s.benchmark.return6mPct ?? "n/a"}% r12m=${s.benchmark.return12mPct ?? "n/a"}%`);
  L.push(`UNIVERSE_MEDIANS: P/E=${s.universeStats.medianPE ?? "n/a"} EV/EBITDA=${s.universeStats.medianEVToEBITDA ?? "n/a"} ROE%=${s.universeStats.medianROE ?? "n/a"} RevGrowth%=${s.universeStats.medianRevGrowth ?? "n/a"}`);
  L.push("");
  L.push("MISSING_DATA_CATEGORIES (per data-integrity rules — DO NOT FABRICATE):");
  for (const m of s.missingFields) L.push(`  - ${m}`);
  L.push("");
  L.push("RANKED_RESULTS (sorted by composite score desc):");
  for (const t of s.rankedTickers) {
    const r = s.results.find((x) => x.ticker === t);
    if (!r) continue;
    L.push("");
    L.push(`TICKER: ${r.ticker} | name=${r.name ?? "n/a"} | sector=${r.sector ?? "n/a"} | status=${r.status}`);
    if (r.error) L.push(`  ERROR: ${r.error}`);
    L.push(`  marketCapUSD=${r.marketCapUSD ?? "n/a"} beta=${r.beta ?? "n/a"}`);
    L.push(`  VALUE: P/E=${r.peRatio ?? "n/a"} fwdPE=${r.forwardPE ?? "n/a"} PEG=${r.pegRatio ?? "n/a"} P/B=${r.priceToBook ?? "n/a"} P/S=${r.priceToSales ?? "n/a"} EV/EBITDA=${r.evToEbitda ?? "n/a"} EV/Rev=${r.evToRevenue ?? "n/a"}`);
    L.push(`  QUALITY: ROE%=${r.roeTTM ?? "n/a"} ROA%=${r.roaTTM ?? "n/a"} profMargin%=${r.profitMargin?.toFixed(2) ?? "n/a"} opMargin%=${r.operatingMargin?.toFixed(2) ?? "n/a"}`);
    L.push(`  GROWTH: revGrowthYoY%=${r.qRevenueGrowthYoY?.toFixed(2) ?? "n/a"} earnGrowthYoY%=${r.qEarningsGrowthYoY?.toFixed(2) ?? "n/a"}`);
    L.push(`  MOMENTUM: lastClose=${r.lastClose ?? "n/a"} vsSMA200%=${r.priceVsSma200Pct ?? "n/a"} r3m%=${r.return3mPct ?? "n/a"} r6m%=${r.return6mPct ?? "n/a"} r12m%=${r.return12mPct ?? "n/a"} RS3m%vsSPY=${r.rs3mPctVsSpy ?? "n/a"} RS6m%vsSPY=${r.rs6mPctVsSpy ?? "n/a"} slope50%/d=${r.momentumSlope50Pct ?? "n/a"} distFrom52wHigh%=${r.distFrom52wHighPct ?? "n/a"}`);
    L.push(`  FACTOR_SCORES(0-100): value=${r.factorScores.value ?? "n/a"} quality=${r.factorScores.quality ?? "n/a"} momentum=${r.factorScores.momentum ?? "n/a"} growth=${r.factorScores.growth ?? "n/a"} sentiment=missing composite=${r.factorScores.composite ?? "n/a"}`);
    if (r.missingFields.length) L.push(`  MISSING_FIELDS: ${r.missingFields.join(",")}`);
  }
  return L.join("\n");
}
