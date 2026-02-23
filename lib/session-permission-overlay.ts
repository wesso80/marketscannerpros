// lib/session-permission-overlay.ts
// Session → Strategy Permissions Overlay
//
// Time-of-day rules that modify the Trade Permission Matrix.
// Applied AFTER base flow trade permission is computed — adjusts
// TPS, allowed/blocked lists, size cap, stop style, and minimum
// confidence / liquidity requirements per session phase.

import { SessionPhase, detectSessionPhase } from './ai/sessionPhase';
import { SessionLiquidityProfile, computeSessionLiquidityFromPhase } from './session-liquidity-engine';

export interface SessionPermissionOverlay {
  phase: SessionPhase;
  assetClass: 'equities' | 'crypto';
  liquidity: SessionLiquidityProfile;

  // ── TPS & Sizing ────────────────────────────────────────────────
  /** Additive modifier to TPS (−20 to +10 range, applied after base TPS) */
  tpsAdjustment: number;
  /** Hard cap on sizeMultiplier in this session (0-1) */
  sizeMultiplierCap: number;
  /** Hard cap on Risk Units as fraction of normal max (0-1) */
  ruCapMultiplier: number;

  // ── Strategy Overrides ──────────────────────────────────────────
  /** Extra archetypes or strategies allowed by this session */
  sessionAllowed: string[];
  /** Extra archetypes or strategies blocked by this session */
  sessionBlocked: string[];
  /** Optional stop style override (tightens during risky sessions) */
  stopStyleOverride?: 'tight_structural' | 'structural' | 'atr_trailing' | 'wider_confirmation';

  // ── Gate Thresholds ─────────────────────────────────────────────
  /** Minimum state confidence to operate (0-100, default 0 = no gate) */
  minimumConfidence: number;
  /** Minimum liquidity clarity to operate (0-100, default 0 = no gate) */
  minimumLiquidityClarity: number;
  /** Minimum TPS after adjustment to allow trading (overrides base 65) */
  minimumTps: number;

  // ── Slippage ────────────────────────────────────────────────────
  /** Multiplier on slippage estimates (>1 = worse fills) */
  slippageMultiplier: number;

  // ── Metadata ────────────────────────────────────────────────────
  /** Human-readable reason for UI / brain */
  reason: string;
  /** Whether this overlay is restrictive (true) or permissive (false) */
  restrictive: boolean;
}

// ── Equity Session Rules ────────────────────────────────────────────

