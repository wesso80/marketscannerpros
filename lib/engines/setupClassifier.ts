/**
 * Setup Classifier
 *
 * Maps an AdminSymbolIntelligence snapshot to one of the internal
 * SetupType research playbooks. Pure function — no I/O.
 *
 * Boundary: classifier returns a *research label*, never a trade plan.
 */

import type { AdminSymbolIntelligence } from "@/lib/admin/types";
import type { SetupDefinition, SetupType } from "@/lib/admin/adminTypes";

const DEFINITIONS: Record<SetupType, SetupDefinition> = {
  TREND_CONTINUATION: {
    type: "TREND_CONTINUATION",
    label: "Trend Continuation",
    description: "Price aligned with stacked EMAs and ADX > 20.",
    polarity: "EITHER",
  },
  TREND_PULLBACK: {
    type: "TREND_PULLBACK",
    label: "Trend Pullback",
    description: "Counter-trend retrace into the dominant moving average.",
    polarity: "EITHER",
  },
  RANGE_REVERSION: {
    type: "RANGE_REVERSION",
    label: "Range Reversion",
    description: "Mean-reversion candidate inside a low-ADX range.",
    polarity: "EITHER",
  },
  RANGE_BREAKOUT: {
    type: "RANGE_BREAKOUT",
    label: "Range Breakout",
    description: "Compression resolving with expansion in volatility.",
    polarity: "EITHER",
  },
  FAILED_BREAKOUT: {
    type: "FAILED_BREAKOUT",
    label: "Failed Breakout",
    description: "Breakout reclaimed; trapped participants unwinding.",
    polarity: "EITHER",
  },
  LIQUIDITY_SWEEP: {
    type: "LIQUIDITY_SWEEP",
    label: "Liquidity Sweep",
    description: "Stop run beyond a key level then reversal back inside.",
    polarity: "EITHER",
  },
  SQUEEZE_EXPANSION: {
    type: "SQUEEZE_EXPANSION",
    label: "Squeeze Expansion",
    description: "Bollinger-band squeeze (BBWP low) firing into expansion.",
    polarity: "EITHER",
  },
  VOLATILITY_CONTRACTION: {
    type: "VOLATILITY_CONTRACTION",
    label: "Volatility Contraction",
    description: "BBWP at multi-month lows; pre-expansion watch.",
    polarity: "NEUTRAL",
  },
  GAP_FILL: {
    type: "GAP_FILL",
    label: "Gap Fill",
    description: "Magnet move toward an unresolved prior-session gap.",
    polarity: "EITHER",
  },
  EXHAUSTION_FADE: {
    type: "EXHAUSTION_FADE",
    label: "Exhaustion Fade",
    description: "DVE flags exhaustion; counter-trend research candidate.",
    polarity: "EITHER",
  },
  HIGHER_TIMEFRAME_REJECTION: {
    type: "HIGHER_TIMEFRAME_REJECTION",
    label: "HTF Rejection",
    description: "Rejection at a higher-timeframe level.",
    polarity: "EITHER",
  },
  RECLAIM_AND_HOLD: {
    type: "RECLAIM_AND_HOLD",
    label: "Reclaim & Hold",
    description: "Lost level reclaimed and confirmed by structure.",
    polarity: "LONG",
  },
  BREAKDOWN_RETEST: {
    type: "BREAKDOWN_RETEST",
    label: "Breakdown Retest",
    description: "Breakdown level retested from below.",
    polarity: "SHORT",
  },
  MOMENTUM_IGNITION: {
    type: "MOMENTUM_IGNITION",
    label: "Momentum Ignition",
    description: "Relative-volume spike with directional thrust.",
    polarity: "EITHER",
  },
  MEAN_REVERSION_TRAP: {
    type: "MEAN_REVERSION_TRAP",
    label: "Mean Reversion Trap",
    description: "Apparent reversion into continuation.",
    polarity: "EITHER",
  },
  NO_SETUP: {
    type: "NO_SETUP",
    label: "No Setup",
    description: "No qualifying research thesis on this snapshot.",
    polarity: "NEUTRAL",
  },
};

