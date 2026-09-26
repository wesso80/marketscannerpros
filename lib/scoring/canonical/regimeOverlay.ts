/**
 * Direction-aware regime overlay. Market regime GATES and SIZES a setup; it is never blended into the setup score.
 *
 * Each condition is adverse to a side, and every condition has a mirror, so neither direction is favoured by
 * construction. Elevated volatility is adverse to BOTH sides.
 *
 *   condition            adverse to LONG                      adverse to SHORT
 *   VIX_ELEVATED         VIX ≥ 25                             VIX ≥ 25 (volatility hurts both)
 *   VIX_SHOCK            VIX +20% over 5 sessions             VIX −20% over 5 sessions (vol crush / risk-on)
 *   CREDIT               HY OAS +0.50pp over 20 obs           HY OAS −0.50pp over 20 obs
 *   LIQUIDITY            M2 3-month change < 0%               M2 3-month change > 2%
 *   SPY_TREND            SPY below SMA50 and SMA200           SPY above SMA50 and SMA200
 *   QQQ_TREND            QQQ below SMA50 and SMA200           QQQ above SMA50 and SMA200
 *   MACRO_RISK_STATE     risk_off                             risk_on
 *   FRAGILITY            high                                 low
 *
 * Output per side: adverse count → sizeMultiplier = max(0.4, 1 − 0.15 × count); ≥ 3 adverse → WATCH REGIME_ADVERSE.
 * Unavailable inputs are simply not counted (listed in `unavailable`). Forex uses the volatility condition only
 * (risk-on/off does not map to a pair's long/short side).
 */
import type { CanonicalAssetClass, CanonicalDirection, CanonicalReason } from './types';
import type { CanonicalRegimeOverlay } from './engine';

export const REGIME_OVERLAY_POLICY = {
  vixElevated: 25,
  vixShockPct: 20,
  hyOasShiftPp: 0.5,
  m2ContractPct: 0,
  m2ExpandPct: 2,
  adverseWatchCount: 3,
  sizeStep: 0.15,
  sizeFloor: 0.4,
} as const;

/** Where an input came from: the app's own tables, or a read-time fallback when those were stale (OV-1). */
export type RegimeInputSource = 'stored' | 'fred-csv' | 'alpha-vantage';

export interface IndexTrend { close: number; sma50: number; sma200: number; /** Latest bar time (ISO), when known. */ asOf?: string | null; source?: RegimeInputSource }

export interface RegimeOverlayInputs {
  /** VIX observation date (kept for existing callers; same as vix.asOf). */
  asOf?: string | null;
  vix?: { level: number; change5dPct?: number | null; asOf?: string | null; source?: RegimeInputSource } | null;
  hyOas?: { level: number; change20dPp?: number | null; asOf?: string | null; source?: RegimeInputSource } | null;
  m2?: { change3mPct: number } | null;
  spy?: IndexTrend | null;
  qqq?: IndexTrend | null;
  macroRiskState?: 'risk_on' | 'neutral' | 'risk_off' | null;
  fragility?: 'high' | 'normal' | 'low' | null;
}

