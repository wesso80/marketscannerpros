/**
 * D.E. Shaw-style options strategy architect (admin only).
 *
 * AV free tier has NO options chain. So we:
 *   1. Pull TIME_SERIES_DAILY for the underlying (1 AV call)
 *   2. Pull TREASURY_YIELD 3-month for risk-free rate (1 AV call, may fail)
 *   3. Compute HV20 / HV60 / HV252 (annualised log-stdev × √252) locally
 *   4. Use HV20 as IV proxy (clearly flagged) for Black-Scholes pricing
 *   5. Generate candidate STRIKE LADDERS at +/-1σ, +/-2σ around spot
 *   6. Compute theoretical premium, Greeks, max P/L, breakeven, POP for
 *      each strategy template (covered call, CSP, vertical spreads,
 *      straddle, strangle, iron condor)
 *
 * HARD-LOCKED MISSING per data-integrity rules:
 *   - Real options chain (bid/ask/IV/OI/volume) — NOT in AV
 *   - Real implied volatility surface — we use HV20 as proxy
 *   - Real Greeks (we compute theoretical Black-Scholes, no smile)
 *   - Dividend yield (uses AV OVERVIEW DividendYield if available, else 0)
 *
 * Quota: 1 daily-series + 1 macro (optional) + 1 OVERVIEW = up to 3 calls.
 */

import { fetchDailyOhlcv, type OhlcBar } from "./priceSeries";
import { fetchWithTimeout } from "./fetchWithTimeout";

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

export interface OptionLeg {
  /** "call" or "put". */
  type: "call" | "put";
  /** "long" (we buy / debit) or "short" (we sell / credit). */
  side: "long" | "short";
  strike: number;
  /** Expiry in DTE (days to expiration). */
  dte: number;
  /** Black-Scholes theoretical mid premium per share (multiply ×100 for one contract). */
  premium: number;
  /** Greeks per share. */
  delta: number;
  gamma: number;
  theta: number;          // per day (decay)
  vega: number;           // per 1pp IV change
}

export interface StrategyCandidate {
  category: StrategyCategory;
  /** One-line plain-English description. */
  description: string;
  /** Underlying direction this fits. */
  fits: Outlook[];
  /** Legs (already populated with strikes / premia / Greeks). */
  legs: OptionLeg[];
  /** Premium received (positive) or paid (negative) per share. */
  netCreditPerShare: number;
  /** Per-share max profit / loss at expiration. */
  maxProfitPerShare: number | null;   // null = unlimited
  maxLossPerShare: number | null;     // null = undefined (rare)
  /** Breakeven price(s) at expiration. */
  breakevens: number[];
  /** Cash required to open one contract (notional / margin estimate, per share). */
  marginEstimatePerShare: number;
  /** Estimated probability of profit at expiration (computed from BS). */
  probabilityOfProfitPct: number | null;
  /** Net position Greeks. */
  netGreeks: { delta: number; gamma: number; theta: number; vega: number };
  /** Why this fits the operator's outlook. */
  rationale: string;
}

export interface OptionsSnapshot {
  generatedAt: string;
  ticker: string;
  status: "ok" | "missing-data" | "error";
  error: string | null;

  /** Underlying spot + history-derived inputs. */
  spot: number | null;
  lastBarDate: string | null;
  hv20Pct: number | null;        // annualised
  hv60Pct: number | null;
  hv252Pct: number | null;
  /** IV proxy used for pricing (HV20). NEVER claim as real IV. */
  ivProxyPct: number | null;
  /** Risk-free rate from 3M TREASURY_YIELD (or 4.5% fallback flagged). */
  riskFreeRatePct: number;
  riskFreeSource: "treasury-3m" | "fallback-4.5pct";
  /** Dividend yield from OVERVIEW (or 0 if missing). */
  dividendYieldPct: number;
  /** Atr14 + 52w hi/lo for stop-loss context. */
  atr14: number | null;
  high52w: number | null;
  low52w: number | null;
  distFrom52wHighPct: number | null;
  distFrom52wLowPct: number | null;

  /** Candidate strategies, pre-computed for each outlook. */
  candidates: StrategyCandidate[];

  missingFields: string[];
  errors: string[];
}

/* ───────────── Public entry ───────────── */

