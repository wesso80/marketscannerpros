/**
 * Earnings history engine — pulls Alpha Vantage EARNINGS + INCOME_STATEMENT
 * + OVERVIEW for a single ticker, then computes:
 *   - last 6 quarters of EPS estimate vs actual + surprise %
 *   - actual stock price reaction on each historical earnings day
 *     (close-to-next-close gap; pre-market move not available on AV)
 *   - quarterly revenue history + YoY/QoQ growth
 *   - upcoming earnings date (if AV publishes it)
 *   - 8-quarter average and median absolute earnings-day move
 *
 * Marks as MISSING (per options-data-rules + data-integrity rules):
 *   - options implied move (no AV options chain)
 *   - whisper number (no AV source)
 *   - intraday/pre-market move (AV daily only)
 *   - segment-level revenue breakdown (not in AV INCOME_STATEMENT)
 *
 * Quota footprint: 4 AV calls per memo (EARNINGS + INCOME_STATEMENT +
 * OVERVIEW + TIME_SERIES_DAILY). Reuses fetchDailyOhlcv.
 */

import { fetchDailyOhlcv, type OhlcBar } from "./priceSeries";
import { avFetchAdmin } from "@/lib/avRateGovernor";
import { fetchEarningsImpliedMove, type EarningsImpliedMove } from "./optionsImpliedMove";

const AV_BASE = "https://www.alphavantage.co/query";

export interface QuarterlyEarningsRow {
  fiscalDateEnding: string;          // YYYY-MM-DD (period end)
  reportedDate: string | null;       // YYYY-MM-DD (release date)
  estimatedEPS: number | null;
  reportedEPS: number | null;
  surpriseAbs: number | null;        // reported - estimate
  surprisePct: number | null;        // (reported - estimate)/|estimate| * 100
  beat: "beat" | "miss" | "in-line" | "unknown";
  /** Close-to-next-close % move on (or after) reportedDate. */
  reactionPct: number | null;
  reactionDate: string | null;       // close-of date used for reaction
  reactionDirection: "gap-up" | "gap-down" | "flat" | "unknown";
}

export interface QuarterlyRevenueRow {
  fiscalDateEnding: string;
  totalRevenue: number | null;
  yoyGrowthPct: number | null;       // vs same quarter last year
  qoqGrowthPct: number | null;       // vs prior quarter
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  operatingMarginPct: number | null;
}

export interface EarningsHistorySnapshot {
  ticker: string;
  generatedAt: string;
  status: "ok" | "partial" | "error";

  /** OVERVIEW-derived context. */
  companyName: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  forwardPE: number | null;
  trailingPE: number | null;
  reportedBeta: number | null;
  /** AV-published next earnings date, if available. */
  nextEarningsDateAV: string | null;
  /** Latest analyst target price (from OVERVIEW). */
  analystTargetPrice: number | null;
  /** Forward EPS estimate (from OVERVIEW EPS field). */
  trailingEPS: number | null;
  quarterlyEPSGrowthYoYPct: number | null;
  quarterlyRevenueGrowthYoYPct: number | null;

  /** Last bar context (for current-price-vs-history references). */
  lastClose: number | null;
  lastBarDate: string | null;

  /** Last 6 quarters (most recent first) of EPS surprise + price reaction. */
  earningsHistory: QuarterlyEarningsRow[];

  /** Last 8 quarters (most recent first) of revenue/margins. */
  revenueHistory: QuarterlyRevenueRow[];

  /** Computed earnings-day move statistics over the available history. */
  reactionStats: {
    sampleSize: number;
    avgAbsMovePct: number | null;
    medianAbsMovePct: number | null;
    avgSignedMovePct: number | null;
    largestUpPct: number | null;
    largestDownPct: number | null;
    /** Beat/miss outcome distribution. */
    beatCount: number;
    missCount: number;
    inLineCount: number;
    /** Average reaction conditioned on beat / miss. */
    avgReactionOnBeatPct: number | null;
    avgReactionOnMissPct: number | null;
  };

  /** Per-ticker missing fields (for evidence score). */
  missingFields: string[];
  /** Endpoint statuses for diagnostics. */
  endpointStatus: Record<string, string>;
  errors: string[];

