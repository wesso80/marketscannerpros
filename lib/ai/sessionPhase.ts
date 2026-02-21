// lib/ai/sessionPhase.ts
// Time-of-Day Matrix Overlay — Session Phase Awareness
//
// A breakout at 9:35am != 3:45pm.
// This module tags the current session phase and applies strategy-specific modifiers.

export type SessionPhase =
  | 'PRE_MARKET'        // Before open
  | 'OPENING_RANGE'     // First 30 min (9:30-10:00 ET)
  | 'MORNING_SESSION'   // 10:00-11:30 ET
  | 'MIDDAY'            // 11:30-14:00 ET (lunch, low vol)
  | 'POWER_HOUR'        // 14:00-15:50 ET (late push)
  | 'CLOSE_AUCTION'     // Last 10 min (15:50-16:00 ET)
  | 'AFTER_HOURS'       // Post-close
  | 'CRYPTO_ASIAN'      // 00:00-08:00 UTC
  | 'CRYPTO_EUROPEAN'   // 08:00-14:00 UTC
  | 'CRYPTO_US'         // 14:00-22:00 UTC
  | 'CRYPTO_OVERNIGHT'  // 22:00-00:00 UTC
  | 'UNKNOWN';

export type SetupType = 'breakout' | 'mean_reversion' | 'momentum' | 'trend_follow' | 'scalp' | 'swing';

export interface SessionPhaseResult {
  phase: SessionPhase;
  /** Strategy-specific multiplier for this phase (0.5–1.2) */
  multiplier: number;
  /** Whether this phase is generally favorable for trading */
  favorable: boolean;
  /** Reason code for prompt injection */
  reason: string;
  /** Current hour (ET for equities, UTC for crypto) */
  hour: number;
  /** Asset class used for phase detection */
  assetClass: 'equities' | 'crypto';
}

// Phase × Setup multipliers for equities
const EQUITY_PHASE_MULTIPLIERS: Record<string, Record<SetupType, number>> = {
  PRE_MARKET: {
    breakout: 0.70,       // Low liquidity breakouts unreliable
    mean_reversion: 0.65, // Thin books = wide spreads
    momentum: 0.75,
    trend_follow: 0.70,
    scalp: 0.60,          // Scalps need tight spreads
    swing: 0.80,          // Swing entries less time-sensitive
  },
  OPENING_RANGE: {
    breakout: 1.15,       // Opening range breakouts are highest probability
    mean_reversion: 0.75, // Don't fade the open
    momentum: 1.10,       // Momentum strongest at open
    trend_follow: 1.05,
    scalp: 1.00,
    swing: 0.90,          // Wait for range to form
  },
  MORNING_SESSION: {
    breakout: 1.05,
    mean_reversion: 0.90,
    momentum: 1.05,
    trend_follow: 1.10,   // Best session for trend following
    scalp: 1.00,
    swing: 1.05,
  },
  MIDDAY: {
    breakout: 0.70,       // Midday breakouts often fail (low vol)
    mean_reversion: 1.10, // Mean reversion thrives in chop
    momentum: 0.70,       // Momentum dies midday
    trend_follow: 0.80,
    scalp: 0.85,
    swing: 0.95,
  },
  POWER_HOUR: {
    breakout: 1.05,
    mean_reversion: 0.85,
    momentum: 1.10,       // Momentum returns for close
    trend_follow: 1.00,
    scalp: 1.00,
    swing: 1.00,
  },
  CLOSE_AUCTION: {
    breakout: 0.60,       // Last 10 min — breakouts dangerous
    mean_reversion: 0.70, // Fading EOD = risky gap exposure
    momentum: 0.70,
    trend_follow: 0.75,
    scalp: 0.65,
    swing: 0.85,          // Swing OK — holding overnight anyway
  },
  AFTER_HOURS: {
    breakout: 0.60,
    mean_reversion: 0.55,
    momentum: 0.60,
    trend_follow: 0.60,
    scalp: 0.50,          // Don't scalp after hours
    swing: 0.75,
  },
};

