import { listOpenPositions, listOrders } from './portfolioStore';
import type { ArcaAssetClass, ArcaPortfolio, ArcaPosition, ArcaSimOrder } from './types';

/** Pending orders reserve capacity before they fill; short proceeds are not leverage. */
export function remainingCapacity(portfolio: ArcaPortfolio, assetClass: ArcaAssetClass,
  positions: ArcaPosition[], orders: ArcaSimOrder[]) {
  let risk = 0, gross = 0, classGross = 0, reservedCash = 0;
  const slip = portfolio.settings.slippagePctEstimate / 100;
  const fee = portfolio.settings.feesPctEstimate / 100;
  const add = (asset: string, notional: number, openRisk: number) => {
    if (!Number.isFinite(notional) || notional < 0 || !Number.isFinite(openRisk) || openRisk < 0) throw new Error('Invalid paper exposure');
    risk += openRisk; gross += notional;
    if (asset === assetClass) classGross += notional;
  };
  for (const p of positions) add(p.assetClass, (p.currentPrice ?? p.averageEntry) * p.quantity, p.openRisk);
  for (const o of orders) {
    if (!['PLANNED', 'WAITING_FOR_TRIGGER', 'TRIGGERED'].includes(o.status)) continue;
    const entry = o.plannedEntry ?? o.triggerPrice;
    if (entry == null || entry <= 0 || o.stopLoss == null || o.stopLoss <= 0 || o.quantity <= 0) throw new Error('Pending paper order lacks valid risk levels');
    const notional = entry * o.quantity * (1 + slip);
    add(o.assetClass, notional, (Math.abs(entry - o.stopLoss) + entry * slip) * o.quantity);
    reservedCash += notional * (1 + fee);
  }
  const equity = portfolio.totalEquity;
  const riskCap = equity * portfolio.settings.maxOpenPortfolioRiskPct / 100;
  const classCap = equity * (portfolio.settings.maxAssetClassExposurePct[assetClass] ?? 100) / 100;
  const cash = Math.min(portfolio.currentCash - reservedCash, equity - gross);
  if (![equity, riskCap, classCap, cash, slip, fee].every(Number.isFinite) || equity <= 0 || slip < 0 || fee < 0) throw new Error('Invalid paper account capacity');
  return { riskDollars: Math.max(0, riskCap - risk),
    notional: Math.max(0, Math.min(classCap - classGross, cash / (1 + fee))) };
}

export async function loadCapacity(portfolio: ArcaPortfolio, assetClass: ArcaAssetClass) {
  const positions = await listOpenPositions(portfolio.workspaceId, portfolio.id);
  const orders = await listOrders(portfolio.workspaceId, portfolio.id, { status: ['PLANNED', 'WAITING_FOR_TRIGGER', 'TRIGGERED'] });
  return remainingCapacity(portfolio, assetClass, positions, orders);
}