  /** Live ATM-straddle implied move (Alpha Vantage options endpoint). */
  optionsIV: EarningsImpliedMove | null;
}

/* ───────────── Public entry ───────────── */

export async function buildEarningsHistorySnapshot(
  ticker: string,
): Promise<EarningsHistorySnapshot> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  const symbol = ticker.toUpperCase();
  const generatedAt = new Date().toISOString();

  const baseMissing = [
    "whisper-number (no AV source)",
    "intraday-pre-market-move (AV daily only)",
    "segment-revenue-breakdown (not in AV INCOME_STATEMENT)",
    "wall-street-consensus-next-quarter (not in AV free tier)",
  ];

  if (!apiKey) {
    return emptySnapshot(symbol, generatedAt, [
      "ALPHA_VANTAGE_API_KEY missing",
    ], baseMissing);
  }

  const [earningsRes, incomeRes, overviewRes, dailyRes] = await Promise.all([
    avCall(apiKey, "EARNINGS", symbol),
    avCall(apiKey, "INCOME_STATEMENT", symbol),
    avCall(apiKey, "OVERVIEW", symbol),
    fetchDailyOhlcv(symbol),
  ]);

  const endpointStatus: Record<string, string> = {
    EARNINGS: earningsRes.status,
    INCOME_STATEMENT: incomeRes.status,
    OVERVIEW: overviewRes.status,
    TIME_SERIES_DAILY: dailyRes.status,
  };
  const errors: string[] = [];
  if (earningsRes.error) errors.push(`EARNINGS: ${earningsRes.error}`);
  if (incomeRes.error) errors.push(`INCOME_STATEMENT: ${incomeRes.error}`);
  if (overviewRes.error) errors.push(`OVERVIEW: ${overviewRes.error}`);
  if (dailyRes.status !== "ok") errors.push(`TIME_SERIES_DAILY: ${dailyRes.error || dailyRes.status}`);

  const overview = (overviewRes.body || {}) as Record<string, unknown>;
  const bars = dailyRes.status === "ok" ? dailyRes.bars : [];
  const lastBar = bars.length ? bars[bars.length - 1] : null;

  const earningsHistory = buildEarningsHistory(earningsRes.body, bars);
  const revenueHistory = buildRevenueHistory(incomeRes.body);
  const reactionStats = computeReactionStats(earningsHistory);

  // Live options-IV (ATM straddle). Run after we know the underlying price.
  const nextEarningsDateAVProbe = extractNextEarningsDate(earningsRes.body);
  const optionsIV = await fetchEarningsImpliedMove(symbol, {
    earningsDate: nextEarningsDateAVProbe,
    underlying: lastBar ? lastBar.close : null,
  });

  const missing = [...baseMissing];
  if (earningsRes.status !== "ok") missing.push(`earnings-endpoint:${earningsRes.status}`);
  if (incomeRes.status !== "ok") missing.push(`income-statement-endpoint:${incomeRes.status}`);
  if (overviewRes.status !== "ok") missing.push(`overview-endpoint:${overviewRes.status}`);
  if (dailyRes.status !== "ok") missing.push(`daily-series:${dailyRes.status}`);
  if (!optionsIV.available) missing.push(`options-implied-move:${optionsIV.reason ?? "unavailable"}`);

  // AV's EARNINGS endpoint sometimes embeds an upcoming row (estimatedEPS only,
  // reportedEPS null, fiscalDateEnding in future). Surface separately.
  const nextEarningsDateAV = nextEarningsDateAVProbe;

  const status: "ok" | "partial" | "error" =
    earningsRes.status === "ok" && dailyRes.status === "ok"
      ? earningsHistory.length >= 4 ? "ok" : "partial"
      : earningsRes.status === "rate-limited" || dailyRes.status === "rate-limited"
        ? "partial"
        : earningsHistory.length === 0 ? "error" : "partial";

  return {
    ticker: symbol,
    generatedAt,
    status,
    companyName: pickStr(overview, "Name"),
    sector: pickStr(overview, "Sector"),
    industry: pickStr(overview, "Industry"),
    marketCap: pickNum(overview, "MarketCapitalization"),
    forwardPE: pickNum(overview, "ForwardPE"),
    trailingPE: pickNum(overview, "TrailingPE"),
    reportedBeta: pickNum(overview, "Beta"),
    nextEarningsDateAV,
    analystTargetPrice: pickNum(overview, "AnalystTargetPrice"),
    trailingEPS: pickNum(overview, "EPS"),
    quarterlyEPSGrowthYoYPct: pctOrNull(pickNum(overview, "QuarterlyEarningsGrowthYOY")),
    quarterlyRevenueGrowthYoYPct: pctOrNull(pickNum(overview, "QuarterlyRevenueGrowthYOY")),
    lastClose: lastBar ? round2(lastBar.close) : null,
    lastBarDate: lastBar ? lastBar.date : null,
    earningsHistory,
    revenueHistory,
    reactionStats,
    missingFields: missing,
    endpointStatus,
    errors,
    optionsIV,
  };
}