// Phase × Setup multipliers for crypto
const CRYPTO_PHASE_MULTIPLIERS: Record<string, Record<SetupType, number>> = {
  CRYPTO_ASIAN: {
    breakout: 0.90,
    mean_reversion: 1.00,
    momentum: 0.85,       // Asian session lower vol
    trend_follow: 0.95,
    scalp: 0.90,
    swing: 1.00,
  },
  CRYPTO_EUROPEAN: {
    breakout: 1.05,
    mean_reversion: 0.95,
    momentum: 1.05,
    trend_follow: 1.05,
    scalp: 1.00,
    swing: 1.00,
  },
  CRYPTO_US: {
    breakout: 1.10,       // US session brings most liquidity + vol
    mean_reversion: 0.90,
    momentum: 1.10,
    trend_follow: 1.10,
    scalp: 1.05,
    swing: 1.00,
  },
  CRYPTO_OVERNIGHT: {
    breakout: 0.75,       // Low liquidity zone
    mean_reversion: 0.85,
    momentum: 0.70,
    trend_follow: 0.80,
    scalp: 0.70,
    swing: 0.90,
  },
};

/**
 * Detect current session phase based on time and asset class.
 * Equities: Uses ET (UTC-5 standard, UTC-4 DST — we use UTC-5 for safety).
 * Crypto: Uses UTC directly (24/7 market).
 */
export function detectSessionPhase(
  assetClass: 'equities' | 'crypto',
  now?: Date
): SessionPhase {
  const d = now ?? new Date();
  const utcHour = d.getUTCHours();
  const utcMin = d.getUTCMinutes();

  if (assetClass === 'crypto') {
    if (utcHour >= 0 && utcHour < 8) return 'CRYPTO_ASIAN';
    if (utcHour >= 8 && utcHour < 14) return 'CRYPTO_EUROPEAN';
    if (utcHour >= 14 && utcHour < 22) return 'CRYPTO_US';
    return 'CRYPTO_OVERNIGHT';
  }

  // Equities: Convert to ET (UTC-5 — conservative, ignores DST for safety)
  const etHour = (utcHour - 5 + 24) % 24;
  const etTotal = etHour * 60 + utcMin; // Minutes since midnight ET

  if (etTotal < 9 * 60 + 30) return 'PRE_MARKET';           // Before 9:30
  if (etTotal < 10 * 60) return 'OPENING_RANGE';             // 9:30-10:00
  if (etTotal < 11 * 60 + 30) return 'MORNING_SESSION';      // 10:00-11:30
  if (etTotal < 14 * 60) return 'MIDDAY';                    // 11:30-14:00
  if (etTotal < 15 * 60 + 50) return 'POWER_HOUR';           // 14:00-15:50
  if (etTotal < 16 * 60) return 'CLOSE_AUCTION';             // 15:50-16:00
  return 'AFTER_HOURS';                                       // After 16:00
}

/**
 * Get the session phase multiplier for a given setup type.
 */
export function getSessionPhaseMultiplier(
  phase: SessionPhase,
  setupType?: SetupType
): number {
  if (!setupType) return 0.90; // No setup type → conservative

  if (phase === 'UNKNOWN') return 1.00;

  const isCrypto = phase.startsWith('CRYPTO_');
  const table = isCrypto ? CRYPTO_PHASE_MULTIPLIERS : EQUITY_PHASE_MULTIPLIERS;
  const row = table[phase];

  if (!row) return 1.00;
  return row[setupType] ?? 0.90;
}

/**
 * Compute full session phase overlay result.
 */
export function computeSessionPhaseOverlay(
  assetClass: 'equities' | 'crypto',
  setupType?: SetupType,
  now?: Date
): SessionPhaseResult {
  const phase = detectSessionPhase(assetClass, now);
  const multiplier = getSessionPhaseMultiplier(phase, setupType);

  const d = now ?? new Date();
  const utcHour = d.getUTCHours();
  const displayHour = assetClass === 'crypto' ? utcHour : (utcHour - 5 + 24) % 24;

  // Determine if favorable
  let favorable = multiplier >= 0.95;
  let reason: string;

  if (multiplier >= 1.05) {
    reason = `SESSION_BOOST: ${phase} favors ${setupType || 'general'} (×${multiplier.toFixed(2)})`;
  } else if (multiplier < 0.75) {
    reason = `SESSION_PENALTY: ${phase} strongly unfavorable for ${setupType || 'general'} (×${multiplier.toFixed(2)})`;
    favorable = false;
  } else if (multiplier < 0.90) {
    reason = `SESSION_CAUTION: ${phase} suboptimal for ${setupType || 'general'} (×${multiplier.toFixed(2)})`;
    favorable = false;
  } else {
    reason = `SESSION_NEUTRAL: ${phase} (×${multiplier.toFixed(2)})`;
  }

  return {
    phase,
    multiplier,
    favorable,
    reason,
    hour: displayHour,
    assetClass,
  };
}
