/**
 * D.E. Shaw-style options strategy architect (admin only).
 *
 * REAL chain edition — pulls AV HISTORICAL_OPTIONS (EOD, T-1)
 * which returns the full option chain with REAL bid/ask, IV, delta,
 * gamma, theta, vega, rho, volume, and open interest per contract.
 *
 * Pipeline:
 *   1. AV TIME_SERIES_DAILY  → underlying spot + HV20/HV60/ATR/52w
 *   2. AV HISTORICAL_OPTIONS → full chain (~3000 rows for liquid names)
 *   3. AV OVERVIEW           → dividend yield (informational)
 *   4. Group chain by expiration, pick the expiry closest to targetDte
 *   5. For each strategy template (covered call, CSP, vertical spreads,
 *      straddle, strangle, iron condor, protective put, collar):
 *        select strikes by |delta| from the real chain (ATM ≈0.50,
 *        OTM1 ≈0.30, OTM2 ≈0.16), build legs from REAL contracts,
 *        compute net debit/credit from mid prices, position Greeks
 *        from real per-contract Greeks, max P/L / breakeven / POP.
 *
 * Data freshness: chain is END-OF-DAY (T-1). Live re-pricing required
 * before order entry — surfaced clearly in the memo.
 */

import { fetchDailyOhlcv, type OhlcBar } from "./priceSeries";
import { avFetchAdmin } from "@/lib/avRateGovernor";

const AV_BASE = "https://www.alphavantage.co/query";

export type StrategyCategory =
  | "covered-call"
  | "cash-secured-put"
  | "bull-call-spread"
  | "bear-put-spread"
  | "bull-put-spread"
  | "bear-call-spread"
  | "long-straddle"
  | "long-strangle"
  | "iron-condor"
  | "protective-put"
  | "collar";

export type Outlook = "bullish" | "bearish" | "neutral" | "volatile";

export interface OptionContract {
  contractID: string;
  type: "call" | "put";
  expiration: string;         // YYYY-MM-DD
  dte: number;                // days from chain-asOf date
  strike: number;
  bid: number;
  ask: number;
  mid: number;                // (bid+ask)/2  (falls back to mark/last if bid==0)
  mark: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;  // decimal (e.g. 0.32 = 32%)
  delta: number;
  gamma: number;
  theta: number;              // per-day per AV
  vega: number;               // per 1% IV change per AV
  rho: number;
  spreadPct: number | null;   // (ask-bid)/mid × 100
  liquidity: "high" | "ok" | "thin" | "no-quote";
}

export interface OptionLeg {
  side: "long" | "short";
  contract: OptionContract;
  qty: number;
}

export interface StrategyCandidate {
  category: StrategyCategory;
  description: string;
  fits: Outlook[];
  legs: OptionLeg[];
  netCreditPerShare: number;        // positive = credit, negative = debit
  maxProfitPerShare: number | null; // null = unlimited
  maxLossPerShare: number | null;
  breakevens: number[];
  marginEstimatePerShare: number;
  probabilityOfProfitPct: number | null;
  netGreeks: { delta: number; gamma: number; theta: number; vega: number };
  worstLiquidity: OptionContract["liquidity"];
  avgSpreadPct: number | null;
  rationale: string;
}

export interface OptionsSnapshot {
  generatedAt: string;
  ticker: string;
  status: "ok" | "missing-data" | "error";
  error: string | null;

  spot: number | null;
  lastBarDate: string | null;
  hv20Pct: number | null;
  hv60Pct: number | null;
  hv252Pct: number | null;
  atr14: number | null;
  high52w: number | null;
  low52w: number | null;
  distFrom52wHighPct: number | null;
  distFrom52wLowPct: number | null;
  dividendYieldPct: number;

  chainAsOfDate: string | null;
  chainContractCount: number;
  chainExpirations: string[];
  selectedExpiration: string | null;
  selectedExpirationDte: number | null;
  atmIVPct: number | null;
  ivSkew25dPct: number | null;
  expirationAvgOI: number | null;

  candidates: StrategyCandidate[];

  missingFields: string[];
  errors: string[];
}

/* ───────────── Public entry ───────────── */