/* ───────────── EARNINGS endpoint parsing ───────────── */

function buildEarningsHistory(
  raw: unknown,
  bars: OhlcBar[],
): QuarterlyEarningsRow[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const quarterly = Array.isArray(obj.quarterlyEarnings)
    ? (obj.quarterlyEarnings as Array<Record<string, unknown>>)
    : [];
  if (!quarterly.length) return [];

  // AV returns most-recent first. Take last 6 with reportedDate present.
  const completed = quarterly
    .filter((q) => typeof q.reportedDate === "string" && q.reportedDate)
    .slice(0, 6);

  return completed.map((q) => {
    const reportedDate = String(q.reportedDate || "").slice(0, 10);
    const estimatedEPS = numOrNull(q.estimatedEPS);
    const reportedEPS = numOrNull(q.reportedEPS);
    let surpriseAbs: number | null = null;
    let surprisePct: number | null = null;
    let beat: QuarterlyEarningsRow["beat"] = "unknown";
    if (estimatedEPS != null && reportedEPS != null) {
      const diff = reportedEPS - estimatedEPS;
      surpriseAbs = round4(diff);
      if (Math.abs(estimatedEPS) > 1e-6) {
        surprisePct = round2((diff) / Math.abs(estimatedEPS) * 100);
      }
      if (diff > 0.005) beat = "beat";
      else if (diff < -0.005) beat = "miss";
      else beat = "in-line";
    }

    const reaction = computeEarningsDayReaction(reportedDate, bars);

    return {
      fiscalDateEnding: String(q.fiscalDateEnding || "").slice(0, 10),
      reportedDate,
      estimatedEPS,
      reportedEPS,
      surpriseAbs,
      surprisePct,
      beat,
      reactionPct: reaction.pct,
      reactionDate: reaction.date,
      reactionDirection: reaction.direction,
    };
  });
}

function extractNextEarningsDate(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const quarterly = Array.isArray(obj.quarterlyEarnings)
    ? (obj.quarterlyEarnings as Array<Record<string, unknown>>)
    : [];
  // Look for a row with reportedDate in the future or no reportedEPS but
  // with an estimatedEPS (AV occasionally includes the next estimate).
  const today = new Date().toISOString().slice(0, 10);
  for (const q of quarterly) {
    const rd = typeof q.reportedDate === "string" ? q.reportedDate.slice(0, 10) : "";
    if (rd && rd > today) return rd;
  }
  return null;
}

function computeEarningsDayReaction(
  reportedDate: string,
  bars: OhlcBar[],
): { pct: number | null; date: string | null; direction: QuarterlyEarningsRow["reactionDirection"] } {
  if (!reportedDate || !bars.length) return { pct: null, date: null, direction: "unknown" };
  // Find first bar whose date >= reportedDate. We use the close of the day
  // BEFORE reportedDate as baseline, and the close of the FIRST bar whose
  // date >= reportedDate as the reaction close. (AV typically reports
  // before-open or after-close — using day-of close vs prior close
  // captures the post-print session reaction in either case.)
  let idx = -1;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].date >= reportedDate) { idx = i; break; }
  }
  if (idx < 1) return { pct: null, date: null, direction: "unknown" };
  const prior = bars[idx - 1].close;
  const reactionBar = bars[idx];
  if (!Number.isFinite(prior) || prior <= 0) {
    return { pct: null, date: reactionBar.date, direction: "unknown" };
  }
  const pctRaw = ((reactionBar.close - prior) / prior) * 100;
  const pct = round2(pctRaw);
  let direction: QuarterlyEarningsRow["reactionDirection"] = "flat";
  if (pctRaw >= 1.5) direction = "gap-up";
  else if (pctRaw <= -1.5) direction = "gap-down";
  return { pct, date: reactionBar.date, direction };
}