export interface RegimeOverlayResult {
  asOf: string | null;
  adverse: Record<CanonicalDirection, CanonicalReason[]>;
  unavailable: string[];
  sizeMultiplier: Record<CanonicalDirection, number>;
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function trendSide(t: IndexTrend | null | undefined): 'below' | 'above' | 'mixed' | null {
  if (!t || !fin(t.close) || !fin(t.sma50) || !fin(t.sma200)) return null;
  if (t.close < t.sma50 && t.close < t.sma200) return 'below';
  if (t.close > t.sma50 && t.close > t.sma200) return 'above';
  return 'mixed';
}

export function evaluateRegimeOverlay(inputs: RegimeOverlayInputs, assetClass: CanonicalAssetClass): RegimeOverlayResult {
  const P = REGIME_OVERLAY_POLICY;
  const long: CanonicalReason[] = [], short: CanonicalReason[] = [];
  const unavailable: string[] = [];
  const add = (side: 'long' | 'short' | 'both', code: string, message: string) => {
    if (side !== 'short') long.push({ code, message });
    if (side !== 'long') short.push({ code, message });
  };
  const riskAsset = assetClass !== 'forex';

  const vix = inputs.vix;
  if (vix && fin(vix.level)) {
    if (vix.level >= P.vixElevated) add('both', 'VIX_ELEVATED', `VIX ${vix.level.toFixed(1)} ≥ ${P.vixElevated}`);
    if (riskAsset && fin(vix.change5dPct)) {
      if (vix.change5dPct >= P.vixShockPct) add('long', 'VIX_SHOCK', `VIX +${vix.change5dPct.toFixed(0)}% in 5 sessions`);
      else if (vix.change5dPct <= -P.vixShockPct) add('short', 'VIX_SHOCK', `VIX ${vix.change5dPct.toFixed(0)}% in 5 sessions`);
    }
  } else unavailable.push('VIX');

  if (riskAsset) {
    const hy = inputs.hyOas;
    if (hy && fin(hy.change20dPp)) {
      if (hy.change20dPp >= P.hyOasShiftPp) add('long', 'CREDIT', `HY OAS widened ${hy.change20dPp.toFixed(2)}pp (20 obs)`);
      else if (hy.change20dPp <= -P.hyOasShiftPp) add('short', 'CREDIT', `HY OAS tightened ${hy.change20dPp.toFixed(2)}pp (20 obs)`);
    } else unavailable.push('HY_OAS');

    const m2 = inputs.m2;
    if (m2 && fin(m2.change3mPct)) {
      if (m2.change3mPct < P.m2ContractPct) add('long', 'LIQUIDITY', `M2 contracting (${m2.change3mPct.toFixed(2)}% over 3 months)`);
      else if (m2.change3mPct > P.m2ExpandPct) add('short', 'LIQUIDITY', `M2 expanding fast (+${m2.change3mPct.toFixed(2)}% over 3 months)`);
    } else unavailable.push('M2');

    for (const [key, t] of [['SPY', inputs.spy], ['QQQ', inputs.qqq]] as const) {
      const side = trendSide(t);
      if (side === null) unavailable.push(key);
      else if (side === 'below') add('long', `${key}_TREND`, `${key} below its 50- and 200-day averages`);
      else if (side === 'above') add('short', `${key}_TREND`, `${key} above its 50- and 200-day averages`);
    }

    if (inputs.macroRiskState == null) unavailable.push('MACRO_RISK_STATE');
    else if (inputs.macroRiskState === 'risk_off') add('long', 'MACRO_RISK_STATE', 'Macro regime risk-off');
    else if (inputs.macroRiskState === 'risk_on') add('short', 'MACRO_RISK_STATE', 'Macro regime risk-on');

    if (inputs.fragility == null) unavailable.push('FRAGILITY');
    else if (inputs.fragility === 'high') add('long', 'FRAGILITY', 'Market fragility high');
    else if (inputs.fragility === 'low') add('short', 'FRAGILITY', 'Market fragility low (complacent tape)');
  }

  const size = (n: number) => Number(Math.max(P.sizeFloor, 1 - P.sizeStep * n).toFixed(2));
  return { asOf: inputs.asOf ?? null, adverse: { long, short }, unavailable, sizeMultiplier: { long: size(long.length), short: size(short.length) } };
}

/** Adapter for evaluateCanonical({ regimeOverlay }). */
export function overlayForDirection(result: RegimeOverlayResult): (direction: CanonicalDirection) => CanonicalRegimeOverlay {
  return (direction) => {
    const adverse = result.adverse[direction];
    const codes = adverse.map((a) => a.code).join(', ');
    const watchReasons: CanonicalReason[] = adverse.length >= REGIME_OVERLAY_POLICY.adverseWatchCount
      ? [{ code: 'REGIME_ADVERSE', message: `${adverse.length} regime conditions adverse to a ${direction}: ${codes}` }]
      : [];
    const flags: CanonicalReason[] = adverse.length && !watchReasons.length
      ? [{ code: 'REGIME_HEADWIND', message: `Regime headwind for a ${direction}: ${codes} (size ×${result.sizeMultiplier[direction]})` }]
      : [];
    return { sizeMultiplier: result.sizeMultiplier[direction], watchReasons, flags };
  };
}
