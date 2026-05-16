/**
 * Earnings-window options implied move.
 *
 * Pulls Alpha Vantage HISTORICAL_OPTIONS (or REALTIME_OPTIONS_FMV when the
 * caller's plan supports it), picks the first listed expiry on/after the
 * target date (earnings date if supplied, otherwise today), finds the ATM
 * call + put nearest the underlying, and computes
 *
 *     implied_move_pct = (atm_call_mark + atm_put_mark) / underlying * 100
 *
 * This is the standard "straddle implied move" approximation used by
 * pre-earnings desks. It is NOT a Black-Scholes IV — it is the market's
 * pricing of the move through the expiry that brackets the event.
 *
 * Returns a typed envelope. Caller should never fabricate a value when
 * `available: false`.
 */

import { avFetchAdmin } from "@/lib/avRateGovernor";

const AV_BASE = "https://www.alphavantage.co/query";

interface AVOptionContract {
  contractID?: string;
  symbol?: string;
  expiration?: string;
  strike?: string;
  type?: string; // "call" | "put"
  last?: string;
  mark?: string;
  bid?: string;
  ask?: string;
  volume?: string;
  open_interest?: string;
  implied_volatility?: string;
}

export interface EarningsImpliedMove {
  available: boolean;
  impliedMovePct: number | null;
  expiry: string | null;
  daysToExpiry: number | null;
  underlying: number | null;
  atmStrike: number | null;
  atmCallMark: number | null;
  atmPutMark: number | null;
  atmCallIV: number | null;
  atmPutIV: number | null;
  source:
    | "alpha-vantage:HISTORICAL_OPTIONS"
    | "alpha-vantage:REALTIME_OPTIONS_FMV"
    | "unavailable";
  fetchedAt: string;
  reason: string | null;
}

const REALTIME_ENABLED =
  String(process.env.AV_OPTIONS_REALTIME_ENABLED || "").toLowerCase() === "true";