/* ───────────── INCOME_STATEMENT parsing ───────────── */

function buildRevenueHistory(raw: unknown): QuarterlyRevenueRow[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const quarterly = Array.isArray(obj.quarterlyReports)
    ? (obj.quarterlyReports as Array<Record<string, unknown>>)
    : [];
  if (!quarterly.length) return [];

  // Sort newest first (AV usually does this already).
  const sorted = [...quarterly].sort((a, b) => {
    const da = String(a.fiscalDateEnding || "");
    const db = String(b.fiscalDateEnding || "");
    return db.localeCompare(da);
  });
  const window = sorted.slice(0, 8);

  return window.map((q, i) => {
    const totalRevenue = numOrNull(q.totalRevenue);
    const grossProfit = numOrNull(q.grossProfit);
    const operatingIncome = numOrNull(q.operatingIncome);
    const netIncome = numOrNull(q.netIncome);
    const operatingMarginPct = totalRevenue && operatingIncome != null && totalRevenue > 0
      ? round2((operatingIncome / totalRevenue) * 100)
      : null;

    // YoY: same quarter 4 reports back. QoQ: previous report.
    const prior = window[i + 1];
    const yoy = window[i + 4];
    const qoqGrowthPct = totalRevenue != null && prior && numOrNull(prior.totalRevenue)
      ? round2(((totalRevenue - (numOrNull(prior.totalRevenue) || 0)) / (numOrNull(prior.totalRevenue) || 1)) * 100)
      : null;
    const yoyGrowthPct = totalRevenue != null && yoy && numOrNull(yoy.totalRevenue)
      ? round2(((totalRevenue - (numOrNull(yoy.totalRevenue) || 0)) / (numOrNull(yoy.totalRevenue) || 1)) * 100)
      : null;

    return {
      fiscalDateEnding: String(q.fiscalDateEnding || "").slice(0, 10),
      totalRevenue,
      yoyGrowthPct,
      qoqGrowthPct,
      grossProfit,
      operatingIncome,
      netIncome,
      operatingMarginPct,
    };
  });
}

/* ───────────── Reaction stats ───────────── */

function computeReactionStats(history: QuarterlyEarningsRow[]): EarningsHistorySnapshot["reactionStats"] {
  const reactions = history
    .map((h) => h.reactionPct)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const beats = history.filter((h) => h.beat === "beat");
  const misses = history.filter((h) => h.beat === "miss");
  const inLine = history.filter((h) => h.beat === "in-line");

  if (!reactions.length) {
    return {
      sampleSize: 0,
      avgAbsMovePct: null,
      medianAbsMovePct: null,
      avgSignedMovePct: null,
      largestUpPct: null,
      largestDownPct: null,
      beatCount: beats.length,
      missCount: misses.length,
      inLineCount: inLine.length,
      avgReactionOnBeatPct: null,
      avgReactionOnMissPct: null,
    };
  }

  const abs = reactions.map((v) => Math.abs(v));
  const sortedAbs = [...abs].sort((a, b) => a - b);
  const median = sortedAbs.length % 2 === 1
    ? sortedAbs[Math.floor(sortedAbs.length / 2)]
    : (sortedAbs[sortedAbs.length / 2 - 1] + sortedAbs[sortedAbs.length / 2]) / 2;

  const beatReactions = beats
    .map((b) => b.reactionPct)
    .filter((v): v is number => v != null);
  const missReactions = misses
    .map((m) => m.reactionPct)
    .filter((v): v is number => v != null);

  return {
    sampleSize: reactions.length,
    avgAbsMovePct: round2(mean(abs)),
    medianAbsMovePct: round2(median),
    avgSignedMovePct: round2(mean(reactions)),
    largestUpPct: round2(Math.max(...reactions)),
    largestDownPct: round2(Math.min(...reactions)),
    beatCount: beats.length,
    missCount: misses.length,
    inLineCount: inLine.length,
    avgReactionOnBeatPct: beatReactions.length ? round2(mean(beatReactions)) : null,
    avgReactionOnMissPct: missReactions.length ? round2(mean(missReactions)) : null,
  };
}

