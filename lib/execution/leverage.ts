/**
 * Execution Engine — Leverage Module
 *
 * Recommends max and safe leverage based on asset class, regime,
 * volatility (ATR-%), and risk mode.
 */

import type { Regime, RiskMode } from '@/lib/risk-governor-hard';
import type { AssetClass, LeverageResult } from './types';

/* ------------------------------------------------------------------ */
/*  Hard Caps per Asset Class                                          */
/* ------------------------------------------------------------------ */

const LEVERAGE_CAPS: Record<string, number> = {
  equity: 4,       // Reg-T day-trade margin
  crypto: 20,      // exchange typical max
  futures: 50,     // exchange margin varies
  forex: 50,       // retail limit (varies by jurisdiction)
  options: 1,      // no leverage on long options
};

/* ------------------------------------------------------------------ */
/*  Regime multipliers (fraction of cap allowed)                       */
/* ------------------------------------------------------------------ */

function regimeFraction(regime: Regime): number {
  switch (regime) {
    case 'TREND_UP':
    case 'TREND_DOWN':
      return 0.75;
    case 'RANGE_NEUTRAL':
      return 0.50;
    case 'VOL_CONTRACTION':
      return 0.60;
    case 'VOL_EXPANSION':
      return 0.35;
    case 'RISK_OFF_STRESS':
      return 0.20;
    default:
      return 0.50;
  }
}

/* ------------------------------------------------------------------ */
/*  Risk-mode dampener                                                 */
/* ------------------------------------------------------------------ */

function riskModeFraction(mode: RiskMode): number {
  switch (mode) {
    case 'NORMAL':
      return 1.0;
    case 'THROTTLED':
      return 0.60;
    case 'DEFENSIVE':
      return 0.30;
    case 'LOCKED':
      return 0;
    default:
      return 0.50;
  }
}

/* ------------------------------------------------------------------ */
/*  Volatility scalar                                                  */
/* ------------------------------------------------------------------ */

function volScalar(atrPercent: number): number {
  // Higher ATR% → lower leverage
  if (atrPercent >= 8) return 0.15;
  if (atrPercent >= 5) return 0.30;
  if (atrPercent >= 3) return 0.50;
  if (atrPercent >= 1.5) return 0.75;
  return 1.0;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export function computeLeverage(input: {
  asset_class: AssetClass;
  regime: Regime;
  risk_mode: RiskMode;
  atr_percent: number;
  /** Caller can override */
  override_leverage?: number;
}): LeverageResult {
  const { asset_class, regime, risk_mode, atr_percent, override_leverage } = input;

  const cap = LEVERAGE_CAPS[asset_class as string] ?? 1;

  if (cap <= 1) {
    // Options / unknown — no leverage
    return {
      max_leverage: 1,
      recommended_leverage: 1,
      capped: false,
    };
  }

  const raw =
    cap *
    regimeFraction(regime) *
    riskModeFraction(risk_mode) *
    volScalar(atr_percent);

  // At least 1× leverage
  const recommended = Math.max(1, Math.round(raw * 100) / 100);
  const max = cap;

  // If caller overrides, cap it
  if (override_leverage != null && override_leverage > 0) {
    if (override_leverage > max) {
      return {
        max_leverage: max,
        recommended_leverage: Math.min(override_leverage, max),
        capped: true,
        cap_reason: `Override ${override_leverage}× exceeds ${asset_class} cap ${max}×.`,
      };
    }
    if (override_leverage > recommended * 1.5) {
      return {
        max_leverage: max,
        recommended_leverage: override_leverage,
        capped: true,
        cap_reason: `Override ${override_leverage}× is above recommended ${recommended}× — elevated risk.`,
      };
    }
    return {
      max_leverage: max,
      recommended_leverage: override_leverage,
      capped: false,
    };
  }

  return {
    max_leverage: max,
    recommended_leverage: recommended,
    capped: false,
  };
}
