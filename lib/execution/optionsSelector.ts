/**
 * Execution Engine — Options Selector
 *
 * Given regime + direction + confidence, recommends an options structure,
 * delta target, DTE, and estimated max loss.
 *
 * No broker / chain API — pure rule-based selection.
 * When live chain data is available, swap in real greeks.
 */

import type { Regime, Direction } from '@/lib/risk-governor-hard';
import type { OptionsStructure, OptionsSelection, AssetClass } from './types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Default DTE by regime */
const DTE_MAP: Record<Regime, number> = {
  TREND_UP: 30,
  TREND_DOWN: 30,
  RANGE_NEUTRAL: 14,
  VOL_EXPANSION: 21,
  VOL_CONTRACTION: 45,
  RISK_OFF_STRESS: 7,
};

/** Base delta target by confidence band */
function baseDelta(confidence: number): number {
  if (confidence >= 80) return 0.70;
  if (confidence >= 65) return 0.55;
  if (confidence >= 50) return 0.45;
  return 0.30;
}

/* ------------------------------------------------------------------ */
/*  Structure Selection Matrix                                         */
/* ------------------------------------------------------------------ */

function pickStructure(
  regime: Regime,
  direction: Direction,
  confidence: number,
): OptionsStructure {
  // High vol → prefer defined-risk spreads
  if (regime === 'VOL_EXPANSION' || regime === 'RISK_OFF_STRESS') {
    return direction === 'LONG' ? 'CALL_DEBIT_SPREAD' : 'PUT_DEBIT_SPREAD';
  }

  // Range regimes → iron condor if confidence is moderate
  if (regime === 'RANGE_NEUTRAL' && confidence < 65) {
    return 'IRON_CONDOR';
  }

  // Vol contraction → straddle for breakout anticipation
  if (regime === 'VOL_CONTRACTION' && confidence >= 70) {
    return 'STRADDLE';
  }

  // Default directional
  return direction === 'LONG' ? 'LONG_CALL' : 'LONG_PUT';
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export function selectOptions(input: {
  regime: Regime;
  direction: Direction;
  confidence: number;
  entry_price: number;
  asset_class: AssetClass;
  risk_budget_usd: number;
  /** Override structure */
  force_structure?: OptionsStructure;
  /** Override DTE */
  force_dte?: number;
  /** Override delta */
  force_delta?: number;
}): OptionsSelection {
  const {
    regime,
    direction,
    confidence,
    entry_price,
    risk_budget_usd,
    force_structure,
    force_dte,
    force_delta,
  } = input;

  const structure = force_structure ?? pickStructure(regime, direction, confidence);
  const dte = force_dte ?? DTE_MAP[regime] ?? 21;
  const delta = force_delta ?? baseDelta(confidence);

  // Strike defaults to ATM
  const strike = entry_price;

  // Rough premium estimate (Black-Scholes-lite placeholder)
  // Premium ≈ entry × delta × sqrt(dte/365) × implied-vol-proxy
  const ivProxy = regime === 'VOL_EXPANSION' || regime === 'RISK_OFF_STRESS' ? 0.45 : 0.25;
  const premiumEst = entry_price * delta * Math.sqrt(dte / 365) * ivProxy;

  // Max loss for defined-risk structures
  let maxLossUsd: number | undefined;
  if (
    structure === 'CALL_DEBIT_SPREAD' ||
    structure === 'PUT_DEBIT_SPREAD' ||
    structure === 'IRON_CONDOR'
  ) {
    // Spread width assumed at 5% of entry price, capped by risk budget
    maxLossUsd = Math.min(risk_budget_usd, premiumEst * 100);
  } else if (structure === 'LONG_CALL' || structure === 'LONG_PUT') {
    maxLossUsd = premiumEst * 100; // 1 contract = 100 shares
  } else if (structure === 'STRADDLE' || structure === 'STRANGLE') {
    maxLossUsd = premiumEst * 2 * 100;
  }

  // Cap max loss to risk budget
  if (maxLossUsd != null && maxLossUsd > risk_budget_usd) {
    maxLossUsd = risk_budget_usd;
  }

  const notes = buildNotes(structure, dte, delta, regime, confidence);

  return {
    structure,
    dte,
    delta,
    strike,
    premium_est: Math.round(premiumEst * 100) / 100,
    max_loss_usd: maxLossUsd != null ? Math.round(maxLossUsd * 100) / 100 : undefined,
    notes,
  };
}

/* ------------------------------------------------------------------ */
/*  Human-readable notes                                               */
/* ------------------------------------------------------------------ */

function buildNotes(
  structure: OptionsStructure,
  dte: number,
  delta: number,
  regime: Regime,
  confidence: number,
): string {
  const parts: string[] = [];
  parts.push(`Structure: ${structure}`);
  parts.push(`DTE: ${dte}d`);
  parts.push(`Delta target: ${(delta * 100).toFixed(0)}Δ`);
  parts.push(`Regime: ${regime}`);
  parts.push(`Confidence: ${confidence}`);

  if (structure === 'IRON_CONDOR') {
    parts.push('Non-directional — range-bound play.');
  } else if (structure === 'STRADDLE') {
    parts.push('Expecting vol expansion / breakout.');
  } else if (structure.includes('SPREAD')) {
    parts.push('Defined risk — max loss = debit paid.');
  }

  return parts.join(' | ');
}