/* ───────────── Serialization for prompt ───────────── */

export function serializeEarningsHistory(s: EarningsHistorySnapshot): string {
  const L: string[] = [];
  L.push(`TICKER: ${s.ticker}`);
  L.push(`GENERATED_AT: ${s.generatedAt}`);
  L.push(`STATUS: ${s.status}`);
  L.push(`COMPANY: ${s.companyName ?? "n/a"} (${s.sector ?? "n/a"} / ${s.industry ?? "n/a"})`);
  L.push(`MARKET_CAP_USD: ${fmtNum(s.marketCap)}`);
  L.push(`LAST_CLOSE: ${fmtNum(s.lastClose)} on ${s.lastBarDate ?? "n/a"}`);
  L.push(`FORWARD_PE: ${fmtNum(s.forwardPE)} | TRAILING_PE: ${fmtNum(s.trailingPE)} | TRAILING_EPS: ${fmtNum(s.trailingEPS)}`);
  L.push(`REPORTED_BETA: ${fmtNum(s.reportedBeta)} | ANALYST_TARGET: ${fmtNum(s.analystTargetPrice)}`);
  L.push(`QUARTERLY_EPS_GROWTH_YOY_PCT: ${fmtNum(s.quarterlyEPSGrowthYoYPct)}`);
  L.push(`QUARTERLY_REVENUE_GROWTH_YOY_PCT: ${fmtNum(s.quarterlyRevenueGrowthYoYPct)}`);
  L.push(`NEXT_EARNINGS_DATE_AV: ${s.nextEarningsDateAV ?? "not-published-by-AV"}`);
  L.push("");

  L.push("EARNINGS_HISTORY (most recent first; reactionPct = close-to-next-close % gap on/after report):");
  if (!s.earningsHistory.length) {
    L.push("  (none — endpoint returned no completed quarterly rows)");
  } else {
    for (const q of s.earningsHistory) {
      L.push(`  ${q.reportedDate ?? "?"} | period ${q.fiscalDateEnding} | est ${fmtNum(q.estimatedEPS)} | act ${fmtNum(q.reportedEPS)} | surprise ${fmtNum(q.surpriseAbs)} (${fmtPct(q.surprisePct)}) | ${q.beat} | reaction ${fmtPct(q.reactionPct)} (${q.reactionDirection})`);
    }
  }
  L.push("");

  L.push("REVENUE_HISTORY (most recent first, last 8 quarters):");
  if (!s.revenueHistory.length) {
    L.push("  (none)");
  } else {
    for (const r of s.revenueHistory) {
      L.push(`  ${r.fiscalDateEnding} | rev ${fmtNum(r.totalRevenue)} | YoY ${fmtPct(r.yoyGrowthPct)} | QoQ ${fmtPct(r.qoqGrowthPct)} | opMargin ${fmtPct(r.operatingMarginPct)} | netIncome ${fmtNum(r.netIncome)}`);
    }
  }
  L.push("");

  const rs = s.reactionStats;
  L.push("REACTION_STATS:");
  L.push(`  sample_size: ${rs.sampleSize}`);
  L.push(`  avg_abs_move_pct: ${fmtPct(rs.avgAbsMovePct)}`);
  L.push(`  median_abs_move_pct: ${fmtPct(rs.medianAbsMovePct)}`);
  L.push(`  avg_signed_move_pct: ${fmtPct(rs.avgSignedMovePct)}`);
  L.push(`  largest_up_pct: ${fmtPct(rs.largestUpPct)}`);
  L.push(`  largest_down_pct: ${fmtPct(rs.largestDownPct)}`);
  L.push(`  beat/miss/in-line: ${rs.beatCount}/${rs.missCount}/${rs.inLineCount}`);
  L.push(`  avg_reaction_on_beat_pct: ${fmtPct(rs.avgReactionOnBeatPct)}`);
  L.push(`  avg_reaction_on_miss_pct: ${fmtPct(rs.avgReactionOnMissPct)}`);
  L.push("");

  L.push("ENDPOINT_STATUS:");
  for (const [k, v] of Object.entries(s.endpointStatus)) L.push(`  ${k}: ${v}`);
  L.push("");
  L.push("OPTIONS_IV (ATM straddle for expiry on/after earnings; null when unavailable):");
  if (s.optionsIV && s.optionsIV.available) {
    L.push(`  available: true`);
    L.push(`  source: ${s.optionsIV.source}`);
    L.push(`  expiry: ${s.optionsIV.expiry} (DTE ${s.optionsIV.daysToExpiry})`);
    L.push(`  underlying: ${fmtNum(s.optionsIV.underlying)} | atm_strike: ${fmtNum(s.optionsIV.atmStrike)}`);
    L.push(`  atm_call_mark: ${fmtNum(s.optionsIV.atmCallMark)} | atm_put_mark: ${fmtNum(s.optionsIV.atmPutMark)}`);
    L.push(`  atm_call_iv: ${fmtNum(s.optionsIV.atmCallIV)} | atm_put_iv: ${fmtNum(s.optionsIV.atmPutIV)}`);
    L.push(`  implied_move_pct: ${fmtPct(s.optionsIV.impliedMovePct)}`);
  } else {
    L.push(`  available: false`);
    L.push(`  reason: ${s.optionsIV?.reason ?? "not-fetched"}`);
  }
  if (s.errors.length) {
    L.push("");
    L.push("ERRORS:");
    for (const e of s.errors) L.push(`  - ${e}`);
  }
  L.push("");
  L.push("MISSING_FIELDS (cannot be fabricated):");
  for (const m of s.missingFields) L.push(`  - ${m}`);

  return L.join("\n");
}