export async function buildOptionsSnapshot(
  rawTicker: string,
  outlook: Outlook,
  targetDte: number,
): Promise<OptionsSnapshot> {
  const ticker = rawTicker.trim().toUpperCase();
  const generatedAt = new Date().toISOString();
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  const snap: OptionsSnapshot = {
    generatedAt, ticker, status: "ok", error: null,
    spot: null, lastBarDate: null,
    hv20Pct: null, hv60Pct: null, hv252Pct: null,
    atr14: null, high52w: null, low52w: null,
    distFrom52wHighPct: null, distFrom52wLowPct: null,
    dividendYieldPct: 0,
    chainAsOfDate: null, chainContractCount: 0, chainExpirations: [],
    selectedExpiration: null, selectedExpirationDte: null,
    atmIVPct: null, ivSkew25dPct: null, expirationAvgOI: null,
    candidates: [],
    missingFields: [],
    errors: [],
  };

  if (!apiKey) {
    snap.status = "error";
    snap.error = "ALPHA_VANTAGE_API_KEY missing";
    snap.missingFields.push("api-key");
    return snap;
  }

  const [dailyRes, chainRes, overviewRes] = await Promise.all([
    fetchDailyOhlcv(ticker),
    fetchHistoricalOptions(ticker, apiKey),
    fetchOverview(ticker, apiKey),
  ]);

  if (dailyRes.status !== "ok") {
    snap.status = dailyRes.status === "rate-limited" ? "missing-data" : "error";
    snap.error = dailyRes.error || dailyRes.status;
    snap.errors.push(`daily: ${snap.error}`);
    snap.missingFields.push("underlying-price-series");
    return snap;
  }

  const bars = dailyRes.bars;
  if (bars.length < 30) {
    snap.status = "missing-data";
    snap.error = "insufficient price history (<30 bars)";
    snap.errors.push(snap.error);
    return snap;
  }

  const last = bars[bars.length - 1];
  snap.spot = last.close;
  snap.lastBarDate = last.date;
  snap.hv20Pct = annualisedHv(bars.slice(-21));
  snap.hv60Pct = bars.length >= 61 ? annualisedHv(bars.slice(-61)) : null;
  snap.hv252Pct = bars.length >= 253 ? annualisedHv(bars.slice(-253)) : null;
  snap.atr14 = bars.length >= 15 ? atr(bars.slice(-15)) : null;
  const last260 = bars.slice(-260);
  snap.high52w = Math.max(...last260.map((b) => b.high));
  snap.low52w = Math.min(...last260.map((b) => b.low));
  snap.distFrom52wHighPct = round2(((last.close - snap.high52w) / snap.high52w) * 100);
  snap.distFrom52wLowPct = round2(((last.close - snap.low52w) / snap.low52w) * 100);

  if (overviewRes.status === "ok" && overviewRes.body) {
    const dy = Number(overviewRes.body.DividendYield);
    if (Number.isFinite(dy) && dy >= 0) snap.dividendYieldPct = round2(dy * 100);
  } else {
    snap.missingFields.push(`overview:${overviewRes.status}`);
  }

  if (chainRes.status !== "ok") {
    snap.status = "missing-data";
    snap.error = `options chain: ${chainRes.error || chainRes.status}`;
    snap.errors.push(snap.error);
    snap.missingFields.push(`historical-options:${chainRes.status}`);
    return snap;
  }

  const contracts = chainRes.contracts;
  if (contracts.length === 0) {
    snap.status = "missing-data";
    snap.error = "options chain returned 0 contracts";
    snap.errors.push(snap.error);
    return snap;
  }
  snap.chainAsOfDate = chainRes.asOfDate;
  snap.chainContractCount = contracts.length;
  const asOf = chainRes.asOfDate ? new Date(chainRes.asOfDate) : new Date(last.date);

  // Annotate dte / mid / spread / liquidity on every contract.
  for (const c of contracts) {
    c.dte = daysBetween(asOf, new Date(c.expiration));
    c.mid = c.bid > 0 && c.ask > 0 ? round2((c.bid + c.ask) / 2)
          : c.mark > 0 ? c.mark
          : c.last > 0 ? c.last
          : 0;
    c.spreadPct = c.mid > 0 && c.ask > 0 && c.bid >= 0
      ? round2(((c.ask - c.bid) / c.mid) * 100)
      : null;
    c.liquidity =
      c.openInterest >= 500 && (c.spreadPct ?? 999) < 5 ? "high"
      : c.openInterest >= 100 ? "ok"
      : c.openInterest > 0 ? "thin"
      : "no-quote";
  }

  // Available expirations after asOf.
  const expSet = new Set<string>();
  for (const c of contracts) if (c.dte > 0) expSet.add(c.expiration);
  snap.chainExpirations = Array.from(expSet).sort();

  const chosenExp = pickExpiration(snap.chainExpirations, asOf, targetDte);
  if (!chosenExp) {
    snap.status = "missing-data";
    snap.error = "no expirations after chain-asOf date";
    snap.errors.push(snap.error);
    return snap;
  }
  snap.selectedExpiration = chosenExp;
  snap.selectedExpirationDte = daysBetween(asOf, new Date(chosenExp));

  const expContracts = contracts.filter((c) => c.expiration === chosenExp);
  const calls = expContracts.filter((c) => c.type === "call").sort((a, b) => a.strike - b.strike);
  const puts = expContracts.filter((c) => c.type === "put").sort((a, b) => a.strike - b.strike);

  if (calls.length < 3 || puts.length < 3) {
    snap.status = "missing-data";
    snap.error = `expiration ${chosenExp} has too few strikes (${calls.length}c / ${puts.length}p)`;
    snap.errors.push(snap.error);
    return snap;
  }

  const atmCall = nearestByStrike(calls, snap.spot!);
  const atmPut = nearestByStrike(puts, snap.spot!);
  if (atmCall && atmPut) {
    snap.atmIVPct = round2(((atmCall.impliedVolatility + atmPut.impliedVolatility) / 2) * 100);
  }
  const skewCall = nearestByDelta(calls, 0.25);
  const skewPut = nearestByDelta(puts, -0.25);
  if (skewCall && skewPut) {
    snap.ivSkew25dPct = round2((skewPut.impliedVolatility - skewCall.impliedVolatility) * 100);
  }
  snap.expirationAvgOI = round0(
    expContracts.reduce((s, c) => s + c.openInterest, 0) / expContracts.length,
  );

  snap.candidates = buildCandidates({ spot: snap.spot!, calls, puts, outlook });

  if (snap.candidates.length === 0) {
    snap.status = "missing-data";
    snap.error = "no strategies could be constructed (no strikes at target deltas)";
    snap.errors.push(snap.error);
  }

  return snap;
}

