// lib/session-liquidity-engine.ts
// Session → Liquidity Model
//
// Maps each session phase to a liquidity expectation per asset class.
// Consumable score + slippage/RU-cap modifiers for downstream engines.

import { SessionPhase, detectSessionPhase } from './ai/sessionPhase';

export type LiquidityExpectation = 'LOW' | 'LOW_MEDIUM' | 'MEDIUM' | 'MEDIUM_HIGH' | 'HIGH';

export interface SessionLiquidityProfile {
  phase: SessionPhase;
  assetClass: 'equities' | 'crypto';
  /** Categorical liquidity expectation */
  liquidityExpectation: LiquidityExpectation;
  /** 0-100 — mimics liquidityClarity but session-derived */
  liquidityScore: number;
  /** >1 = worse fills expected; applied to slippage estimates */
  slippageMultiplier: number;
  /** Caps effective Risk Units in thin sessions (0-1) */
  ruCapMultiplier: number;
  /** Whether the session is generally tradable */
  tradable: boolean;
  /** Human-readable note for UI / brain reasoning */
  note: string;
}

// ── Equity Liquidity Map ──────────────────────────────────────────────

const EQUITY_LIQUIDITY: Record<string, Omit<SessionLiquidityProfile, 'phase' | 'assetClass'>> = {
  PRE_MARKET: {
    liquidityExpectation: 'LOW_MEDIUM',
    liquidityScore: 35,
    slippageMultiplier: 1.8,
    ruCapMultiplier: 0.50,
    tradable: true,
    note: 'Pre-market: thin books, wide spreads. Use limit orders only.',
  },
  OPENING_RANGE: {
    liquidityExpectation: 'HIGH',
    liquidityScore: 90,
    slippageMultiplier: 1.0,
    ruCapMultiplier: 1.0,
    tradable: true,
    note: 'Opening range: peak liquidity + volatility. Best window for breakout entries.',
  },
  MORNING_SESSION: {
    liquidityExpectation: 'HIGH',
    liquidityScore: 85,
    slippageMultiplier: 1.0,
    ruCapMultiplier: 1.0,
    tradable: true,
    note: 'Morning session: strong institutional participation, reliable fills.',
  },
  MIDDAY: {
    liquidityExpectation: 'MEDIUM',
    liquidityScore: 50,
    slippageMultiplier: 1.3,
    ruCapMultiplier: 0.70,
    tradable: true,
    note: 'Midday lull: reduced volume, mean-reversion preferred. Avoid momentum chasing.',
  },
  POWER_HOUR: {
    liquidityExpectation: 'HIGH',
    liquidityScore: 85,
    slippageMultiplier: 1.0,
    ruCapMultiplier: 1.0,
    tradable: true,
    note: 'Power hour: renewed institutional flow. Momentum + continuation viable.',
  },
  CLOSE_AUCTION: {
    liquidityExpectation: 'MEDIUM_HIGH',
    liquidityScore: 70,
    slippageMultiplier: 1.15,
    ruCapMultiplier: 0.60,
    tradable: true,
    note: 'Close auction: volume spikes but gap risk high. Tighten or avoid new entries.',
  },
  AFTER_HOURS: {
    liquidityExpectation: 'LOW',
    liquidityScore: 20,
    slippageMultiplier: 2.5,
    ruCapMultiplier: 0.35,
    tradable: true,
    note: 'After-hours: very thin liquidity, large slippage. ALLOW_TIGHTENED only.',
  },
};

// ── Crypto Liquidity Map ──────────────────────────────────────────────

const CRYPTO_LIQUIDITY: Record<string, Omit<SessionLiquidityProfile, 'phase' | 'assetClass'>> = {
  CRYPTO_ASIAN: {
    liquidityExpectation: 'MEDIUM',
    liquidityScore: 55,
    slippageMultiplier: 1.2,
    ruCapMultiplier: 0.75,
    tradable: true,
    note: 'Asian session: moderate depth, BTC/ETH liquid but alts thin.',
  },
  CRYPTO_EUROPEAN: {
    liquidityExpectation: 'MEDIUM_HIGH',
    liquidityScore: 70,
    slippageMultiplier: 1.1,
    ruCapMultiplier: 0.90,
    tradable: true,
    note: 'London session: improving depth, good for range setups and early trends.',
  },
  CRYPTO_US: {
    liquidityExpectation: 'HIGH',
    liquidityScore: 90,
    slippageMultiplier: 1.0,
    ruCapMultiplier: 1.0,
    tradable: true,
    note: 'NY overlap: peak crypto liquidity. Best window for momentum + continuation.',
  },
  CRYPTO_OVERNIGHT: {
    liquidityExpectation: 'LOW_MEDIUM',
    liquidityScore: 35,
    slippageMultiplier: 1.6,
    ruCapMultiplier: 0.55,
    tradable: true,
    note: 'Overnight thin window: reduced depth, widen stops. Require higher LL score.',
  },
};

// ── Public API ────────────────────────────────────────────────────────

const FALLBACK: Omit<SessionLiquidityProfile, 'phase' | 'assetClass'> = {
  liquidityExpectation: 'MEDIUM',
  liquidityScore: 50,
  slippageMultiplier: 1.2,
  ruCapMultiplier: 0.80,
  tradable: true,
  note: 'Unknown session — defaulting to medium liquidity expectations.',
};

/**
 * Compute session liquidity profile for the current time + asset class.
 */
export function computeSessionLiquidity(
  assetClass: 'equities' | 'crypto',
  now?: Date,
): SessionLiquidityProfile {
  const phase = detectSessionPhase(assetClass, now);
  return computeSessionLiquidityFromPhase(phase, assetClass);
}

/**
 * Compute session liquidity profile from an already-detected phase.
 */
export function computeSessionLiquidityFromPhase(
  phase: SessionPhase,
  assetClass: 'equities' | 'crypto',
): SessionLiquidityProfile {
  const table = assetClass === 'crypto' ? CRYPTO_LIQUIDITY : EQUITY_LIQUIDITY;
  const row = table[phase] ?? FALLBACK;

  return {
    phase,
    assetClass,
    ...row,
  };
}

/**
 * Returns a numeric modifier (0.0–1.0) that can be multiplied into the
 * existing liquidityClarity field to incorporate session awareness.
 *
 * A HIGH-liquidity session returns 1.0 (no degradation).
 * A LOW session returns ~0.4 (significant degradation).
 */
export function sessionLiquidityModifier(
  assetClass: 'equities' | 'crypto',
  now?: Date,
): number {
  const { liquidityScore } = computeSessionLiquidity(assetClass, now);
  return Math.max(0.30, liquidityScore / 100);
}
