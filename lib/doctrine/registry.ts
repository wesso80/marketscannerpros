/* ═══════════════════════════════════════════════════════════════════════════
   MSP v3 — ARCA Doctrine Registry
   All playbook definitions with entry criteria, risk models, and failure signals.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { Playbook } from './types';

export const PLAYBOOKS: readonly Playbook[] = [
  // ── Breakout Patterns ───────────────────────────────────────────────────────

  {
    id: 'compression_breakout',
    label: 'Compression → Expansion',
    description: 'Volatility coils tight (BBWP < 20), then breaks out with volume expansion.',
    compatibleRegimes: ['compression', 'transition'],
    adverseRegimes: ['range'],
    direction: 'either',
    category: 'breakout',
    entryCriteria: [
      'BBWP < 20 (volatility compressed)',
      'Bollinger Bands squeezing or Keltner inside BB',
      'Volume declining during compression',
      'Time confluence cluster aligning within 2 candles',
    ],
    confluenceRequirements: {
      minConfluence: 65,
      minConfidence: 55,
      minTimeAlignment: 50,
      requireDveState: ['compression', 'transition'],
    },
    riskModel: {
      stopDescription: 'Below compression range low (longs) or above range high (shorts)',
      targetDescription: '1.5x ATR expansion from breakout level, then trail',
      defaultRR: 2.0,
    },
    expectedProfile: {
      avgHoldingPeriod: '1-5 days',
      typicalMove: '3-8% from breakout',
    },
    failureSignals: [
      'False breakout — price re-enters compression range',
      'Volume fades on breakout candle',
      'Opposing cross-market headwind emerges',
    ],
  },

  {
    id: 'vol_expansion_breakout',
    label: 'Volatility Expansion Breakout',
    description: 'DVE shifts to expansion regime with increasing BBWP and volume surge.',
    compatibleRegimes: ['expansion', 'transition'],
    adverseRegimes: ['compression'],
    direction: 'either',
    category: 'breakout',
    entryCriteria: [
      'DVE regime is Expansion',
      'BBWP > 70 and rising',
      'Volume > 1.5x average',
      'Price clearing key resistance (longs) or support (shorts)',
    ],
    confluenceRequirements: {
      minConfluence: 70,
      minConfidence: 60,
    },
    riskModel: {
      stopDescription: 'Below breakout candle low (longs) or above breakout candle high (shorts)',
      targetDescription: 'Expected move from options chain, or 2x ATR',
      defaultRR: 2.5,
    },
    expectedProfile: {
      avgHoldingPeriod: '1-3 days',
      typicalMove: '4-10% move',
    },
    failureSignals: [
      'Volume dries up after initial expansion',
      'Price stalls at next resistance within 2 candles',
      'VIX spike reverses risk appetite',
    ],
  },

  // ── Continuation Patterns ───────────────────────────────────────────────────

  {
    id: 'trend_continuation',
    label: 'Trend Continuation',
    description: 'Strong trend with pullback absorbed, momentum resuming.',
    compatibleRegimes: ['trend'],
    adverseRegimes: ['range', 'compression'],
    direction: 'either',
    category: 'continuation',
    entryCriteria: [
      'Clear trend established (EMA9 > EMA21 > EMA50 for longs)',
      'RSI between 45-65 (not overextended)',
      'Pullback to structure support (EMA21 or prior breakout)',
      'Volume picks up on resume candle',
    ],
    confluenceRequirements: {
      minConfluence: 60,
      minConfidence: 55,
      minTimeAlignment: 40,
    },
    riskModel: {
      stopDescription: 'Below pullback low or structure support',
      targetDescription: 'Prior swing high, then trail on expansion',
      defaultRR: 2.0,
    },
    expectedProfile: {
      avgHoldingPeriod: '2-7 days',
      typicalMove: '3-6% continuation',
    },
    failureSignals: [
      'EMA crossover against trend direction',
      'RSI divergence (price higher, RSI lower)',
      'Volume expansion on selloff',
    ],
  },

  {
    id: 'trend_pullback',
    label: 'Trend Pullback Entry',
    description: 'Established trend, price pulls back to key structure level for entry.',
    compatibleRegimes: ['trend'],
    adverseRegimes: ['range'],
    direction: 'either',
    category: 'continuation',
    entryCriteria: [
      'Trend regime confirmed',
      'Pullback to EMA21/50 or horizontal structure',
      'DVE in neutral or compression (vol pause)',
      'Bullish/bearish engulfing or hammer at structure',
    ],
    confluenceRequirements: {
      minConfluence: 60,
      minConfidence: 50,
      requireDveState: ['neutral', 'compression'],
    },
    riskModel: {
      stopDescription: 'Below structure level + buffer (0.5x ATR)',
      targetDescription: 'Prior swing extreme, then trail',
      defaultRR: 2.5,
    },
    expectedProfile: {
      avgHoldingPeriod: '3-10 days',
      typicalMove: '4-8% from pullback level',
    },
    failureSignals: [
      'Price closes below structure (invalidation)',
      'Regime shifts from trend to range',
      'Cross-market turns headwind',
    ],
  },

  // ── Reversal Patterns ───────────────────────────────────────────────────────

  {
    id: 'liquidity_sweep_reversal',
    label: 'Liquidity Sweep → Reversal',
    description: 'Price wicks beyond key level sweeping stops, then snaps back inside range.',
    compatibleRegimes: ['range', 'transition'],
    adverseRegimes: ['trend'],
    direction: 'either',
    category: 'reversal',
    entryCriteria: [
      'Range regime established with clear high/low',
      'Wick extends beyond range boundary (liquidity sweep)',
      'Quick reversal back inside range within 1-2 candles',
      'Volume spike on sweep, then volume decline',
    ],
    confluenceRequirements: {
      minConfluence: 65,
      minConfidence: 55,
      minTimeAlignment: 45,
    },
    riskModel: {
      stopDescription: 'Beyond the sweep wick extreme',
      targetDescription: 'Range midpoint, then opposite range boundary',
      defaultRR: 2.0,
    },
    expectedProfile: {
      avgHoldingPeriod: '1-4 days',
      typicalMove: '2-5% snap back',
    },
    failureSignals: [
      'Price fails to re-enter range — breakdown/breakout confirmed',
      'Follow-through volume in sweep direction',
      'Regime shifts to trend (range is broken)',
    ],
  },

  {
    id: 'range_fade',
    label: 'Range High/Low Fade',
    description: 'Price approaches range extremes with rejection signals.',
    compatibleRegimes: ['range'],
    adverseRegimes: ['trend', 'expansion'],
    direction: 'either',
    category: 'reversal',
    entryCriteria: [
      'Range regime with defined high/low boundaries',
      'Price at range extreme (within 1% of boundary)',
      'Rejection candle pattern (pin bar, engulfing)',
      'Options flow opposing continuation (puts at highs, calls at lows)',
    ],
    confluenceRequirements: {
      minConfluence: 60,
      minConfidence: 50,
      requireOptionsFlow: true,
    },
    riskModel: {
      stopDescription: 'Beyond range boundary + 0.5x ATR buffer',
      targetDescription: 'Range midpoint, then opposite boundary',
      defaultRR: 1.8,
    },
    expectedProfile: {
      avgHoldingPeriod: '2-5 days',
      typicalMove: '2-4% toward midpoint',
    },
    failureSignals: [
      'Range breakout with volume confirmation',
      'Regime shifts away from range',
      'Strong trend momentum overwhelms fade',
    ],
  },

  // ── Squeeze Patterns ────────────────────────────────────────────────────────

  {
    id: 'gamma_pin',
    label: 'Gamma Pin Near Expiry',
    description: 'Price gravitates toward max OI/gamma strike as expiry approaches.',
    compatibleRegimes: ['range', 'compression'],
    adverseRegimes: ['expansion'],
    direction: 'either',
    category: 'squeeze',
    entryCriteria: [
      'Options expiry within 3 days (OPEX proximity)',
      'Max OI strike clearly defined',
      'Positive gamma environment (dealer hedging pulls price to strike)',
      'Low realized volatility (vol compression supports pin)',
    ],
    confluenceRequirements: {
      minConfidence: 50,
      requireOptionsFlow: true,
      requireDveState: ['neutral', 'compression'],
    },
    riskModel: {
      stopDescription: 'Beyond expected move range for the expiry',
      targetDescription: 'Max OI strike as magnet target',
      defaultRR: 1.5,
    },
    expectedProfile: {
      avgHoldingPeriod: '1-3 days (to expiry)',
      typicalMove: '1-3% drift to pin',
    },
    failureSignals: [
      'Large macro catalyst overrides pin dynamics',
      'Negative gamma environment (dealer hedging accelerates moves)',
      'Volume explosion breaks pin gravity',
    ],
  },

  {
    id: 'gamma_squeeze',
    label: 'Gamma Squeeze',
    description: 'Negative gamma environment causes dealer hedging to amplify the move.',
    compatibleRegimes: ['transition', 'expansion'],
    adverseRegimes: ['compression'],
    direction: 'either',
    category: 'squeeze',
    entryCriteria: [
      'Negative gamma exposure (dealers short gamma)',
      'OI concentrated at nearby strikes',
      'Price approaching gamma flip level',
      'Volatility expanding (DVE transition/expansion)',
    ],
    confluenceRequirements: {
      minConfluence: 70,
      minConfidence: 60,
      requireOptionsFlow: true,
      requireDveState: ['transition', 'expansion'],
    },
    riskModel: {
      stopDescription: 'Below gamma flip level',
      targetDescription: 'Expected move boundary from options pricing',
      defaultRR: 3.0,
    },
    expectedProfile: {
      avgHoldingPeriod: '1-2 days',
      typicalMove: '5-15% accelerated move',
    },
    failureSignals: [
      'Gamma flips positive (dealer hedging reverses)',
      'Volume collapses after initial squeeze',
      'Major reversal pattern at resistance',
    ],
  },

  // ── Mean Reversion ──────────────────────────────────────────────────────────

  {
    id: 'mean_reversion',
    label: 'Mean Reversion',
    description: 'Overextended price snaps back to moving average or VWAP.',
    compatibleRegimes: ['range', 'expansion'],
    adverseRegimes: ['trend'],
    direction: 'either',
    category: 'mean_reversion',
    entryCriteria: [
      'RSI < 25 (oversold) or RSI > 75 (overbought)',
      'Price > 2 standard deviations from 20-period mean',
      'BBWP elevated (expansion regime ongoing)',
      'Reversal candle pattern at extreme',
    ],
    confluenceRequirements: {
      minConfluence: 55,
      minConfidence: 50,
    },
    riskModel: {
      stopDescription: 'Beyond the extreme + 0.5x ATR',
      targetDescription: '20-period mean or VWAP',
      defaultRR: 1.5,
    },
    expectedProfile: {
      avgHoldingPeriod: '1-3 days',
      typicalMove: '2-4% reversion',
    },
    failureSignals: [
      'Trend regime persists — overextension continues',
      'No volume on reversal attempt',
      'Cross-market confirms continuation not reversal',
    ],
  },

  // ── Momentum ────────────────────────────────────────────────────────────────

  {
    id: 'momentum_burst',
    label: 'Momentum Burst',
    description: 'Strong directional momentum with volume confirmation, ride the wave.',
    compatibleRegimes: ['trend', 'expansion'],
    adverseRegimes: ['compression', 'range'],
    direction: 'either',
    category: 'breakout',
    entryCriteria: [
      'MACD above signal and rising (longs) or below and falling (shorts)',
      'Volume > 2x 20-period average',
      'Price clearing prior swing high/low',
      'RSI between 55-80 (strong but not exhausted)',
    ],
    confluenceRequirements: {
      minConfluence: 70,
      minConfidence: 60,
      minTimeAlignment: 50,
    },
    riskModel: {
      stopDescription: 'Below burst candle low or prior swing',
      targetDescription: 'Trail on momentum — 2x ATR or prior structure',
      defaultRR: 2.5,
    },
    expectedProfile: {
      avgHoldingPeriod: '1-3 days',
      typicalMove: '3-7% burst',
    },
    failureSignals: [
      'Volume dries up immediately after burst',
      'RSI divergence on next push',
      'Regime flips to compression',
    ],
  },
] as const;

// ─── Lookup helpers ───────────────────────────────────────────────────────────

const PLAYBOOK_MAP = new Map(PLAYBOOKS.map(p => [p.id, p]));

export function getPlaybook(id: string): Playbook | undefined {
  return PLAYBOOK_MAP.get(id as any);
}

export function getPlaybooksForRegime(regime: string): Playbook[] {
  return PLAYBOOKS.filter(p => p.compatibleRegimes.includes(regime as any));
}

export function getPlaybooksByCategory(category: string): Playbook[] {
  return PLAYBOOKS.filter(p => p.category === category);
}