/* ───────────── Helpers ───────────── */

async function avCall(
  apiKey: string,
  fn: string,
  symbol: string,
): Promise<{ status: "ok" | "rate-limited" | "error" | "missing"; body: unknown; error?: string }> {
  const url = `${AV_BASE}?function=${encodeURIComponent(fn)}&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const j = await avFetchAdmin<Record<string, unknown> | null>(url, `${fn} ${symbol}`);
    if (!j) return { status: "missing", body: null, error: "no data" };
    if (typeof j["Note"] === "string" || typeof j["Information"] === "string") {
      const note = String(j["Note"] || j["Information"]);
      if (/limit|frequency|quota|premium/i.test(note)) {
        return { status: "rate-limited", body: null, error: note.slice(0, 240) };
      }
    }
    if (Object.keys(j).length === 0) {
      return { status: "missing", body: null, error: "empty response" };
    }
    return { status: "ok", body: j };
  } catch (e) {
    return { status: "error", body: null, error: e instanceof Error ? e.message : "fetch_failed" };
  }
}

function emptySnapshot(
  ticker: string,
  generatedAt: string,
  errors: string[],
  baseMissing: string[],
): EarningsHistorySnapshot {
  return {
    ticker,
    generatedAt,
    status: "error",
    companyName: null, sector: null, industry: null,
    marketCap: null, forwardPE: null, trailingPE: null, reportedBeta: null,
    nextEarningsDateAV: null, analystTargetPrice: null,
    trailingEPS: null,
    quarterlyEPSGrowthYoYPct: null, quarterlyRevenueGrowthYoYPct: null,
    lastClose: null, lastBarDate: null,
    earningsHistory: [], revenueHistory: [],
    reactionStats: {
      sampleSize: 0, avgAbsMovePct: null, medianAbsMovePct: null,
      avgSignedMovePct: null, largestUpPct: null, largestDownPct: null,
      beatCount: 0, missCount: 0, inLineCount: 0,
      avgReactionOnBeatPct: null, avgReactionOnMissPct: null,
    },
    missingFields: baseMissing,
    endpointStatus: {},
    errors,
    optionsIV: null,
  };
}

function pickStr(o: Record<string, unknown> | null | undefined, k: string): string | null {
  if (!o) return null;
  const v = o[k];
  if (typeof v === "string" && v && v !== "None" && v !== "-") return v;
  return null;
}
function pickNum(o: Record<string, unknown> | null | undefined, k: string): number | null {
  if (!o) return null;
  const v = o[k];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    if (v === "None" || v === "-" || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function pctOrNull(v: number | null): number | null {
  if (v == null) return null;
  // AV returns growth as decimal (0.12 = 12%). Convert if abs < 5.
  return Math.abs(v) < 5 ? round2(v * 100) : round2(v);
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