/* ───────────── Strike picking ───────────── */

function nearestByStrike(arr: OptionContract[], target: number): OptionContract | null {
  if (!arr.length) return null;
  let best = arr[0], bestD = Math.abs(arr[0].strike - target);
  for (const c of arr) {
    const d = Math.abs(c.strike - target);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

function nearestByDelta(arr: OptionContract[], targetDelta: number): OptionContract | null {
  const cands = arr.filter((c) =>
    Number.isFinite(c.delta) && (c.bid + c.ask) > 0,
  );
  if (!cands.length) return null;
  let best = cands[0], bestD = Math.abs(cands[0].delta - targetDelta);
  for (const c of cands) {
    const d = Math.abs(c.delta - targetDelta);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

/* ───────────── Strategy construction (REAL contracts) ───────────── */

interface BuildCandidatesArgs {
  spot: number;
  calls: OptionContract[];
  puts: OptionContract[];
  outlook: Outlook;
}

function buildCandidates(a: BuildCandidatesArgs): StrategyCandidate[] {
  const { spot, calls, puts } = a;

  const atmCall = nearestByDelta(calls, 0.50);
  const otm30Call = nearestByDelta(calls, 0.30);
  const otm16Call = nearestByDelta(calls, 0.16);
  const atmPut = nearestByDelta(puts, -0.50);
  const otm30Put = nearestByDelta(puts, -0.30);
  const otm16Put = nearestByDelta(puts, -0.16);

  const cands: StrategyCandidate[] = [];

  // Covered call (short OTM30 call, assume operator owns 100 shares).
  if (otm30Call) {
    const sc: OptionLeg = { side: "short", contract: otm30Call, qty: 1 };
    const net = otm30Call.mid;
    const K = otm30Call.strike;
    cands.push({
      category: "covered-call",
      description: `Long 100 shares + short 1 call @ $${K} (${otm30Call.dte}d)`,
      fits: ["neutral", "bullish"],
      legs: [sc],
      netCreditPerShare: round2(net),
      maxProfitPerShare: round2((K - spot) + net),
      maxLossPerShare: round2(spot - net),
      breakevens: [round2(spot - net)],
      marginEstimatePerShare: spot,
      probabilityOfProfitPct: round2(100 - Math.abs(otm30Call.delta) * 100),
      netGreeks: aggregateGreeks([sc]),
      worstLiquidity: otm30Call.liquidity,
      avgSpreadPct: otm30Call.spreadPct,
      rationale: `Income on owned stock. Short ${(otm30Call.delta * 100).toFixed(0)}Δ call @ $${K} caps upside, collects $${net.toFixed(2)} credit, reduces breakeven to $${(spot - net).toFixed(2)}.`,
    });
  }

  // Cash-secured put.
  if (otm30Put) {
    const sp: OptionLeg = { side: "short", contract: otm30Put, qty: 1 };
    const net = otm30Put.mid;
    const K = otm30Put.strike;
    cands.push({
      category: "cash-secured-put",
      description: `Short 1 put @ $${K} (${otm30Put.dte}d), cash-secured`,
      fits: ["neutral", "bullish"],
      legs: [sp],
      netCreditPerShare: round2(net),
      maxProfitPerShare: round2(net),
      maxLossPerShare: round2(K - net),
      breakevens: [round2(K - net)],
      marginEstimatePerShare: K,
      probabilityOfProfitPct: round2(100 - Math.abs(otm30Put.delta) * 100),
      netGreeks: aggregateGreeks([sp]),
      worstLiquidity: otm30Put.liquidity,
      avgSpreadPct: otm30Put.spreadPct,
      rationale: `Get paid $${net.toFixed(2)} to potentially buy at $${K}. Profits if price stays above $${(K - net).toFixed(2)} at expiry.`,
    });
  }

  // Bull call spread.
  if (atmCall && otm30Call && otm30Call.strike > atmCall.strike) {
    const lc: OptionLeg = { side: "long", contract: atmCall, qty: 1 };
    const sc: OptionLeg = { side: "short", contract: otm30Call, qty: 1 };
    const net = -atmCall.mid + otm30Call.mid;
    const width = otm30Call.strike - atmCall.strike;
    const be = atmCall.strike + (-net);
    cands.push({
      category: "bull-call-spread",
      description: `Long ${atmCall.strike}c / short ${otm30Call.strike}c (${atmCall.dte}d)`,
      fits: ["bullish"],
      legs: [lc, sc],
      netCreditPerShare: round2(net),
      maxProfitPerShare: round2(width + net),
      maxLossPerShare: round2(-net),
      breakevens: [round2(be)],
      marginEstimatePerShare: Math.abs(net),
      probabilityOfProfitPct: round2(probAboveFromIV(spot, be, atmCall.dte, atmCall.impliedVolatility)),
      netGreeks: aggregateGreeks([lc, sc]),
      worstLiquidity: weakest([atmCall, otm30Call]),
      avgSpreadPct: avgSpread([atmCall, otm30Call]),
      rationale: `Defined-risk bullish. Pay $${(-net).toFixed(2)} debit, target ${otm30Call.strike}. Max profit $${(width + net).toFixed(2)} if stock ≥ ${otm30Call.strike} at expiry.`,
    });
  }

  // Bear put spread.
  if (atmPut && otm30Put && otm30Put.strike < atmPut.strike) {
    const lp: OptionLeg = { side: "long", contract: atmPut, qty: 1 };
    const sp: OptionLeg = { side: "short", contract: otm30Put, qty: 1 };
    const net = -atmPut.mid + otm30Put.mid;
    const width = atmPut.strike - otm30Put.strike;
    const be = atmPut.strike - (-net);
    cands.push({
      category: "bear-put-spread",
      description: `Long ${atmPut.strike}p / short ${otm30Put.strike}p (${atmPut.dte}d)`,
      fits: ["bearish"],
      legs: [lp, sp],
      netCreditPerShare: round2(net),
      maxProfitPerShare: round2(width + net),
      maxLossPerShare: round2(-net),
      breakevens: [round2(be)],
      marginEstimatePerShare: Math.abs(net),
      probabilityOfProfitPct: round2(probBelowFromIV(spot, be, atmPut.dte, atmPut.impliedVolatility)),
      netGreeks: aggregateGreeks([lp, sp]),
      worstLiquidity: weakest([atmPut, otm30Put]),
      avgSpreadPct: avgSpread([atmPut, otm30Put]),
      rationale: `Defined-risk bearish. Pay $${(-net).toFixed(2)} debit. Max profit $${(width + net).toFixed(2)} if stock ≤ ${otm30Put.strike} at expiry.`,
    });
  }

  // Bull put credit spread.
  if (otm30Put && otm16Put && otm16Put.strike < otm30Put.strike) {
    const sp: OptionLeg = { side: "short", contract: otm30Put, qty: 1 };
    const lp: OptionLeg = { side: "long", contract: otm16Put, qty: 1 };
    const net = otm30Put.mid - otm16Put.mid;
    const width = otm30Put.strike - otm16Put.strike;
    const be = otm30Put.strike - net;
    cands.push({
      category: "bull-put-spread",
      description: `Short ${otm30Put.strike}p / long ${otm16Put.strike}p credit spread (${otm30Put.dte}d)`,
      fits: ["neutral", "bullish"],
      legs: [sp, lp],
      netCreditPerShare: round2(net),
      maxProfitPerShare: round2(net),
      maxLossPerShare: round2(width - net),
      breakevens: [round2(be)],
      marginEstimatePerShare: width - net,
      probabilityOfProfitPct: round2(probAboveFromIV(spot, be, otm30Put.dte, otm30Put.impliedVolatility)),
      netGreeks: aggregateGreeks([sp, lp]),
      worstLiquidity: weakest([otm30Put, otm16Put]),
      avgSpreadPct: avgSpread([otm30Put, otm16Put]),
      rationale: `Credit spread. Collect $${net.toFixed(2)}, risk $${(width - net).toFixed(2)}. Profits if stock stays above $${be.toFixed(2)}.`,
    });
  }

  // Bear call credit spread.
  if (otm30Call && otm16Call && otm16Call.strike > otm30Call.strike) {
    const sc: OptionLeg = { side: "short", contract: otm30Call, qty: 1 };
    const lc: OptionLeg = { side: "long", contract: otm16Call, qty: 1 };
    const net = otm30Call.mid - otm16Call.mid;
    const width = otm16Call.strike - otm30Call.strike;
    const be = otm30Call.strike + net;
    cands.push({
      category: "bear-call-spread",
      description: `Short ${otm30Call.strike}c / long ${otm16Call.strike}c credit spread (${otm30Call.dte}d)`,
      fits: ["neutral", "bearish"],
      legs: [sc, lc],
      netCreditPerShare: round2(net),
      maxProfitPerShare: round2(net),
      maxLossPerShare: round2(width - net),
      breakevens: [round2(be)],
      marginEstimatePerShare: width - net,
      probabilityOfProfitPct: round2(probBelowFromIV(spot, be, otm30Call.dte, otm30Call.impliedVolatility)),
      netGreeks: aggregateGreeks([sc, lc]),
      worstLiquidity: weakest([otm30Call, otm16Call]),
      avgSpreadPct: avgSpread([otm30Call, otm16Call]),
      rationale: `Credit spread. Collect $${net.toFixed(2)}, risk $${(width - net).toFixed(2)}. Profits if stock stays below $${be.toFixed(2)}.`,
    });
  }

  // Long straddle.
  if (atmCall && atmPut) {
    const lc: OptionLeg = { side: "long", contract: atmCall, qty: 1 };
    const lp: OptionLeg = { side: "long", contract: atmPut, qty: 1 };
    const net = -(atmCall.mid + atmPut.mid);
    const K = (atmCall.strike + atmPut.strike) / 2;
    const loBe = K - (-net), hiBe = K + (-net);
    cands.push({
      category: "long-straddle",
      description: `Long ${atmCall.strike}c + long ${atmPut.strike}p (${atmCall.dte}d)`,
      fits: ["volatile"],
      legs: [lc, lp],
      netCreditPerShare: round2(net),
      maxProfitPerShare: null,
      maxLossPerShare: round2(-net),
      breakevens: [round2(loBe), round2(hiBe)],
      marginEstimatePerShare: -net,
      probabilityOfProfitPct: round2(probOutsideFromIV(spot, loBe, hiBe, atmCall.dte, atmCall.impliedVolatility)),
      netGreeks: aggregateGreeks([lc, lp]),
      worstLiquidity: weakest([atmCall, atmPut]),
      avgSpreadPct: avgSpread([atmCall, atmPut]),
      rationale: `Long-vol. Pay $${(-net).toFixed(2)} debit. Profits if realised move exceeds $${(-net).toFixed(2)} (BE $${loBe.toFixed(2)} / $${hiBe.toFixed(2)}).`,
    });
  }

  // Long strangle.
  if (otm30Call && otm30Put) {
    const lc: OptionLeg = { side: "long", contract: otm30Call, qty: 1 };
    const lp: OptionLeg = { side: "long", contract: otm30Put, qty: 1 };
    const net = -(otm30Call.mid + otm30Put.mid);
    const loBe = otm30Put.strike - (-net), hiBe = otm30Call.strike + (-net);
    cands.push({
      category: "long-strangle",
      description: `Long ${otm30Call.strike}c + long ${otm30Put.strike}p (${otm30Call.dte}d)`,
      fits: ["volatile"],
      legs: [lc, lp],
      netCreditPerShare: round2(net),
      maxProfitPerShare: null,
      maxLossPerShare: round2(-net),
      breakevens: [round2(loBe), round2(hiBe)],
      marginEstimatePerShare: -net,
      probabilityOfProfitPct: round2(probOutsideFromIV(spot, loBe, hiBe, otm30Call.dte, otm30Call.impliedVolatility)),
      netGreeks: aggregateGreeks([lc, lp]),
      worstLiquidity: weakest([otm30Call, otm30Put]),
      avgSpreadPct: avgSpread([otm30Call, otm30Put]),
      rationale: `Cheaper vol play than straddle. Wider BEs ($${loBe.toFixed(2)} / $${hiBe.toFixed(2)}), needs larger move.`,
    });
  }

  // Iron condor.
  if (otm30Put && otm16Put && otm30Call && otm16Call
      && otm16Put.strike < otm30Put.strike && otm16Call.strike > otm30Call.strike) {
    const sp: OptionLeg = { side: "short", contract: otm30Put, qty: 1 };
    const lp: OptionLeg = { side: "long", contract: otm16Put, qty: 1 };
    const sc: OptionLeg = { side: "short", contract: otm30Call, qty: 1 };
    const lc: OptionLeg = { side: "long", contract: otm16Call, qty: 1 };
    const net = otm30Put.mid - otm16Put.mid + otm30Call.mid - otm16Call.mid;
    const putWidth = otm30Put.strike - otm16Put.strike;
    const callWidth = otm16Call.strike - otm30Call.strike;
    const maxLoss = Math.max(putWidth, callWidth) - net;
    const loBe = otm30Put.strike - net, hiBe = otm30Call.strike + net;
    cands.push({
      category: "iron-condor",
      description: `Short ${otm30Put.strike}p/long ${otm16Put.strike}p + short ${otm30Call.strike}c/long ${otm16Call.strike}c (${otm30Put.dte}d)`,
      fits: ["neutral"],
      legs: [sp, lp, sc, lc],
      netCreditPerShare: round2(net),
      maxProfitPerShare: round2(net),
      maxLossPerShare: round2(maxLoss),
      breakevens: [round2(loBe), round2(hiBe)],
      marginEstimatePerShare: maxLoss,
      probabilityOfProfitPct: round2(probInsideFromIV(spot, loBe, hiBe, otm30Put.dte, otm30Put.impliedVolatility)),
      netGreeks: aggregateGreeks([sp, lp, sc, lc]),
      worstLiquidity: weakest([otm30Put, otm16Put, otm30Call, otm16Call]),
      avgSpreadPct: avgSpread([otm30Put, otm16Put, otm30Call, otm16Call]),
      rationale: `Range-bound. Collect $${net.toFixed(2)}, risk $${maxLoss.toFixed(2)}. Profits if stock stays in $${otm30Put.strike}-$${otm30Call.strike}.`,
    });
  }

  // Protective put.
  if (atmPut) {
    const lp: OptionLeg = { side: "long", contract: atmPut, qty: 1 };
    const net = -atmPut.mid;
    cands.push({
      category: "protective-put",
      description: `Long stock + long ${atmPut.strike}p (${atmPut.dte}d) — insurance`,
      fits: ["bullish", "neutral"],
      legs: [lp],
      netCreditPerShare: round2(net),
      maxProfitPerShare: null,
      maxLossPerShare: round2((spot - atmPut.strike) + (-net)),
      breakevens: [round2(spot + (-net))],
      marginEstimatePerShare: spot + (-net),
      probabilityOfProfitPct: round2(probAboveFromIV(spot, spot + (-net), atmPut.dte, atmPut.impliedVolatility)),
      netGreeks: aggregateGreeks([lp]),
      worstLiquidity: atmPut.liquidity,
      avgSpreadPct: atmPut.spreadPct,
      rationale: `Insurance on owned stock. Caps downside at $${atmPut.strike}, retains uncapped upside minus $${(-net).toFixed(2)} premium.`,
    });
  }

  // Collar.
  if (otm16Put && otm30Call) {
    const lp: OptionLeg = { side: "long", contract: otm16Put, qty: 1 };
    const sc: OptionLeg = { side: "short", contract: otm30Call, qty: 1 };
    const net = -otm16Put.mid + otm30Call.mid;
    cands.push({
      category: "collar",
      description: `Long stock + long ${otm16Put.strike}p + short ${otm30Call.strike}c (${otm16Put.dte}d)`,
      fits: ["neutral", "bullish"],
      legs: [lp, sc],
      netCreditPerShare: round2(net),
      maxProfitPerShare: round2((otm30Call.strike - spot) + net),
      maxLossPerShare: round2((spot - otm16Put.strike) - net),
      breakevens: [round2(spot - net)],
      marginEstimatePerShare: spot,
      probabilityOfProfitPct: round2(probAboveFromIV(spot, spot - net, otm16Put.dte, otm30Call.impliedVolatility)),
      netGreeks: aggregateGreeks([lp, sc]),
      worstLiquidity: weakest([otm16Put, otm30Call]),
      avgSpreadPct: avgSpread([otm16Put, otm30Call]),
      rationale: `Cost-reduced hedge. Floor at $${otm16Put.strike}, cap at $${otm30Call.strike}. Net ${net >= 0 ? "credit" : "debit"} $${Math.abs(net).toFixed(2)}.`,
    });
  }

  // Sort: outlook fit first, then POP desc.
  return cands.sort((x, y) => {
    const xFit = x.fits.includes(a.outlook) ? 0 : 1;
    const yFit = y.fits.includes(a.outlook) ? 0 : 1;
    if (xFit !== yFit) return xFit - yFit;
    return (y.probabilityOfProfitPct ?? 0) - (x.probabilityOfProfitPct ?? 0);
  });
}

/* ───────────── Aggregation helpers ───────────── */

function aggregateGreeks(legs: OptionLeg[]): StrategyCandidate["netGreeks"] {
  let d = 0, g = 0, t = 0, v = 0;
  for (const lg of legs) {
    const sign = lg.side === "long" ? 1 : -1;
    d += sign * lg.qty * lg.contract.delta;
    g += sign * lg.qty * lg.contract.gamma;
    t += sign * lg.qty * lg.contract.theta;
    v += sign * lg.qty * lg.contract.vega;
  }
  return { delta: round4(d), gamma: round6(g), theta: round4(t), vega: round4(v) };
}

function weakest(arr: OptionContract[]): OptionContract["liquidity"] {
  const order: OptionContract["liquidity"][] = ["high", "ok", "thin", "no-quote"];
  let worst: OptionContract["liquidity"] = "high";
  for (const c of arr) {
    if (order.indexOf(c.liquidity) > order.indexOf(worst)) worst = c.liquidity;
  }
  return worst;
}

function avgSpread(arr: OptionContract[]): number | null {
  const v = arr.map((c) => c.spreadPct).filter((s): s is number => s != null);
  if (!v.length) return null;
  return round2(v.reduce((a, b) => a + b, 0) / v.length);
}

/* ───────────── Probability helpers (lognormal, IV-based) ───────────── */

function probAboveFromIV(S: number, K: number, dte: number, ivDecimal: number): number {
  if (dte <= 0 || ivDecimal <= 0) return S > K ? 100 : 0;
  const t = dte / 365;
  const d2 = (Math.log(S / K) + (-0.5 * ivDecimal * ivDecimal) * t) / (ivDecimal * Math.sqrt(t));
  return N(d2) * 100;
}
function probBelowFromIV(S: number, K: number, dte: number, ivDecimal: number): number {
  return 100 - probAboveFromIV(S, K, dte, ivDecimal);
}
function probInsideFromIV(S: number, low: number, high: number, dte: number, iv: number): number {
  return Math.max(0, probAboveFromIV(S, low, dte, iv) - probAboveFromIV(S, high, dte, iv));
}
function probOutsideFromIV(S: number, low: number, high: number, dte: number, iv: number): number {
  return Math.max(0, 100 - probInsideFromIV(S, low, high, dte, iv));
}

/** Standard normal CDF (Abramowitz & Stegun 26.2.17). */
function N(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t1 = 1.0 / (1.0 + p * ax);
  const y = 1.0 - (((((a5 * t1 + a4) * t1) + a3) * t1 + a2) * t1 + a1) * t1 * Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}

/* ───────────── Stats / utilities ───────────── */

function annualisedHv(bars: OhlcBar[]): number | null {
  if (bars.length < 2) return null;
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const p0 = bars[i - 1].close, p1 = bars[i].close;
    if (p0 > 0 && p1 > 0) rets.push(Math.log(p1 / p0));
  }
  if (rets.length < 2) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return round2(Math.sqrt(variance) * Math.sqrt(252) * 100);
}

function atr(bars: OhlcBar[]): number | null {
  if (bars.length < 2) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], p = bars[i - 1];
    trs.push(Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)));
  }
  return round2(trs.reduce((a, b) => a + b, 0) / trs.length);
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86400000);
}