const HARD_MISSING = [
  "real-options-chain-bid-ask (no AV options endpoint)",
  "real-implied-volatility-surface (we use HV20 as proxy)",
  "real-greeks-with-iv-smile (we compute theoretical BS only)",
  "open-interest (no AV options endpoint)",
  "options-volume (no AV options endpoint)",
];

export interface BuildSnapshotOpts {
  /** DTE candidates to compute (we'll pick the closest to outlook timeHorizon). */
  dteList?: number[];
}

export async function buildOptionsSnapshot(
  rawTicker: string,
  outlook: Outlook,
  targetDte: number,
  opts: BuildSnapshotOpts = {},
): Promise<OptionsSnapshot> {
  const ticker = rawTicker.trim().toUpperCase();
  const generatedAt = new Date().toISOString();
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  const snap: OptionsSnapshot = {
    generatedAt, ticker, status: "ok", error: null,
    spot: null, lastBarDate: null,
    hv20Pct: null, hv60Pct: null, hv252Pct: null,
    ivProxyPct: null,
    riskFreeRatePct: 4.5, riskFreeSource: "fallback-4.5pct",
    dividendYieldPct: 0,
    atr14: null, high52w: null, low52w: null,
    distFrom52wHighPct: null, distFrom52wLowPct: null,
    candidates: [],
    missingFields: [...HARD_MISSING],
    errors: [],
  };

  if (!apiKey) {
    snap.status = "error";
    snap.error = "ALPHA_VANTAGE_API_KEY missing";
    snap.missingFields.push("api-key");
    return snap;
  }

  // Parallel: daily series + treasury 3m + overview (for dividend yield).
  const [dailyRes, treasury, overview] = await Promise.all([
    fetchDailyOhlcv(ticker),
    fetchTreasury3M(apiKey),
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
  snap.hv20Pct = annualisedHv(bars.slice(-21));   // 20 returns from 21 bars
  snap.hv60Pct = bars.length >= 61 ? annualisedHv(bars.slice(-61)) : null;
  snap.hv252Pct = bars.length >= 253 ? annualisedHv(bars.slice(-253)) : null;
  snap.ivProxyPct = snap.hv20Pct;
  snap.atr14 = bars.length >= 15 ? atr(bars.slice(-15)) : null;
  const last260 = bars.slice(-260);
  snap.high52w = Math.max(...last260.map((b) => b.high));
  snap.low52w = Math.min(...last260.map((b) => b.low));
  snap.distFrom52wHighPct = round2(((last.close - snap.high52w) / snap.high52w) * 100);
  snap.distFrom52wLowPct = round2(((last.close - snap.low52w) / snap.low52w) * 100);

  if (treasury.status === "ok" && treasury.latest != null) {
    snap.riskFreeRatePct = round2(treasury.latest);
    snap.riskFreeSource = "treasury-3m";
  } else {
    snap.missingFields.push(`treasury-3m:${treasury.status}`);
  }

  if (overview.status === "ok" && overview.body) {
    const dy = Number(overview.body.DividendYield);
    if (Number.isFinite(dy) && dy >= 0) snap.dividendYieldPct = round2(dy * 100);
    else snap.missingFields.push("dividend-yield");
  } else {
    snap.missingFields.push(`overview:${overview.status}`);
  }

  // Build candidates.
  if (snap.spot != null && snap.ivProxyPct != null) {
    snap.candidates = buildCandidates({
      spot: snap.spot,
      ivPct: snap.ivProxyPct,
      rPct: snap.riskFreeRatePct,
      qPct: snap.dividendYieldPct,
      dte: targetDte,
      outlook,
    });
  }

  return snap;
}

/* ───────────── Strategy construction ───────────── */

interface BuildCandidatesArgs {
  spot: number;
  ivPct: number;   // annualised
  rPct: number;    // annualised %
  qPct: number;    // annualised %
  dte: number;
  outlook: Outlook;
}

function buildCandidates(a: BuildCandidatesArgs): StrategyCandidate[] {
  const { spot, ivPct, rPct, qPct, dte } = a;
  const t = Math.max(dte, 1) / 365;
  const iv = ivPct / 100;
  const r = rPct / 100;
  const q = qPct / 100;

  // Strike ladder: spot, spot ± 1σ, ±2σ, rounded to sensible increment.
  const sigmaDollars = spot * iv * Math.sqrt(t);
  const inc = strikeIncrement(spot);
  const round = (s: number) => Math.round(s / inc) * inc;
  const Katm = round(spot);
  const Kup1 = round(spot + sigmaDollars);
  const Kup2 = round(spot + 2 * sigmaDollars);
  const Kdn1 = round(spot - sigmaDollars);
  const Kdn2 = round(spot - 2 * sigmaDollars);

  const mkLeg = (type: "call" | "put", side: "long" | "short", K: number): OptionLeg => {
    const p = bsPrice(type, spot, K, t, r, q, iv);
    const g = bsGreeks(type, spot, K, t, r, q, iv);
    return { type, side, strike: K, dte, premium: round2(p), delta: round4(g.delta), gamma: round6(g.gamma), theta: round4(g.theta / 365), vega: round4(g.vega / 100) };
  };

  const cands: StrategyCandidate[] = [];

  /* Covered call (short call at Kup1) — assumes operator owns 100 shares. */
  {
    const sc = mkLeg("call", "short", Kup1);
    const net = +sc.premium; // credit
    const maxProfit = (Kup1 - spot) + net;       // capped at strike + premium
    const maxLoss = spot - net;                  // stock to 0, offset by premium
    const be = spot - net;
    cands.push({
      category: "covered-call",
      description: `Long 100 shares + short 1 call @ ${Kup1} (${dte}d)`,
      fits: ["neutral", "bullish"],
      legs: [sc],
      netCreditPerShare: round2(net),
      maxProfitPerShare: round2(maxProfit),
      maxLossPerShare: round2(maxLoss),
      breakevens: [round2(be)],
      marginEstimatePerShare: spot,  // shares are collateral
      probabilityOfProfitPct: round2(popFromDelta("short-otm", sc.delta)),
      netGreeks: { delta: round4(1 + sc.delta * (-1)), gamma: -sc.gamma, theta: -sc.theta, vega: -sc.vega },
      rationale: "Income generation on owned stock. Caps upside at the short strike; collects premium that reduces breakeven.",
    });
  }

  /* Cash-secured put (short put at Kdn1). */
  {
    const sp = mkLeg("put", "short", Kdn1);
    const net = +sp.premium;
    const maxProfit = net;
    const maxLoss = Kdn1 - net;     // assigned at Kdn1, minus credit
    const be = Kdn1 - net;
    cands.push({
      category: "cash-secured-put",
      description: `Short 1 put @ ${Kdn1} (${dte}d), cash-secured`,
      fits: ["neutral", "bullish"],
      legs: [sp],
      netCreditPerShare: round2(net),
      maxProfitPerShare: round2(maxProfit),
      maxLossPerShare: round2(maxLoss),
      breakevens: [round2(be)],
      marginEstimatePerShare: Kdn1,
      probabilityOfProfitPct: round2(popFromDelta("short-otm", -sp.delta)),
      netGreeks: { delta: -sp.delta, gamma: -sp.gamma, theta: -sp.theta, vega: -sp.vega },
      rationale: "Get paid to buy below market. Profitable if price stays above the short strike at expiry.",
    });
  }

  /* Bull call spread (long Katm, short Kup1). */
  {
    const lc = mkLeg("call", "long", Katm);
    const sc = mkLeg("call", "short", Kup1);
    const net = -lc.premium + sc.premium;       // negative = debit
    const width = Kup1 - Katm;
    const maxProfit = width + net;               // net is negative
    const maxLoss = -net;                        // debit paid
    const be = Katm + (-net);
    cands.push({
      category: "bull-call-spread",
      description: `Long ${Katm}c / short ${Kup1}c (${dte}d)`,
      fits: ["bullish"],
      legs: [lc, sc],
      netCreditPerShare: round2(net),
      maxProfitPerShare: round2(maxProfit),
      maxLossPerShare: round2(maxLoss),
      breakevens: [round2(be)],
      marginEstimatePerShare: Math.abs(net),
      probabilityOfProfitPct: round2(probAbove(spot, be, t, iv)),
      netGreeks: { delta: round4(lc.delta - sc.delta), gamma: round6(lc.gamma - sc.gamma), theta: round4(lc.theta - sc.theta), vega: round4(lc.vega - sc.vega) },
      rationale: "Defined-risk bullish play. Lower cost than long call alone; max profit if stock above short strike at expiry.",
    });
  }

  /* Bear put spread (long Katm put, short Kdn1 put). */
  {
    const lp = mkLeg("put", "long", Katm);
    const sp = mkLeg("put", "short", Kdn1);
    const net = -lp.premium + sp.premium;
    const width = Katm - Kdn1;
    const maxProfit = width + net;
    const maxLoss = -net;
    const be = Katm - (-net);
    cands.push({
      category: "bear-put-spread",
      description: `Long ${Katm}p / short ${Kdn1}p (${dte}d)`,
      fits: ["bearish"],
      legs: [lp, sp],
      netCreditPerShare: round2(net),
      maxProfitPerShare: round2(maxProfit),
      maxLossPerShare: round2(maxLoss),
      breakevens: [round2(be)],
      marginEstimatePerShare: Math.abs(net),
      probabilityOfProfitPct: round2(probBelow(spot, be, t, iv)),
      netGreeks: { delta: round4(-lp.delta - -sp.delta), gamma: round6(lp.gamma - sp.gamma), theta: round4(lp.theta - sp.theta), vega: round4(lp.vega - sp.vega) },
      rationale: "Defined-risk bearish play. Profits if stock falls toward / past the short put strike.",
    });
  }

  /* Bull put spread (short Kdn1 put, long Kdn2 put) — credit spread for neutral-to-bullish. */
  {
    const sp = mkLeg("put", "short", Kdn1);
    const lp = mkLeg("put", "long", Kdn2);
    const net = sp.premium - lp.premium;          // credit (positive)
    const width = Kdn1 - Kdn2;
    const maxProfit = net;
    const maxLoss = width - net;
    const be = Kdn1 - net;
    cands.push({
      category: "bull-put-spread",
      description: `Short ${Kdn1}p / long ${Kdn2}p credit spread (${dte}d)`,
      fits: ["neutral", "bullish"],
      legs: [sp, lp],
      netCreditPerShare: round2(net),
      maxProfitPerShare: round2(maxProfit),
      maxLossPerShare: round2(maxLoss),
      breakevens: [round2(be)],
      marginEstimatePerShare: width - net,
      probabilityOfProfitPct: round2(probAbove(spot, be, t, iv)),
      netGreeks: { delta: round4(-sp.delta - -lp.delta), gamma: round6(-sp.gamma + lp.gamma), theta: round4(-sp.theta + lp.theta), vega: round4(-sp.vega + lp.vega) },
      rationale: "Credit spread that profits if price stays above the short strike. High POP, capped reward.",
    });
  }

  /* Bear call spread (short Kup1 call, long Kup2 call) — credit spread for neutral-to-bearish. */
  {
    const sc = mkLeg("call", "short", Kup1);
    const lc = mkLeg("call", "long", Kup2);
    const net = sc.premium - lc.premium;
    const width = Kup2 - Kup1;
    const maxProfit = net;
    const maxLoss = width - net;
    const be = Kup1 + net;
    cands.push({
      category: "bear-call-spread",
      description: `Short ${Kup1}c / long ${Kup2}c credit spread (${dte}d)`,
      fits: ["neutral", "bearish"],
      legs: [sc, lc],
      netCreditPerShare: round2(net),
      maxProfitPerShare: round2(maxProfit),
      maxLossPerShare: round2(maxLoss),
      breakevens: [round2(be)],
      marginEstimatePerShare: width - net,
      probabilityOfProfitPct: round2(probBelow(spot, be, t, iv)),
      netGreeks: { delta: round4(-sc.delta + lc.delta), gamma: round6(-sc.gamma + lc.gamma), theta: round4(-sc.theta + lc.theta), vega: round4(-sc.vega + lc.vega) },
      rationale: "Credit spread that profits if price stays below the short strike. High POP, capped reward.",
    });
  }

  /* Long straddle (long ATM call + long ATM put) — volatility play. */
  {
    const lc = mkLeg("call", "long", Katm);
    const lp = mkLeg("put", "long", Katm);
    const net = -(lc.premium + lp.premium);
    cands.push({
      category: "long-straddle",
      description: `Long ${Katm}c + long ${Katm}p (${dte}d)`,
      fits: ["volatile"],
      legs: [lc, lp],
      netCreditPerShare: round2(net),
      maxProfitPerShare: null,         // unlimited up + large down
      maxLossPerShare: round2(-net),
      breakevens: [round2(Katm - (-net)), round2(Katm + (-net))],
      marginEstimatePerShare: -net,
      probabilityOfProfitPct: round2(probOutsideRange(spot, Katm - (-net), Katm + (-net), t, iv)),
      netGreeks: { delta: round4(lc.delta - lp.delta), gamma: round6(lc.gamma + lp.gamma), theta: round4(lc.theta + lp.theta), vega: round4(lc.vega + lp.vega) },
      rationale: "Long-vol play. Profits if realised move exceeds the combined debit by expiry. Big theta burn.",
    });
  }

  /* Long strangle (long Kup1 call + long Kdn1 put) — cheaper vol play. */
  {
    const lc = mkLeg("call", "long", Kup1);
    const lp = mkLeg("put", "long", Kdn1);
    const net = -(lc.premium + lp.premium);
    cands.push({
      category: "long-strangle",
      description: `Long ${Kup1}c + long ${Kdn1}p (${dte}d)`,
      fits: ["volatile"],
      legs: [lc, lp],
      netCreditPerShare: round2(net),
      maxProfitPerShare: null,
      maxLossPerShare: round2(-net),
      breakevens: [round2(Kdn1 - (-net)), round2(Kup1 + (-net))],
      marginEstimatePerShare: -net,
      probabilityOfProfitPct: round2(probOutsideRange(spot, Kdn1 - (-net), Kup1 + (-net), t, iv)),
      netGreeks: { delta: round4(lc.delta - lp.delta), gamma: round6(lc.gamma + lp.gamma), theta: round4(lc.theta + lp.theta), vega: round4(lc.vega + lp.vega) },
      rationale: "Cheaper vol play than straddle. Wider breakevens; needs larger move to profit.",
    });
  }

  /* Iron condor (short Kdn1 put, long Kdn2 put, short Kup1 call, long Kup2 call). */
  {
    const sp = mkLeg("put", "short", Kdn1);
    const lp = mkLeg("put", "long", Kdn2);
    const sc = mkLeg("call", "short", Kup1);
    const lc = mkLeg("call", "long", Kup2);
    const net = sp.premium - lp.premium + sc.premium - lc.premium;
    const putWidth = Kdn1 - Kdn2;
    const callWidth = Kup2 - Kup1;
    const maxLoss = Math.max(putWidth, callWidth) - net;
    cands.push({
      category: "iron-condor",
      description: `Short ${Kdn1}p/long ${Kdn2}p + short ${Kup1}c/long ${Kup2}c (${dte}d)`,
      fits: ["neutral"],
      legs: [sp, lp, sc, lc],
      netCreditPerShare: round2(net),
      maxProfitPerShare: round2(net),
      maxLossPerShare: round2(maxLoss),
      breakevens: [round2(Kdn1 - net), round2(Kup1 + net)],
      marginEstimatePerShare: maxLoss,
      probabilityOfProfitPct: round2(probInsideRange(spot, Kdn1 - net, Kup1 + net, t, iv)),
      netGreeks: {
        delta: round4(-sp.delta + lp.delta - sc.delta + lc.delta),
        gamma: round6(-sp.gamma + lp.gamma - sc.gamma + lc.gamma),
        theta: round4(-sp.theta + lp.theta - sc.theta + lc.theta),
        vega: round4(-sp.vega + lp.vega - sc.vega + lc.vega),
      },
      rationale: "Range-bound income trade. Profits if price stays inside the short strikes. High POP, capped reward.",
    });
  }

  /* Protective put (long stock + long ATM put). */
  {
    const lp = mkLeg("put", "long", Katm);
    const net = -lp.premium;
    const be = spot + (-net);
    cands.push({
      category: "protective-put",
      description: `Long stock + long ${Katm}p (${dte}d) — insurance`,
      fits: ["bullish", "neutral"],
      legs: [lp],
      netCreditPerShare: round2(net),
      maxProfitPerShare: null,
      maxLossPerShare: round2((spot - Katm) + (-net)),
      breakevens: [round2(be)],
      marginEstimatePerShare: spot + (-net),
      probabilityOfProfitPct: round2(probAbove(spot, be, t, iv)),
      netGreeks: { delta: round4(1 + lp.delta * -1), gamma: round6(lp.gamma), theta: round4(lp.theta), vega: round4(lp.vega) },
      rationale: "Insurance on owned stock. Caps downside at strike, retains uncapped upside minus premium.",
    });
  }

  /* Sort by outlook fit (matches first), then by POP descending. */
  return cands.sort((x, y) => {
    const xFit = x.fits.includes(a.outlook) ? 0 : 1;
    const yFit = y.fits.includes(a.outlook) ? 0 : 1;
    if (xFit !== yFit) return xFit - yFit;
    return (y.probabilityOfProfitPct ?? 0) - (x.probabilityOfProfitPct ?? 0);
  });
}

/* ───────────── Black-Scholes ───────────── */

function bsPrice(type: "call" | "put", S: number, K: number, t: number, r: number, q: number, sigma: number): number {
  if (t <= 0 || sigma <= 0) {
    // Intrinsic at expiry.
    return Math.max(0, type === "call" ? S - K : K - S);
  }
  const { d1, d2 } = bsD(S, K, t, r, q, sigma);
  if (type === "call") {
    return S * Math.exp(-q * t) * N(d1) - K * Math.exp(-r * t) * N(d2);
  } else {
    return K * Math.exp(-r * t) * N(-d2) - S * Math.exp(-q * t) * N(-d1);
  }
}

function bsGreeks(type: "call" | "put", S: number, K: number, t: number, r: number, q: number, sigma: number): {
  delta: number; gamma: number; theta: number; vega: number;
} {
  if (t <= 0 || sigma <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  const { d1, d2 } = bsD(S, K, t, r, q, sigma);
  const phi = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const gamma = (phi(d1) * Math.exp(-q * t)) / (S * sigma * Math.sqrt(t));
  const vega = S * Math.exp(-q * t) * phi(d1) * Math.sqrt(t);  // per 1.0 IV (we divide by 100 elsewhere)
  let delta: number, theta: number;
  if (type === "call") {
    delta = Math.exp(-q * t) * N(d1);
    theta = -((S * phi(d1) * sigma * Math.exp(-q * t)) / (2 * Math.sqrt(t)))
            - r * K * Math.exp(-r * t) * N(d2)
            + q * S * Math.exp(-q * t) * N(d1);
  } else {
    delta = -Math.exp(-q * t) * N(-d1);
    theta = -((S * phi(d1) * sigma * Math.exp(-q * t)) / (2 * Math.sqrt(t)))
            + r * K * Math.exp(-r * t) * N(-d2)
            - q * S * Math.exp(-q * t) * N(-d1);
  }
  return { delta, gamma, theta, vega };
}

function bsD(S: number, K: number, t: number, r: number, q: number, sigma: number): { d1: number; d2: number } {
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);
  return { d1, d2 };
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

/* ───────────── Probability helpers ───────────── */

/** Lognormal P(S_T > K). Uses iv as proxy. */
function probAbove(S: number, K: number, t: number, sigma: number): number {
  if (t <= 0) return S > K ? 100 : 0;
  const d2 = (Math.log(S / K) + (-0.5 * sigma * sigma) * t) / (sigma * Math.sqrt(t));
  return N(d2) * 100;
}
function probBelow(S: number, K: number, t: number, sigma: number): number {
  return 100 - probAbove(S, K, t, sigma);
}
function probInsideRange(S: number, low: number, high: number, t: number, sigma: number): number {
  return Math.max(0, probAbove(S, low, t, sigma) - probAbove(S, high, t, sigma));
}
function probOutsideRange(S: number, low: number, high: number, t: number, sigma: number): number {
  return Math.max(0, 100 - probInsideRange(S, low, high, t, sigma));
}

/** Rough POP for single short OTM leg from |delta| (industry approximation). */
function popFromDelta(_kind: "short-otm", delta: number): number {
  return Math.max(0, Math.min(100, 100 - Math.abs(delta) * 100));
}

/* ───────────── Stats / math ───────────── */

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

function strikeIncrement(spot: number): number {
  if (spot < 25) return 1;
  if (spot < 200) return 2.5;
  if (spot < 500) return 5;
  return 10;
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
function round4(v: number): number { return Math.round(v * 10000) / 10000; }
function round6(v: number): number { return Math.round(v * 1000000) / 1000000; }

/* ───────────── Macro fetchers ───────────── */

async function fetchTreasury3M(apiKey: string): Promise<{ status: string; latest: number | null }> {
  const url = `${AV_BASE}?function=TREASURY_YIELD&interval=daily&maturity=3month&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const r = await fetchWithTimeout(url, { cache: "no-store" }, 15000);
    if (!r.ok) return { status: `error-${r.status}`, latest: null };
    const j = (await r.json()) as Record<string, unknown>;
    if (typeof j.Note === "string" || typeof j.Information === "string") {
      const n = String(j.Note || j.Information);
      if (/limit|frequency|quota|premium/i.test(n)) return { status: "rate-limited", latest: null };
    }
    const data = Array.isArray(j.data) ? j.data as Array<Record<string, unknown>> : [];
    if (!data.length) return { status: "missing", latest: null };
    const rows = data.map((row) => ({ d: String(row.date || ""), v: Number(row.value) }))
      .filter((x) => x.d && Number.isFinite(x.v));
    if (!rows.length) return { status: "missing", latest: null };
    rows.sort((a, b) => b.d.localeCompare(a.d));
    return { status: "ok", latest: rows[0].v };
  } catch (e) {
    return { status: e instanceof Error ? e.message : "error", latest: null };
  }
}

async function fetchOverview(symbol: string, apiKey: string): Promise<{ status: string; body: Record<string, string> | null }> {
  const url = `${AV_BASE}?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const r = await fetchWithTimeout(url, { cache: "no-store" }, 15000);
    if (!r.ok) return { status: `error-${r.status}`, body: null };
    const j = (await r.json()) as Record<string, unknown>;
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

/* ───────────── Serialization ───────────── */

export function serializeOptionsSnapshot(s: OptionsSnapshot): string {
  const L: string[] = [];
  L.push(`GENERATED_AT: ${s.generatedAt}`);
  L.push(`TICKER: ${s.ticker}  STATUS: ${s.status}${s.error ? `  ERROR: ${s.error}` : ""}`);
  L.push(`SPOT: ${s.spot ?? "n/a"}  LAST_BAR: ${s.lastBarDate ?? "n/a"}`);
  L.push(`HV20: ${s.hv20Pct ?? "n/a"}%  HV60: ${s.hv60Pct ?? "n/a"}%  HV252: ${s.hv252Pct ?? "n/a"}%`);
  L.push(`IV_PROXY (used for pricing): ${s.ivProxyPct ?? "n/a"}%  ← HV20 PROXY, NOT REAL IV`);
  L.push(`RISK_FREE: ${s.riskFreeRatePct}%  (source=${s.riskFreeSource})`);
  L.push(`DIV_YIELD: ${s.dividendYieldPct}%`);
  L.push(`ATR14: ${s.atr14 ?? "n/a"}  52w_high=${s.high52w ?? "n/a"} (dist=${s.distFrom52wHighPct ?? "n/a"}%)  52w_low=${s.low52w ?? "n/a"} (dist=${s.distFrom52wLowPct ?? "n/a"}%)`);
  L.push("");
  L.push("MISSING_FIELDS (cannot be fabricated):");
  for (const m of s.missingFields) L.push(`  - ${m}`);
  L.push("");
  L.push("STRATEGY_CANDIDATES (theoretical pricing from HV20 proxy):");
  for (const c of s.candidates) {
    L.push("");
    L.push(`  [${c.category}] ${c.description}`);
    L.push(`    fits: ${c.fits.join(",")}`);
    L.push(`    net: ${c.netCreditPerShare >= 0 ? "credit" : "debit"} $${Math.abs(c.netCreditPerShare).toFixed(2)}/sh`);
    L.push(`    max_profit/sh: ${c.maxProfitPerShare == null ? "unlimited" : "$" + c.maxProfitPerShare.toFixed(2)}`);
    L.push(`    max_loss/sh:   ${c.maxLossPerShare == null ? "undefined" : "$" + c.maxLossPerShare.toFixed(2)}`);
    L.push(`    breakevens: ${c.breakevens.map((b) => "$" + b.toFixed(2)).join(", ")}`);
    L.push(`    margin/sh: $${c.marginEstimatePerShare.toFixed(2)}  POP: ${c.probabilityOfProfitPct?.toFixed(1) ?? "n/a"}%`);
    L.push(`    net_greeks: delta=${c.netGreeks.delta} gamma=${c.netGreeks.gamma} theta=${c.netGreeks.theta}/d vega=${c.netGreeks.vega}`);
    L.push(`    legs:`);
    for (const lg of c.legs) {
      L.push(`      ${lg.side} ${lg.type} K=${lg.strike} dte=${lg.dte} premium=$${lg.premium.toFixed(2)} d=${lg.delta} g=${lg.gamma} th=${lg.theta}/d v=${lg.vega}`);
    }
    L.push(`    rationale: ${c.rationale}`);
  }
  return L.join("\n");
}
