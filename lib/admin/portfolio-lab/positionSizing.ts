/**
 * lib/admin/portfolio-lab/positionSizing.ts
 *
 * Conservative position sizing for ARCA paper portfolio.
 *
 *   risk_dollars   = equity * risk_pct
 *   per_unit_risk  = abs(entry - stop)
 *   quantity       = floor(risk_dollars / per_unit_risk)  // fractional for crypto
 *
 * Returns null when the trade cannot be sized safely.
 */

import type { ArcaAssetClass, ArcaPortfolio, ArcaPortfolioSettings } from "./types";

import { loadCapacity } from "./portfolioCapacity";

export interface SizingInput {
  maxNotional?: number;
  maxRiskDollars?: number;
  slippagePct?: number;
  equity: number;
  entry: number;
  stop: number;
  side: "LONG" | "SHORT";
  assetClass: ArcaAssetClass;
  settings: ArcaPortfolioSettings;
  riskPctOverride?: number;
}

export interface SizingResult {
  ok: boolean;
  quantity: number;
  riskDollars: number;
  perUnitRisk: number;
  notional: number;
  reason?: string;
}

export function sizePosition(input: SizingInput): SizingResult {
  const { equity, entry, stop, side, assetClass, settings } = input;
  const riskPct = Math.min(
    input.riskPctOverride ?? settings.riskPerTradePct,
    settings.maxSingleTradeRiskPct,
  );
  if (!Number.isFinite(equity) || equity <= 0) {
    return { ok: false, quantity: 0, riskDollars: 0, perUnitRisk: 0, notional: 0, reason: "equity_invalid" };
  }
  if (!Number.isFinite(entry) || entry <= 0) {
    return { ok: false, quantity: 0, riskDollars: 0, perUnitRisk: 0, notional: 0, reason: "entry_invalid" };
  }
  if (!Number.isFinite(stop) || stop <= 0) {
    return { ok: false, quantity: 0, riskDollars: 0, perUnitRisk: 0, notional: 0, reason: "stop_invalid" };
  }
  if (side === "LONG" && stop >= entry) {
    return { ok: false, quantity: 0, riskDollars: 0, perUnitRisk: 0, notional: 0, reason: "stop_above_entry_long" };
  }
  if (side === "SHORT" && stop <= entry) {
    return { ok: false, quantity: 0, riskDollars: 0, perUnitRisk: 0, notional: 0, reason: "stop_below_entry_short" };
  }
  const slip = (input.slippagePct ?? 0) / 100;
  if (!Number.isFinite(riskPct) || riskPct <= 0 || !Number.isFinite(slip) || slip < 0 ||
      [input.maxNotional, input.maxRiskDollars].some(n => n !== undefined && (!Number.isFinite(n) || n < 0))) {
    return { ok: false, quantity: 0, riskDollars: 0, perUnitRisk: 0, notional: 0, reason: 'capacity_invalid' };
  }
  const perUnitRisk = Math.abs(entry - stop) + entry * slip;
  if (perUnitRisk <= 0) {
    return { ok: false, quantity: 0, riskDollars: 0, perUnitRisk: 0, notional: 0, reason: "zero_unit_risk" };
  }
  const riskDollars = Math.min(equity * (riskPct / 100), input.maxRiskDollars ?? Infinity);
  const rawQty = Math.min(riskDollars / perUnitRisk, (input.maxNotional ?? Infinity) / (entry * (1 + slip)));
  // Crypto can be fractional; everything else integer share/contract.
  const quantity = floorQuantity(rawQty, assetClass);
  if (quantity <= 0) {
    return { ok: false, quantity: 0, riskDollars, perUnitRisk, notional: 0, reason: "qty_rounds_to_zero" };
  }
  const notional = round2(quantity * entry);
  return { ok: true, quantity, riskDollars: quantity * perUnitRisk, perUnitRisk, notional };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
export function floorQuantity(n: number, assetClass: ArcaAssetClass): number { return assetClass === "crypto" ? Math.floor(n * 1e8) / 1e8 : Math.floor(n); }

/** Convenience that pulls equity off the portfolio. */
export async function sizeForPortfolio(
  portfolio: ArcaPortfolio,
  args: Omit<SizingInput, "equity" | "settings">,
): Promise<SizingResult> {
  const capacity = await loadCapacity(portfolio, args.assetClass);
  return sizePosition({
    ...args,
    equity: portfolio.totalEquity,
    settings: portfolio.settings,
    maxNotional: Math.min(args.maxNotional ?? Infinity, capacity.notional),
    maxRiskDollars: Math.min(args.maxRiskDollars ?? Infinity, capacity.riskDollars),
    slippagePct: portfolio.settings.slippagePctEstimate,
  });
}