export function getSetupDefinition(type: SetupType): SetupDefinition {
  return DEFINITIONS[type];
}

export function listSetupDefinitions(): SetupDefinition[] {
  return Object.values(DEFINITIONS);
}

/* ───────────── Classifier ───────────── */

export function classifySetup(snapshot: AdminSymbolIntelligence): SetupDefinition {
  const i = snapshot.indicators;
  const dve = snapshot.dve;
  const bias = snapshot.bias;
  const price = snapshot.price;

  if (!Number.isFinite(price) || !i || !dve) return DEFINITIONS.NO_SETUP;

  // 1. Trapped reversal — DVE explicit trap
  if (dve.trap) return DEFINITIONS.FAILED_BREAKOUT;

  // 2. Exhaustion — DVE explicit exhaustion
  if (dve.exhaustion) return DEFINITIONS.EXHAUSTION_FADE;

  // 3. Strong squeeze (BBWP low) — pending expansion vs in-progress expansion
  const bbwp = i.bbwpPercentile ?? 50;
  if (bbwp <= 10 && (dve.breakoutReadiness ?? 0) >= 0.7) {
    return DEFINITIONS.SQUEEZE_EXPANSION;
  }
  if (bbwp <= 10) return DEFINITIONS.VOLATILITY_CONTRACTION;

  // 4. Momentum ignition — relative-volume surge
  if ((i.rvol ?? 0) >= 2.0 && bias !== "NEUTRAL") {
    return DEFINITIONS.MOMENTUM_IGNITION;
  }

  // 5. Trending tape — ADX gate
  const adx = i.adx ?? 0;
  if (adx >= 25) {
    const stackedUp = price > i.ema20 && i.ema20 > i.ema50 && i.ema50 > i.ema200;
    const stackedDown = price < i.ema20 && i.ema20 < i.ema50 && i.ema50 < i.ema200;
    if ((stackedUp && bias === "LONG") || (stackedDown && bias === "SHORT")) {
      // Pullback if currently between price and the 20-EMA (small distance)
      const distancePct = Math.abs((price - i.ema20) / i.ema20);
      return distancePct <= 0.005 ? DEFINITIONS.TREND_PULLBACK : DEFINITIONS.TREND_CONTINUATION;
    }
    if ((stackedUp && bias === "SHORT") || (stackedDown && bias === "LONG")) {
      return DEFINITIONS.HIGHER_TIMEFRAME_REJECTION;
    }
  }

  // 6. Range tape — low ADX
  if (adx > 0 && adx < 18) {
    // Near band edge → reversion; mid range → range_breakout watch
    const span = snapshot.levels?.weeklyHigh - snapshot.levels?.weeklyLow;
    if (span > 0) {
      const fromLow = (price - snapshot.levels.weeklyLow) / span;
      if (fromLow <= 0.15 || fromLow >= 0.85) return DEFINITIONS.RANGE_REVERSION;
    }
    return DEFINITIONS.RANGE_BREAKOUT;
  }

  // 7. Reclaim / breakdown — VWAP-relative
  const vwap = i.vwap ?? snapshot.levels?.vwap ?? 0;
  if (vwap > 0) {
    if (bias === "LONG" && price > vwap && Math.abs((price - vwap) / vwap) < 0.005) {
      return DEFINITIONS.RECLAIM_AND_HOLD;
    }
    if (bias === "SHORT" && price < vwap && Math.abs((price - vwap) / vwap) < 0.005) {
      return DEFINITIONS.BREAKDOWN_RETEST;
    }
  }

  // 8. Liquidity sweep — wick beyond PDH/PDL within range
  const lvl = snapshot.levels;
  if (lvl) {
    if (bias === "LONG" && price > lvl.pdl && lvl.pdl > 0 && (price - lvl.pdl) / lvl.pdl < 0.01) {
      return DEFINITIONS.LIQUIDITY_SWEEP;
    }
    if (bias === "SHORT" && price < lvl.pdh && lvl.pdh > 0 && (lvl.pdh - price) / lvl.pdh < 0.01) {
      return DEFINITIONS.LIQUIDITY_SWEEP;
    }
  }

  return DEFINITIONS.NO_SETUP;
}
