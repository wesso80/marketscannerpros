import type { OptionsSnapshot, StrategyCandidate } from "./optionsArchitect";
import type { OptionsArchitectMemo, OptionsLegOut } from "./optionsMemo";

const money = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const stockBacked = (c: StrategyCandidate) => ["covered-call", "protective-put", "collar"].includes(c.category);

/** P&L for one 100-share strategy unit, including stock for covered strategies. */
export function optionExpiryPnl(candidate: StrategyCandidate, spot: number, expiryPrice: number): number {
  let pnl = candidate.netCreditPerShare + (stockBacked(candidate) ? expiryPrice - spot : 0);
  for (const leg of candidate.legs) {
    const intrinsic = leg.contract.type === "call"
      ? Math.max(0, expiryPrice - leg.contract.strike)
      : Math.max(0, leg.contract.strike - expiryPrice);
    pnl += (leg.side === "long" ? 1 : -1) * Math.abs(leg.qty) * intrinsic;
  }
  return money(pnl * 100);
}

/** The model selects a candidate; it cannot author contract facts or financial maths. */
export function groundOptionsMemo(memo: OptionsArchitectMemo, snapshot: OptionsSnapshot, budget: number): OptionsArchitectMemo {
  const candidate = snapshot.candidates.find(c => c.category === memo.tradeSetup?.category);
  if (!candidate || !snapshot.spot || !Number.isFinite(budget) || budget <= 0) throw new Error("Selected options candidate or risk budget is unavailable");
  const spot = snapshot.spot;
  const capital = money(candidate.marginEstimatePerShare * 100);
  const maxLoss = candidate.maxLossPerShare === null ? null : money(candidate.maxLossPerShare * 100);
  if (!Number.isFinite(capital) || capital <= 0 || maxLoss === null || !Number.isFinite(maxLoss) || maxLoss < 0) {
    throw new Error("A finite, positive capital requirement and defined maximum loss are required");
  }
  // The budget bounds both cash/margin required and loss, including stock-backed structures.
  const perUnitBudget = Math.max(capital, maxLoss);
  const units = Math.floor(budget / perUnitBudget);
  const totalRisk = money(maxLoss * units);
  const asOf = new Date(snapshot.generatedAt).toISOString().slice(0, 10);
  const dte = snapshot.selectedExpiration
    ? Math.round((Date.parse(snapshot.selectedExpiration) - Date.parse(asOf)) / 86400000) : null;
  if (dte === null || !Number.isFinite(dte) || dte <= 0) throw new Error("Selected options expiration has expired or is unavailable");
  const legs: OptionsLegOut[] = candidate.legs.map(({ side, contract: c, qty }) => ({
    side, qty: Math.abs(qty), type: c.type, contractID: c.contractID, strike: c.strike,
    dte, bid: c.bid, ask: c.ask, mid: c.mid, impliedVolatilityPct: c.impliedVolatility * 100,
    delta: c.delta, gamma: c.gamma, theta: c.theta, vega: c.vega,
    volume: c.volume, openInterest: c.openInterest, liquidity: c.liquidity, spreadPct: c.spreadPct,
  }));
  const greeks = { ...candidate.netGreeks, delta: candidate.netGreeks.delta + (stockBacked(candidate) ? 1 : 0) };
  const positionGreeks = Object.fromEntries(Object.entries(greeks).map(([key, val]) => [key, money(val * 100 * units)])) as typeof greeks;
  const strikes = candidate.legs.map(l => l.contract.strike);
  const prices = [...new Set([0, spot, ...strikes, ...candidate.breakevens, Math.max(spot, ...strikes) * 1.2].map(money))].sort((a, b) => a - b);
  const payoffTable = prices.map(priceAtExpiry => {
    const pnlPerContract = optionExpiryPnl(candidate, spot, priceAtExpiry);
    return { priceAtExpiry, pnlPerContract, pnlPctOfRisk: maxLoss > 0 ? money(pnlPerContract / maxLoss * 100) : null };
  });
  const caseAt = (price: number) => `At an expiry price of $${price.toFixed(2)}, P&L is $${optionExpiryPnl(candidate, spot, price).toFixed(2)} per strategy unit, before fees and slippage.`;
  const description = `${stockBacked(candidate) ? "Long 100 shares; " : ""}${legs.map(l => `${l.side} ${l.qty} ${l.contractID}`).join("; ")}. Expiry ${snapshot.selectedExpiration}; ${dte} calendar days remaining as of ${asOf}.`;
  const safeAlternatives = (memo.alternativesConsidered ?? []).flatMap(a => {
    const c = snapshot.candidates.find(c => c.category === a.category && c.category !== candidate.category);
    return c ? [{ category: c.category, description: c.description, whyConsidered: c.rationale, whyRejected: "Alternative structure; compare its directional exposure, capital requirement and payoff with the selected candidate." }] : [];
  });
  return {
    ...memo,
    generatedAt: snapshot.generatedAt,
    decisionSummary: {
      ...memo.decisionSummary,
      headline: `${snapshot.ticker}: ${candidate.category} research scenario — expiry ${snapshot.selectedExpiration}`,
      recommendedStrategy: candidate.category,
      sizingCall: units > 0
        ? `${units} strategy units; $${capital.toFixed(2)} capital per unit; $${(capital * units).toFixed(2)} total capital; $${totalRisk.toFixed(2)} maximum loss within the $${budget.toFixed(2)} budget (before costs).`
        : `No units fit the $${budget.toFixed(2)} budget. One unit requires $${perUnitBudget.toFixed(2)} before costs.`,
    },
    tradeSetup: {
      ...memo.tradeSetup, category: candidate.category, description, legs,
      netCreditPerShare: candidate.netCreditPerShare, netCreditPerContract: money(candidate.netCreditPerShare * 100),
      maxProfitPerContract: candidate.maxProfitPerShare === null ? null : money(candidate.maxProfitPerShare * 100),
      maxLossPerContract: maxLoss, breakevens: candidate.breakevens, marginEstimatePerContract: capital,
      probabilityOfProfitPct: candidate.probabilityOfProfitPct, positionGreeks,
      contractsToOpen: units, totalCapitalAtRisk: totalRisk,
      worstLegLiquidity: candidate.worstLiquidity, avgSpreadPct: candidate.avgSpreadPct,
      liquidityAssessment: `Worst leg: ${candidate.worstLiquidity}; average quoted spread ${candidate.avgSpreadPct?.toFixed(2) ?? "unavailable"}%. EOD quotes require live repricing.`,
    },
    payoffNarrative: { bullCaseDescription: caseAt(prices[prices.length - 1]), baseCaseDescription: caseAt(spot), bearCaseDescription: caseAt(0), payoffTable },
    greeksAnalysis: {
      deltaInterpretation: `Total position delta: ${positionGreeks.delta} share equivalents, including stock where required.`,
      thetaInterpretation: `Total position theta: $${positionGreeks.theta} per day.`,
      gammaInterpretation: `Total position gamma: ${positionGreeks.gamma} delta change per $1 underlying move.`,
      vegaInterpretation: `Total position vega: $${positionGreeks.vega} per one percentage-point IV change.`,
    },
    // Do not leave model-authored sizing or dollar thresholds elsewhere in the memo.
    adjustmentPlan: [{ trigger: "The directional or volatility thesis changes", action: "Reprice all legs and recompute risk before considering an adjustment.", rationale: "An adjustment changes the original payoff and capital requirement." }],
    exitRules: [{ condition: "The research thesis is invalidated", action: "close-for-loss", threshold: "Operator review using current quotes; no guaranteed stop fill" }],
    riskManagementRules: [`Maximum illustrated loss: $${totalRisk.toFixed(2)} before costs.`, `Capital requirement: $${(capital * units).toFixed(2)} before costs.`, "Live quotes, fees, slippage and assignment can change capital needs; recalculate before use."],
    alternativesConsidered: safeAlternatives,
    outlookAssessment: {
      ...memo.outlookAssessment, underlyingPrice: spot,
      impliedMoveOneSigma: snapshot.atmIVPct !== null && Number.isFinite(snapshot.atmIVPct) && snapshot.atmIVPct > 0
        ? money(spot * snapshot.atmIVPct / 100 * Math.sqrt(dte / 365)) : null,
    },
    chainDataAsOfDate: snapshot.chainAsOfDate, chainContractCount: snapshot.chainContractCount,
    selectedExpiration: snapshot.selectedExpiration, selectedExpirationDte: dte,
    requiresLiveRepricing: { required: true, note: `Chain as of ${snapshot.chainAsOfDate}; ${dte} calendar days remain as of ${asOf}. Reprice all legs before use.` },
  };
}