function equityOverlay(phase: SessionPhase, liq: SessionLiquidityProfile): Omit<SessionPermissionOverlay, 'phase' | 'assetClass' | 'liquidity'> {
  switch (phase) {

    // ── Opening Range (first 30m) ─────────────────────────────────
    // Allow: ORB, trend continuation, breakout_early with tighter stops
    // Block: mean reversion (don't fade the open)
    case 'OPENING_RANGE':
      return {
        tpsAdjustment: 5,
        sizeMultiplierCap: 1.0,
        ruCapMultiplier: 1.0,
        sessionAllowed: [
          'ORB (Opening Range Breakout)',
          'Trend continuation off gap',
          'Momentum entries off opening drive',
        ],
        sessionBlocked: [
          'Mean reversion / fading the open',
          'Counter-trend scalps in first 15 min',
        ],
        stopStyleOverride: 'tight_structural',
        minimumConfidence: 0,
        minimumLiquidityClarity: 0,
        minimumTps: 60, // slightly lower bar — high probability window
        slippageMultiplier: 1.0,
        reason: 'OPENING_RANGE: ORB/trend-continuation window. Tighter stops, block mean reversion.',
        restrictive: false,
      };

    // ── Morning Session (10:00–11:30 ET) ──────────────────────────
    // Best trend-following window — full permissions
    case 'MORNING_SESSION':
      return {
        tpsAdjustment: 0,
        sizeMultiplierCap: 1.0,
        ruCapMultiplier: 1.0,
        sessionAllowed: [],
        sessionBlocked: [],
        minimumConfidence: 0,
        minimumLiquidityClarity: 0,
        minimumTps: 65,
        slippageMultiplier: 1.0,
        reason: 'MORNING_SESSION: Full institutional flow. Standard permissions.',
        restrictive: false,
      };

    // ── Midday (11:30–14:00 ET) ───────────────────────────────────
    // Allow: mean reversion, range scalps
    // Tighten: momentum continuation, breakout entries
    case 'MIDDAY':
      return {
        tpsAdjustment: -5,
        sizeMultiplierCap: 0.70,
        ruCapMultiplier: 0.70,
        sessionAllowed: [
          'Mean reversion to VWAP',
          'Range-bound scalps between support/resistance',
        ],
        sessionBlocked: [
          'Momentum continuation (midday breakouts frequently fail)',
          'Aggressive breakout entries (wait for power hour)',
        ],
        minimumConfidence: 0,
        minimumLiquidityClarity: 0,
        minimumTps: 70, // higher bar — need stronger conviction in chop
        slippageMultiplier: 1.3,
        reason: 'MIDDAY: Low volume chop zone. Prefer mean reversion, block momentum.',
        restrictive: true,
      };

    // ── Power Hour (14:00–15:50 ET) ───────────────────────────────
    // Renewed volume — similar to morning but watch for close positioning
    case 'POWER_HOUR':
      return {
        tpsAdjustment: 0,
        sizeMultiplierCap: 1.0,
        ruCapMultiplier: 1.0,
        sessionAllowed: [
          'Momentum continuation into close',
          'Late-day breakouts with volume confirmation',
        ],
        sessionBlocked: [],
        minimumConfidence: 0,
        minimumLiquidityClarity: 0,
        minimumTps: 65,
        slippageMultiplier: 1.0,
        reason: 'POWER_HOUR: Renewed institutional flow. Standard+ permissions.',
        restrictive: false,
      };

    // ── Close Auction / Last 15 min (15:50–16:00 ET) ──────────────
    // Tighten everything OR block unless high confidence + high liquidity
    case 'CLOSE_AUCTION':
      return {
        tpsAdjustment: -10,
        sizeMultiplierCap: 0.50,
        ruCapMultiplier: 0.50,
        sessionAllowed: [
          'Exit/trim existing positions',
        ],
        sessionBlocked: [
          'New entries without A+ confidence',
          'Breakout entries (gap risk overnight)',
          'Mean reversion (closing auction sweep risk)',
        ],
        stopStyleOverride: 'tight_structural',
        minimumConfidence: 75,
        minimumLiquidityClarity: 70,
        minimumTps: 80, // very high bar — only A+ setups
        slippageMultiplier: 1.15,
        reason: 'CLOSE_AUCTION: Last minutes — tighten or block. Gap risk high.',
        restrictive: true,
      };

    // ── Pre-Market ─────────────────────────────────────────────────
    // ALLOW_TIGHTENED: larger slippage, lower RU cap
    case 'PRE_MARKET':
      return {
        tpsAdjustment: -8,
        sizeMultiplierCap: 0.50,
        ruCapMultiplier: 0.50,
        sessionAllowed: [
          'Limit orders only (ALLOW_TIGHTENED)',
          'Gap analysis prep entries',
        ],
        sessionBlocked: [
          'Market orders (slippage too high)',
          'Scalping (spreads too wide)',
          'Large position sizing',
        ],
        stopStyleOverride: 'wider_confirmation',
        minimumConfidence: 60,
        minimumLiquidityClarity: 50,
        minimumTps: 75,
        slippageMultiplier: 1.8,
        reason: 'PRE_MARKET: Thin books, wide spreads. ALLOW_TIGHTENED, limit orders only.',
        restrictive: true,
      };

    // ── After-Hours ────────────────────────────────────────────────
    // ALLOW_TIGHTENED: larger slippage, lowest RU cap
    case 'AFTER_HOURS':
      return {
        tpsAdjustment: -12,
        sizeMultiplierCap: 0.40,
        ruCapMultiplier: 0.35,
        sessionAllowed: [
          'Limit orders only (ALLOW_TIGHTENED)',
          'Earnings reaction entries (if catalyst)',
        ],
        sessionBlocked: [
          'Market orders',
          'Scalping',
          'Large position sizing',
          'Counter-trend fades',
        ],
        stopStyleOverride: 'wider_confirmation',
        minimumConfidence: 65,
        minimumLiquidityClarity: 55,
        minimumTps: 78,
        slippageMultiplier: 2.5,
        reason: 'AFTER_HOURS: Very thin liquidity. ALLOW_TIGHTENED, minimal sizing.',
        restrictive: true,
      };

    default:
      return defaultOverlay();
  }
}

// ── Crypto Session Rules ────────────────────────────────────────────

