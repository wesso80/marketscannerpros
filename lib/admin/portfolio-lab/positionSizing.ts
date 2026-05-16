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

export interface SizingInput {
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
  const perUnitRisk = Math.abs(entry - stop);
  if (perUnitRisk <= 0) {
    return { ok: false, quantity: 0, riskDollars: 0, perUnitRisk: 0, notional: 0, reason: "zero_unit_risk" };
  }
  const riskDollars = equity * (riskPct / 100);
  const rawQty = riskDollars / perUnitRisk;
  // Crypto can be fractional; everything else integer share/contract.
  const quantity = assetClass === "crypto" ? round8(rawQty) : Math.floor(rawQty);
  if (quantity <= 0) {
    return { ok: false, quantity: 0, riskDollars, perUnitRisk, notional: 0, reason: "qty_rounds_to_zero" };
  }
  const notional = round2(quantity * entry);
  return { ok: true, quantity, riskDollars: round2(riskDollars), perUnitRisk, notional };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round8(n: number): number { return Math.round(n * 1e8) / 1e8; }

/** Convenience that pulls equity off the portfolio. */
export function sizeForPortfolio(
  portfolio: ArcaPortfolio,
  args: Omit<SizingInput, "equity" | "settings">,
): SizingResult {
  return sizePosition({
    ...args,
    equity: portfolio.totalEquity,
    settings: portfolio.settings,
  });
}