export async function fetchEarningsImpliedMove(
  symbol: string,
  opts: { earningsDate: string | null; underlying: number | null },
): Promise<EarningsImpliedMove> {
  const fetchedAt = new Date().toISOString();
  const sym = symbol.toUpperCase();
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  const unavailable = (reason: string): EarningsImpliedMove => ({
    available: false,
    impliedMovePct: null,
    expiry: null,
    daysToExpiry: null,
    underlying: opts.underlying,
    atmStrike: null,
    atmCallMark: null,
    atmPutMark: null,
    atmCallIV: null,
    atmPutIV: null,
    source: "unavailable",
    fetchedAt,
    reason,
  });

  if (!apiKey) return unavailable("ALPHA_VANTAGE_API_KEY missing");
  if (opts.underlying == null || !Number.isFinite(opts.underlying) || opts.underlying <= 0) {
    return unavailable("no underlying price in packet");
  }

  const providers: Array<{
    fn: "REALTIME_OPTIONS_FMV" | "HISTORICAL_OPTIONS";
    source: EarningsImpliedMove["source"];
  }> = REALTIME_ENABLED
    ? [
        { fn: "REALTIME_OPTIONS_FMV", source: "alpha-vantage:REALTIME_OPTIONS_FMV" },
        { fn: "HISTORICAL_OPTIONS", source: "alpha-vantage:HISTORICAL_OPTIONS" },
      ]
    : [{ fn: "HISTORICAL_OPTIONS", source: "alpha-vantage:HISTORICAL_OPTIONS" }];

  let chain: AVOptionContract[] | null = null;
  let chainSource: EarningsImpliedMove["source"] = "unavailable";
  let lastReason = "no provider returned data";

  for (const provider of providers) {
    const url = `${AV_BASE}?function=${provider.fn}&symbol=${encodeURIComponent(sym)}&apikey=${encodeURIComponent(apiKey)}`;
    try {
      const payload = await avFetchAdmin<Record<string, unknown> | null>(
        url,
        `${provider.fn} ${sym}`,
      );
      if (!payload) {
        lastReason = `${provider.fn}: empty payload`;
        continue;
      }
      if (typeof payload["Information"] === "string") {
        lastReason = `${provider.fn} entitlement: ${String(payload["Information"]).slice(0, 200)}`;
        continue;
      }
      if (typeof payload["Note"] === "string") {
        lastReason = `${provider.fn} rate-limit: ${String(payload["Note"]).slice(0, 200)}`;
        continue;
      }
      if (typeof payload["Error Message"] === "string") {
        lastReason = `${provider.fn} error: ${String(payload["Error Message"]).slice(0, 200)}`;
        continue;
      }
      const data = payload["data"];
      if (!Array.isArray(data) || data.length === 0) {
        lastReason = `${provider.fn}: empty options array`;
        continue;
      }
      chain = data as AVOptionContract[];
      chainSource = provider.source;
      break;
    } catch (e) {
      lastReason = `${provider.fn}: ${e instanceof Error ? e.message : "fetch_failed"}`;
    }
  }

  if (!chain) return unavailable(lastReason);

  // Pick target expiry: first listed expiry on/after earnings date (or today).
  const target = opts.earningsDate ?? new Date().toISOString().slice(0, 10);
  const expiries = Array.from(
    new Set(chain.map((c) => (c.expiration || "").slice(0, 10)).filter(Boolean)),
  ).sort();
  if (!expiries.length) return unavailable("no expirations parsed from chain");

  const candidate = expiries.find((e) => e >= target) ?? expiries[expiries.length - 1];
  const expiryContracts = chain.filter((c) => (c.expiration || "").slice(0, 10) === candidate);
  const calls = expiryContracts.filter((c) => (c.type || "").toLowerCase() === "call");
  const puts = expiryContracts.filter((c) => (c.type || "").toLowerCase() === "put");
  if (!calls.length || !puts.length) {
    return unavailable(`expiry ${candidate} missing call/put side`);
  }

  const strikes = Array.from(
    new Set(
      expiryContracts
        .map((c) => Number(c.strike))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ).sort((a, b) => a - b);
  if (!strikes.length) return unavailable("no parseable strikes");

  const underlying = opts.underlying;
  const atmStrike = strikes.reduce((best, k) =>
    Math.abs(k - underlying) < Math.abs(best - underlying) ? k : best,
  );

  const atmCall = pickContractAtStrike(calls, atmStrike);
  const atmPut = pickContractAtStrike(puts, atmStrike);
  if (!atmCall || !atmPut) return unavailable(`ATM strike ${atmStrike} missing call or put`);

  const callMark = contractMark(atmCall);
  const putMark = contractMark(atmPut);
  if (callMark == null || putMark == null) {
    return unavailable("ATM contracts had no mark/bid/ask/last");
  }

  const impliedMovePct = ((callMark + putMark) / underlying) * 100;
  const daysToExpiry = Math.max(
    0,
    Math.round(
      (Date.parse(`${candidate}T00:00:00Z`) - Date.parse(`${target}T00:00:00Z`)) / 86400000,
    ),
  );

  return {
    available: true,
    impliedMovePct: round2(impliedMovePct),
    expiry: candidate,
    daysToExpiry,
    underlying: round2(underlying),
    atmStrike,
    atmCallMark: round2(callMark),
    atmPutMark: round2(putMark),
    atmCallIV: parseNum(atmCall.implied_volatility),
    atmPutIV: parseNum(atmPut.implied_volatility),
    source: chainSource,
    fetchedAt,
    reason: null,
  };
}

function pickContractAtStrike(
  contracts: AVOptionContract[],
  strike: number,
): AVOptionContract | null {
  return (
    contracts.find((c) => Number(c.strike) === strike) ??
    contracts.find((c) => Math.abs(Number(c.strike) - strike) < 1e-6) ??
    null
  );
}

function contractMark(c: AVOptionContract): number | null {
  const mark = parseNum(c.mark);
  if (mark != null && mark > 0) return mark;
  const bid = parseNum(c.bid);
  const ask = parseNum(c.ask);
  if (bid != null && ask != null && bid > 0 && ask > 0) return (bid + ask) / 2;
  const last = parseNum(c.last);
  if (last != null && last > 0) return last;
  return null;
}

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