function cryptoOverlay(phase: SessionPhase, liq: SessionLiquidityProfile): Omit<SessionPermissionOverlay, 'phase' | 'assetClass' | 'liquidity'> {
  switch (phase) {

    // ── NY + London Overlap (CRYPTO_US: 14:00–22:00 UTC) ──────────
    // Allow momentum/continuation more freely
    case 'CRYPTO_US':
      return {
        tpsAdjustment: 3,
        sizeMultiplierCap: 1.0,
        ruCapMultiplier: 1.0,
        sessionAllowed: [
          'Momentum continuation — peak liquidity window',
          'Breakout entries with volume confirmation',
          'Trend-following on funded pairs',
        ],
        sessionBlocked: [],
        minimumConfidence: 0,
        minimumLiquidityClarity: 0,
        minimumTps: 60, // slightly lower bar — best execution window
        slippageMultiplier: 1.0,
        reason: 'CRYPTO_US: NY overlap — peak crypto liquidity. Momentum/continuation permitted.',
        restrictive: false,
      };

    // ── European / London session (08:00–14:00 UTC) ───────────────
    // Good depth, allow momentum + some continuation
    case 'CRYPTO_EUROPEAN':
      return {
        tpsAdjustment: 0,
        sizeMultiplierCap: 0.90,
        ruCapMultiplier: 0.90,
        sessionAllowed: [
          'Range breakout entries',
          'Early trend confirmation',
        ],
        sessionBlocked: [],
        minimumConfidence: 0,
        minimumLiquidityClarity: 0,
        minimumTps: 65,
        slippageMultiplier: 1.1,
        reason: 'CRYPTO_EUROPEAN: Improving depth. Standard permissions.',
        restrictive: false,
      };

    // ── Asian session (00:00–08:00 UTC) ───────────────────────────
    // Moderate — tighten RU, require higher LL score for alts
    case 'CRYPTO_ASIAN':
      return {
        tpsAdjustment: -3,
        sizeMultiplierCap: 0.75,
        ruCapMultiplier: 0.75,
        sessionAllowed: [
          'BTC/ETH pairs (liquid enough)',
          'Mean reversion setups',
        ],
        sessionBlocked: [
          'Low-cap alt breakouts (too thin)',
          'Aggressive momentum on illiquid pairs',
        ],
        minimumConfidence: 0,
        minimumLiquidityClarity: 50,
        minimumTps: 68,
        slippageMultiplier: 1.2,
        reason: 'CRYPTO_ASIAN: Moderate depth. Tighten RU, avoid illiquid alts.',
        restrictive: true,
      };

    // ── Overnight thin window (22:00–00:00 UTC) ───────────────────
    // Tighten RU, require higher LL score
    case 'CRYPTO_OVERNIGHT':
      return {
        tpsAdjustment: -8,
        sizeMultiplierCap: 0.55,
        ruCapMultiplier: 0.55,
        sessionAllowed: [
          'BTC/ETH limit orders only',
        ],
        sessionBlocked: [
          'Alt-coin entries (insufficient depth)',
          'Market orders on any pair',
          'Aggressive momentum plays',
        ],
        stopStyleOverride: 'wider_confirmation',
        minimumConfidence: 55,
        minimumLiquidityClarity: 60,
        minimumTps: 75,
        slippageMultiplier: 1.6,
        reason: 'CRYPTO_OVERNIGHT: Thin window. Tighten RU, require higher liquidity clarity.',
        restrictive: true,
      };

    default:
      return defaultOverlay();
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function defaultOverlay(): Omit<SessionPermissionOverlay, 'phase' | 'assetClass' | 'liquidity'> {
  return {
    tpsAdjustment: 0,
    sizeMultiplierCap: 0.80,
    ruCapMultiplier: 0.80,
    sessionAllowed: [],
    sessionBlocked: [],
    minimumConfidence: 0,
    minimumLiquidityClarity: 0,
    minimumTps: 65,
    slippageMultiplier: 1.2,
    reason: 'UNKNOWN session — applying conservative defaults.',
    restrictive: false,
  };
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Compute the full session permission overlay for the current time.
 */
export function computeSessionPermissionOverlay(
  assetClass: 'equities' | 'crypto',
  now?: Date,
): SessionPermissionOverlay {
  const phase = detectSessionPhase(assetClass, now);
  return computeSessionPermissionOverlayFromPhase(phase, assetClass);
}

/**
 * Compute session permission overlay from an already-detected phase.
 */
export function computeSessionPermissionOverlayFromPhase(
  phase: SessionPhase,
  assetClass: 'equities' | 'crypto',
): SessionPermissionOverlay {
  const liq = computeSessionLiquidityFromPhase(phase, assetClass);
  const rules = assetClass === 'crypto'
    ? cryptoOverlay(phase, liq)
    : equityOverlay(phase, liq);

  return {
    phase,
    assetClass,
    liquidity: liq,
    ...rules,
  };
}
