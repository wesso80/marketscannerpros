/**
 * lib/admin/portfolio-lab/riskEngine.ts
 *
 * Pre-trade and post-cycle risk checks against the ARCA settings.
 * Emits risk events for warnings/critical breaches.
 */

import { insertRiskEvent, listOpenPositions } from "./portfolioStore";
import type { ArcaAssetClass, ArcaPortfolio, ArcaPosition, ArcaRiskEvent } from "./types";

export interface PreTradeCheckInput {
  portfolio: ArcaPortfolio;
  assetClass: ArcaAssetClass;
  riskDollars: number;
  notional: number;
}

export interface PreTradeCheckResult {
  ok: boolean;
  reasons: string[];
  warnings: string[];
}

export async function checkPreTrade(input: PreTradeCheckInput): Promise<PreTradeCheckResult> {
  const { portfolio, assetClass, riskDollars, notional } = input;
  const equity = portfolio.totalEquity;
  const reasons: string[] = [];
  const warnings: string[] = [];

  const open = await listOpenPositions(portfolio.workspaceId, portfolio.id);
  const openRiskPct = sum(open.map((p) => p.openRisk)) / equity * 100;
  const newRiskPct = openRiskPct + (riskDollars / equity) * 100;
  if (newRiskPct > portfolio.settings.maxOpenPortfolioRiskPct) {
    reasons.push(`open_portfolio_risk_${newRiskPct.toFixed(2)}_gt_${portfolio.settings.maxOpenPortfolioRiskPct}`);
  }

  // Asset-class exposure cap.
  const exposureByClass = bucketExposure(open);
  const newExposure = (exposureByClass[assetClass] ?? 0) + notional;
  const exposurePct = (newExposure / equity) * 100;
  const cap = portfolio.settings.maxAssetClassExposurePct[assetClass] ?? 100;
  if (exposurePct > cap) {
    reasons.push(`asset_class_${assetClass}_exposure_${exposurePct.toFixed(1)}_gt_${cap}`);
  } else if (exposurePct > cap * 0.85) {
    warnings.push(`asset_class_${assetClass}_exposure_${exposurePct.toFixed(1)}_near_cap_${cap}`);
  }

  return { ok: reasons.length === 0, reasons, warnings };
}

export async function emitRiskEventIfBreached(args: {
  portfolio: ArcaPortfolio;
  eventType: string;
  severity: "info" | "warning" | "critical" | "kill_switch";
  message: string;
  value?: number | null;
  threshold?: number | null;
  affectedSymbol?: string | null;
  affectedPositionId?: string | null;
}): Promise<ArcaRiskEvent> {
  return insertRiskEvent({
    workspaceId: args.portfolio.workspaceId,
    portfolioId: args.portfolio.id,
    eventType: args.eventType,
    severity: args.severity,
    message: args.message,
    value: args.value ?? null,
    threshold: args.threshold ?? null,
    affectedSymbol: args.affectedSymbol ?? null,
    affectedPositionId: args.affectedPositionId ?? null,
  });
}

function bucketExposure(positions: ArcaPosition[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of positions) {
    const notional = (p.currentPrice ?? p.averageEntry) * p.quantity;
    out[p.assetClass] = (out[p.assetClass] ?? 0) + notional;
  }
  return out;
}

function sum(arr: number[]): number {
  return arr.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
}