function pickExpiration(exps: string[], asOf: Date, targetDte: number): string | null {
  if (!exps.length) return null;
  let best: string | null = null, bestD = Infinity;
  for (const e of exps) {
    const dte = daysBetween(asOf, new Date(e));
    if (dte <= 0) continue;
    const d = Math.abs(dte - targetDte);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

function round0(v: number): number { return Math.round(v); }
function round2(v: number): number { return Math.round(v * 100) / 100; }
function round4(v: number): number { return Math.round(v * 10000) / 10000; }
function round6(v: number): number { return Math.round(v * 1000000) / 1000000; }

/* ───────────── AV fetchers ───────────── */

interface AvOptionsResponse {
  endpoint?: string;
  message?: string;
  data?: Array<Record<string, string>>;
  Note?: string;
  Information?: string;
}

async function fetchHistoricalOptions(
  symbol: string,
  apiKey: string,
): Promise<{ status: string; asOfDate: string | null; contracts: OptionContract[]; error?: string }> {
  const url = `${AV_BASE}?function=HISTORICAL_OPTIONS&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const j = await avFetchAdmin<AvOptionsResponse | null>(url, `HISTORICAL_OPTIONS ${symbol}`);
    if (!j) return { status: "missing", asOfDate: null, contracts: [], error: "no data" };
    if (j.Note || j.Information) {
      const msg = (j.Note || j.Information) as string;
      if (/limit|frequency|quota|premium/i.test(msg)) {
        return { status: "rate-limited", asOfDate: null, contracts: [], error: msg.slice(0, 240) };
      }
    }
    const data = Array.isArray(j.data) ? j.data : [];
    if (!data.length) return { status: "missing", asOfDate: null, contracts: [], error: j.message };
    const asOfDate = (data[0]?.date as string | undefined) ?? null;
    const contracts: OptionContract[] = [];
    for (const row of data) {
      const strike = Number(row.strike);
      if (!Number.isFinite(strike)) continue;
      const type = (row.type === "call" || row.type === "put") ? row.type : null;
      if (!type) continue;
      contracts.push({
        contractID: String(row.contractID || ""),
        type,
        expiration: String(row.expiration || ""),
        dte: 0,
        strike,
        bid: numOr0(row.bid),
        ask: numOr0(row.ask),
        mid: 0,
        mark: numOr0(row.mark),
        last: numOr0(row.last),
        volume: numOr0(row.volume),
        openInterest: numOr0(row.open_interest),
        impliedVolatility: numOr0(row.implied_volatility),
        delta: numOr0(row.delta),
        gamma: numOr0(row.gamma),
        theta: numOr0(row.theta),
        vega: numOr0(row.vega),
        rho: numOr0(row.rho),
        spreadPct: null,
        liquidity: "no-quote",
      });
    }
    return { status: "ok", asOfDate, contracts };
  } catch (e) {
    return { status: "error", asOfDate: null, contracts: [], error: e instanceof Error ? e.message : "fetch failed" };
  }
}

function numOr0(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function fetchOverview(symbol: string, apiKey: string): Promise<{ status: string; body: Record<string, string> | null }> {
  const url = `${AV_BASE}?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const j = await avFetchAdmin<Record<string, unknown> | null>(url, `OVERVIEW ${symbol}`);
    if (!j) return { status: "missing", body: null };
    if (typeof j.Note === "string" || typeof j.Information === "string") {
      const n = String(j.Note || j.Information);
      if (/limit|frequency|quota|premium/i.test(n)) return { status: "rate-limited", body: null };
    }
    if (!j.Symbol) return { status: "missing", body: null };
    return { status: "ok", body: j as Record<string, string> };
  } catch (e) {
    return { status: e instanceof Error ? e.message : "error", body: null };
  }
}

/* ───────────── Serialization for the LLM ───────────── */

export function serializeOptionsSnapshot(s: OptionsSnapshot): string {
  const L: string[] = [];
  L.push(`GENERATED_AT: ${s.generatedAt}`);
  L.push(`TICKER: ${s.ticker}  STATUS: ${s.status}${s.error ? `  ERROR: ${s.error}` : ""}`);
  L.push(`SPOT: ${s.spot ?? "n/a"}  (last EOD bar ${s.lastBarDate ?? "n/a"})`);
  L.push(`HV20: ${s.hv20Pct ?? "n/a"}%  HV60: ${s.hv60Pct ?? "n/a"}%  HV252: ${s.hv252Pct ?? "n/a"}%`);
  L.push(`ATR14: ${s.atr14 ?? "n/a"}  52w_high=${s.high52w ?? "n/a"} (dist=${s.distFrom52wHighPct ?? "n/a"}%)  52w_low=${s.low52w ?? "n/a"} (dist=${s.distFrom52wLowPct ?? "n/a"}%)`);
  L.push(`DIV_YIELD: ${s.dividendYieldPct}%`);
  L.push("");
  L.push(`OPTIONS_CHAIN (AV HISTORICAL_OPTIONS, end-of-day, asOf ${s.chainAsOfDate ?? "n/a"}):`);
  L.push(`  contracts_in_chain: ${s.chainContractCount}`);
  L.push(`  expirations_available: ${s.chainExpirations.length} (${s.chainExpirations.slice(0, 8).join(", ")}${s.chainExpirations.length > 8 ? ", ..." : ""})`);
  L.push(`  SELECTED_EXPIRATION: ${s.selectedExpiration ?? "n/a"} (DTE ${s.selectedExpirationDte ?? "n/a"})`);
  L.push(`  ATM_IV (real, from chain): ${s.atmIVPct ?? "n/a"}%`);
  L.push(`  25Δ_SKEW (put_IV − call_IV): ${s.ivSkew25dPct ?? "n/a"}%   (positive = downside hedge demand)`);
  L.push(`  expiration_avg_OI: ${s.expirationAvgOI ?? "n/a"}`);
  L.push("");
  if (s.missingFields.length) {
    L.push("MISSING_FIELDS:");
    for (const m of s.missingFields) L.push(`  - ${m}`);
    L.push("");
  }
  L.push("STRATEGY_CANDIDATES (built from REAL chain contracts):");
  for (const c of s.candidates) {
    L.push("");
    L.push(`  [${c.category}] ${c.description}`);
    L.push(`    fits: ${c.fits.join(",")}`);
    L.push(`    net: ${c.netCreditPerShare >= 0 ? "credit" : "debit"} $${Math.abs(c.netCreditPerShare).toFixed(2)}/sh ($${Math.abs(c.netCreditPerShare * 100).toFixed(2)}/contract)`);
    L.push(`    max_profit/sh: ${c.maxProfitPerShare == null ? "unlimited" : "$" + c.maxProfitPerShare.toFixed(2)}`);
    L.push(`    max_loss/sh:   ${c.maxLossPerShare == null ? "undefined" : "$" + c.maxLossPerShare.toFixed(2)}`);
    L.push(`    breakevens: ${c.breakevens.map((b) => "$" + b.toFixed(2)).join(", ")}`);
    L.push(`    margin/sh: $${c.marginEstimatePerShare.toFixed(2)}  POP: ${c.probabilityOfProfitPct?.toFixed(1) ?? "n/a"}%  (lognormal from chain IV)`);
    L.push(`    net_greeks: Δ=${c.netGreeks.delta} γ=${c.netGreeks.gamma} θ=${c.netGreeks.theta}/d ν=${c.netGreeks.vega}`);
    L.push(`    liquidity: worst=${c.worstLiquidity}  avg_spread=${c.avgSpreadPct ?? "n/a"}%`);
    L.push(`    legs (REAL contracts):`);
    for (const lg of c.legs) {
      const co = lg.contract;
      L.push(`      ${lg.side.toUpperCase()} ${co.contractID}  K=${co.strike} ${co.type} dte=${co.dte}  bid=$${co.bid.toFixed(2)}/ask=$${co.ask.toFixed(2)} (mid $${co.mid.toFixed(2)}, spread ${co.spreadPct ?? "n/a"}%)`);
      L.push(`        IV=${(co.impliedVolatility * 100).toFixed(2)}%  Δ=${co.delta.toFixed(3)} γ=${co.gamma.toFixed(4)} θ=${co.theta.toFixed(4)}/d ν=${co.vega.toFixed(3)} ρ=${co.rho.toFixed(3)}`);
      L.push(`        volume=${co.volume}  open_interest=${co.openInterest}  liquidity=${co.liquidity}`);
    }
    L.push(`    rationale: ${c.rationale}`);
  }
  return L.join("\n");
}
