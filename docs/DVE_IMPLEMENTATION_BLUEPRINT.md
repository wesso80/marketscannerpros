# Directional Volatility Engine (DVE) — Implementation Blueprint

> **Status:** PLAN ONLY — no code changes yet  
> **Date:** 2026-03-12 (Rev 2.3 — Final corrections + enhancements)  
> **Gating:** Pro Trader only  
> **Breaking changes:** None  
> **New DB tables:** None  
> **New external APIs:** None

---

## Objective

Build a standalone **Directional Volatility Engine (DVE)** that models:

1. **Linear volatility regime** — BBWP-based state classification (compression / neutral / expansion / climax)
2. **Stochastic-momentum directional bias** — K/D spread, slopes, and midline filter (replaces RSI)
3. **Contraction and expansion persistence probabilities** — how likely the current phase continues or exits
4. **Historical dwell-time inside critical volatility zones** — episode statistics for <15 and >90 BBWP
5. **Signal firing conditions** — compression release (up/down) and expansion continuation (up/down)
6. **Projected move expectancy after signal fire** — forward return, MFE, hit rate from historical signals
7. **Invalidation conditions for active signals** — price, phase, and smoothed-phase re-entry rules

The engine powers Golden Egg, scanner flags, alerts, and a standalone volatility-engine page using **only existing data and pure computation**.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File Inventory](#2-file-inventory)
3. [Phase 1 — Types](#3-phase-1--types)
4. [Phase 2 — Constants](#4-phase-2--constants)
5. [Phase 3 — Core Engine](#5-phase-3--core-engine)
6. [Phase 4 — Unit Tests](#6-phase-4--unit-tests)
7. [Phase 5 — API Route](#7-phase-5--api-route)
8. [Phase 6 — Golden Egg Integration](#8-phase-6--golden-egg-integration)
9. [Phase 7 — Scanner Flags](#9-phase-7--scanner-flags)
10. [Phase 8 — Standalone UI](#10-phase-8--standalone-ui)
11. [Data Flow Diagram](#11-data-flow-diagram)
12. [Integration Map](#12-integration-map)
13. [Dependency Order](#13-dependency-order)

---

## 1. Architecture Overview

The DVE is a **platform-level signal engine** (same tier as `lib/marketPressureEngine.ts`).  
It does NOT live inside Golden Egg. Golden Egg consumes it.

### 1a. System Position

```
                    Market Data (existing fetchers)
                              │
             ┌────────────────┼────────────────┐
             │                │                │
     Time Confluence     Options           Directional
       Engine            Engine            Volatility
    (existing)          (existing)        Engine (NEW)
             │                │                │
             └────────────────┼────────────────┘
                              │
                      Market Pressure
                        Engine (MPE)
                         (existing)
                              │
                 ┌────────────┼────────────────┐
                 │            │                │
            Golden Egg     Scanner         DVE Page
           (consumes)    (flags)         (standalone)
```

**Core principle:** DVE is pure computation. Zero fetch calls, zero caching, zero auth, zero UI.  
The API route handles fetch/cache/auth. The UI handles display.

### 1b. Internal Engine Layers (5)

The DVE is internally organized into five computational layers, each building on the previous:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Layer 1 — LINEAR VOLATILITY STATE                                  │
│  BBWP computation, percentile ranking, regime classification,       │
│  SMA5 smoothing, rate-of-change histogram                           │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 2 — DIRECTIONAL BIAS                                         │
│  Stochastic momentum scoring (K/D spread, slopes, midline filter),  │
│  trend structure, options flow, volume expansion, dealer gamma,      │
│  funding rate, market breadth → composite -100..+100 score           │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 3 — PHASE PERSISTENCE                                        │
│  Zone dwell-time statistics (episodes <15, episodes >90),           │
│  contraction continuation/exit probability,                         │
│  expansion continuation/exit probability,                           │
│  current phase age vs historical average/median/max                 │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 4 — SIGNAL TRIGGERING                                        │
│  Signal fire conditions: compression_release_up/down,               │
│  expansion_continuation_up/down. Trigger bar tracking,              │
│  signal strength composite, invalidation rules (price, phase,       │
│  smoothed-phase re-entry)                                           │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 5 — OUTCOME PROJECTION                                       │
│  Historical signal expectancy: expected move %, median move %,      │
│  max historical move %, average bars to move, hit rate.             │
│  Forward return profiling per signal type per asset.                │
└─────────────────────────────────────────────────────────────────────┘
```

**Layer dependency:** Each layer requires all layers above it. Layer 5 requires all of 1-4.

---

## 2. File Inventory

### New Files (12)

| # | Path | Type | Purpose |
|---|------|------|---------|
| 1 | `lib/directionalVolatilityEngine.types.ts` | Types | All DVE interfaces and type aliases |
| 2 | `lib/directionalVolatilityEngine.constants.ts` | Constants | Thresholds, weights, regime boundaries |
| 3 | `lib/directionalVolatilityEngine.ts` | Engine | Pure computation — the core (15 exports) |
| 4 | `lib/directionalVolatilityEngine.test.ts` | Tests | Unit tests with synthetic data |
| 5 | `app/api/dve/route.ts` | API | GET endpoint, session/tier gated |
| 6 | `app/tools/volatility-engine/page.tsx` | Page | Route entry, Pro Trader gate |
| 7 | `src/features/volatilityEngine/types.ts` | Types | Frontend-specific types (mirrors API) |
| 8 | `src/features/volatilityEngine/VolatilityEnginePage.tsx` | Page | Main UI — phase intelligence console |
| 9 | `src/features/volatilityEngine/components/VEHeatmapGauge.tsx` | Component | BBWP histogram + regime zones |
| 10 | `src/features/volatilityEngine/components/VEBreakoutPanel.tsx` | Component | Breakout readiness breakdown |
| 11 | `src/features/volatilityEngine/components/VEPhasePanel.tsx` | Component | Phase persistence + dwell stats |
| 12 | `src/features/volatilityEngine/components/VESignalCard.tsx` | Component | Signal status + projection + invalidation |

### Modified Files (5)

| # | Path | Change |
|---|------|--------|
| 1 | `src/features/goldenEgg/types.ts` | Add optional DVE fields to `layer3.structure.volatility` |
| 2 | `app/api/golden-egg/route.ts` | Import DVE, call `computeDVE()`, populate new fields |
| 3 | `src/features/goldenEgg/GoldenEggPage.tsx` | Render 3 new components when DVE data present |
| 4 | `app/api/scanner/run/route.ts` | Add DVE flags to scan results |
| 5 | `lib/useUserTier.ts` | Add `canAccessVolatilityEngine` gate function |

### New GE Components (3)

| # | Path | Purpose |
|---|------|---------|
| 1 | `src/features/goldenEgg/components/GEBreakoutReadiness.tsx` | 4-bar breakout score breakdown |
| 2 | `src/features/goldenEgg/components/GEVolTrapAlert.tsx` | Conditional banner when trap detected |
| 3 | `src/features/goldenEgg/components/GEVolatilityGauge.tsx` | Visual VHM gauge with direction arrow |

---

## 3. Phase 1 — Types

**File:** `lib/directionalVolatilityEngine.types.ts`

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// INPUT TYPES — what callers pass in (assembled from existing fetch helpers)
// ═══════════════════════════════════════════════════════════════════════════

export interface DVEPriceInput {
  closes: number[];          // At least 50 daily closes (most recent last)
  opens?: number[];          // Optional — for signal candle open invalidation mode
  highs?: number[];          // Optional — for ATR-based calculations + signal candle tracking
  lows?: number[];           // Optional — for ATR-based calculations + signal candle tracking
  currentPrice: number;
  changePct: number;         // Today's % change
  volume?: number;           // Current volume
  avgVolume?: number;        // Average volume for vol expansion detection
}

export interface DVEIndicatorInput {
  macd?: number | null;      // MACD line
  macdHist?: number | null;  // MACD histogram
  macdSignal?: number | null;
  adx?: number | null;       // ADX(14)
  atr?: number | null;       // ATR(14)
  sma20?: number | null;
  sma50?: number | null;
  bbUpper?: number | null;
  bbMiddle?: number | null;
  bbLower?: number | null;

  // Stochastic momentum (replaces RSI as primary momentum driver)
  stochK?: number | null;            // Stochastic %K
  stochD?: number | null;            // Stochastic %D
  stochMomentum?: number | null;     // Derived: stochK - stochD (spread)
  stochKSlope?: number | null;       // Rate of change of K
  stochDSlope?: number | null;       // Rate of change of D

  inSqueeze?: boolean;
  squeezeStrength?: number;  // 0-1
}

export interface DVEOptionsInput {
  putCallRatio?: number;
  ivRank?: number;           // 0-100
  dealerGamma?: string;      // "Long gamma (stabilizing)" | "Short gamma (amplifying)" | "Neutral"
  maxPain?: number;
  highestOICallStrike?: number | null;
  highestOIPutStrike?: number | null;
  unusualActivity?: string;  // "Very High" | "Elevated" | "Normal"
  sentiment?: string;        // "Bullish" | "Bearish" | "Neutral"
}

export interface DVETimeInput {
  activeTFCount?: number;    // From confluenceLearningAgent
  hotZoneActive?: boolean;   // ≥3 concurrent TF closes
  confluenceScore?: number;  // 0-100
}

export interface DVELiquidityInput {
  fundingRatePercent?: number;
  oiTotalUsd?: number;
  fundingSentiment?: string;
}

export interface DVEInput {
  price: DVEPriceInput;
  indicators?: DVEIndicatorInput;
  options?: DVEOptionsInput;
  time?: DVETimeInput;
  liquidity?: DVELiquidityInput;
  mpeComposite?: number;     // 0-100 from existing MPE
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 1 — LINEAR VOLATILITY STATE
// ═══════════════════════════════════════════════════════════════════════════

export type VolRegime =
  | 'compression'    // BBWP <15 — coiling, energy building
  | 'neutral'        // BBWP 15-70 — normal environment
  | 'expansion'      // BBWP 70-90 — active vol expansion
  | 'climax'         // BBWP >90 — extreme, exhaustion risk
  | 'transition';    // Moving between regimes (rate accelerating from low base)

export type RateDirection =
  | 'accelerating'   // BBWP rate increasing
  | 'decelerating'   // BBWP rate decreasing
  | 'flat';          // No meaningful change

export interface VolatilityState {
  bbwp: number;                // Bollinger Band Width Percentile (0-100) — THE core metric
  bbwpSma5: number;            // 5-SMA smoothed BBWP
  regime: VolRegime;
  regimeConfidence: number;    // 0-100 — distance from nearest regime boundary (higher = more decisive)
  rateOfChange: number;        // VHM histogram value — rate of BBWP change
  rateSmoothed: number;        // 5-SMA smoothed rate
  acceleration: number;        // Second derivative: rateOfChange - previousRate (signals early release/exhaustion)
  rateDirection: RateDirection;
  inSqueeze: boolean;
  squeezeStrength: number;     // 0-1
  atr?: number;                // ATR(14) if available
  extremeAlert?: 'low' | 'high' | null;  // <2% or >98% BBWP extreme alerts
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 2 — DIRECTIONAL BIAS (stochastic-momentum based)
// ═══════════════════════════════════════════════════════════════════════════

export type DirectionalBias = 'bullish' | 'bearish' | 'neutral';

export interface DirectionalPressure {
  score: number;               // -100 to +100 (neg=bearish, pos=bullish)
  bias: DirectionalBias;
  confidence: number;          // 0-100 how confident in the bias
  components: {
    stochasticMomentum: number;  // -15 to +15 (K/D spread, slopes, midline)
    trendStructure: number;      // -20 to +20 (SMA alignment, ADX)
    optionsFlow: number;         // -20 to +20 (P/C, gamma, unusual)
    volumeExpansion: number;     // -10 to +10 (volume vs avg)
    dealerGamma: number;         // -15 to +15 (gamma regime)
    fundingRate: number;         // -10 to +10 (crypto only)
    marketBreadth: number;       // -10 to +10 (MPE alignment)
  };
  componentDetails: string[];  // Human-readable component breakdown
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 3 — PHASE PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

export interface ZoneDurationStats {
  currentBars: number;         // How many bars the current episode has lasted
  averageBars: number;         // Historical average episode length
  medianBars: number;          // Historical median episode length
  maxBars: number;             // Longest historical episode
  agePercentile: number;       // 0-100 — where current episode sits vs history
  episodeCount: number;        // How many completed episodes in lookback
}

export interface PhasePersistence {
  contraction: {
    active: boolean;                  // Is BBWP currently <15?
    continuationProbability: number;  // 0-100
    exitProbability: number;          // 0-100
    stats: ZoneDurationStats;
  };
  expansion: {
    active: boolean;                  // Is BBWP currently >90?
    continuationProbability: number;  // 0-100
    exitProbability: number;          // 0-100
    stats: ZoneDurationStats;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 4 — SIGNAL TRIGGERING + INVALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export type DVESignalType =
  | 'compression_release_up'
  | 'compression_release_down'
  | 'expansion_continuation_up'
  | 'expansion_continuation_down'
  | 'none';

export type DVESignalState =
  | 'idle'           // No signal active, no recent invalidation
  | 'armed'          // Conditions approaching but not yet fired
  | 'fired'          // Signal is active and valid
  | 'invalidated';   // Signal was active but has been invalidated

export interface DVESignal {
  type: DVESignalType;
  state: DVESignalState;       // Display-ready signal lifecycle state
  active: boolean;
  strength: number;            // 0-100 composite signal strength
  triggerBarPrice?: number;    // Close price of the bar that fired the signal
  triggerBarOpen?: number;     // Open of signal bar (for "Signal Candle Open" invalidation mode)
  triggerBarHigh?: number;     // High of signal bar (for invalidation)
  triggerBarLow?: number;      // Low of signal bar (for invalidation)
  triggerReason: string[];     // Human-readable conditions that fired
}

export interface DVEInvalidation {
  priceInvalidation?: number;           // Price level that kills the signal
  phaseInvalidation?: number;           // BBWP level that kills the signal (re-entry)
  smoothedPhaseInvalidation?: number;   // BBWP SMA5 level that kills the signal
  invalidated: boolean;                 // Is the current signal already invalid?
  invalidationMode: 'extreme' | 'open'; // Which price level is used (candle extreme vs open)
  ruleSet: string[];                    // Human-readable invalidation rules
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 5 — OUTCOME PROJECTION
// ═══════════════════════════════════════════════════════════════════════════

export interface SignalProjection {
  signalType: DVESignalType;
  expectedMovePct: number;          // Average forward return after this signal type
  medianMovePct: number;            // Median forward return
  maxHistoricalMovePct: number;     // Maximum favorable excursion seen
  averageBarsToMove: number;        // Average bars to peak/trough after signal
  hitRate: number;                  // 0-100 — % of signals that produced target move
  sampleSize: number;               // How many historical instances were measured
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPORTING — breakout, trap, exhaustion, transition (existing concepts)
// ═══════════════════════════════════════════════════════════════════════════

export interface BreakoutReadiness {
  score: number;               // 0-100 composite
  label: string;               // "LOW" | "MODERATE" | "HIGH" | "EXTREME"
  components: {
    volCompression: number;    // 0-40 (max weight)
    timeAlignment: number;     // 0-30
    gammaWall: number;         // 0-20
    adxRising: number;         // 0-10
  };
  componentDetails: string[];
}

export interface VolatilityTrap {
  detected: boolean;           // score >= TRAP.MIN_SCORE (70)
  candidate: boolean;          // score >= TRAP.CANDIDATE_SCORE (60) but < MIN_SCORE
  score: number;               // 0-100
  components: string[];        // Human-readable breakdown
  compressionLevel: number;    // BBWP value (how compressed)
  gammaLockDetected: boolean;  // Price pinned near gamma zone
  timeClusterApproaching: boolean; // Multi-TF closes imminent
}

export interface ExhaustionRisk {
  level: number;               // 0-100 (0 = no exhaustion, 100 = extreme)
  label: string;               // "LOW" | "MODERATE" | "HIGH" | "EXTREME"
  signals: string[];           // What's triggering exhaustion risk
}

export interface StateTransition {
  from: VolRegime;
  to: VolRegime;
  probability: number;         // 0-100
  trigger: string;             // What would cause the transition
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITE OUTPUT — the full DVEReading
// ═══════════════════════════════════════════════════════════════════════════

export interface DVEReading {
  symbol: string;
  timestamp: number;

  // Layer 1: Linear Volatility State
  volatility: VolatilityState;

  // Layer 2: Directional Bias
  direction: DirectionalPressure;

  // Combined directional + volatility
  directionalVolatility: {
    magnitude: number;           // Phase-opportunity-weighted, NOT raw BBWP (see computeMagnitude)
    bias: 'up' | 'down' | 'unknown';
    confidence: number;          // 0-100
  };

  // Layer 3: Phase Persistence
  phasePersistence: PhasePersistence;

  // Layer 4: Signal Triggering + Invalidation
  signal: DVESignal;
  invalidation: DVEInvalidation;

  // Layer 5: Outcome Projection
  projection: SignalProjection;

  // Supporting analyses
  breakout: BreakoutReadiness;
  trap: VolatilityTrap;
  exhaustion: ExhaustionRisk;
  transition: StateTransition;

  // Data quality assessment
  dataQuality: DVEDataQuality;

  // Scanner integration flags
  flags: DVEFlag[];

  // Display
  label: string;               // Primary regime label
  summary: string;             // 1-2 sentence narrative
}

export interface DVEDataQuality {
  score: number;               // 0-100 overall data completeness
  missing: string[];           // e.g. ['options', 'time', 'stochasticSlopes']
  warnings: string[];          // e.g. ['Insufficient closes for dwell stats', 'Stoch data partial']
}

export type DVEFlag =
  | 'BREAKOUT_WATCH'
  | 'EXPANSION_UP'
  | 'EXPANSION_DOWN'
  | 'TRAP_CANDIDATE'
  | 'TRAP_DETECTED'
  | 'CLIMAX_WARNING'
  | 'COMPRESSION_EXTREME'
  | 'CONTRACTION_EXIT_RISK'
  | 'EXPANSION_EXIT_RISK'
  | 'SIGNAL_UP'
  | 'SIGNAL_DOWN';
```

**Design rationale:**
- **BBWP is the core metric** — not realized volatility from log returns. BBWP (Bollinger Band Width Percentile) ranks current BB width over a 252-bar lookback, matching the ABT VHM v2 Pine Script methodology
- **Stochastic momentum replaces RSI** — K/D spread, slopes, and midline filter are superior for release timing, phase rotation, and re-entry failure detection
- **5-layer output structure** — each layer maps to a clear computational concern: state, bias, persistence, signal, projection
- **Phase persistence** — directly answers "how long does this asset usually stay under 15?" and "is the current phase young or stretched?"
- **Signal + Invalidation** — DVE is not just descriptive but prescriptive: it fires signals with explicit invalidation conditions
- **Signal lifecycle** — `DVESignalState` (`idle` → `armed` → `fired` → `invalidated`) gives UI/scanner/alerts a simple display-ready state without needing to infer from `type !== 'none'` + invalidation checks
- **Projection** — historical expectancy per signal type closes the loop: "what tends to happen after this setup?" (Note: in-engine projection is a proxy model; full institutional-grade expectancy should later be upgraded in MSP backend analytics where complete historical signal context can be replayed)
- **Data quality** — `DVEDataQuality` tracks missing inputs and warns when the model is running on partial data, helping AI Analyst explain weak-confidence readings and UI show "partial model" indicators
- `DVEFlag` extended with `CONTRACTION_EXIT_RISK`, `EXPANSION_EXIT_RISK`, `SIGNAL_UP`, `SIGNAL_DOWN` for scanner

---

## 4. Phase 2 — Constants

**File:** `lib/directionalVolatilityEngine.constants.ts`

```typescript
// ── BBWP Core Parameters (from ABT VHM v2) ──────────────────────
export const BBWP = {
  BB_LENGTH: 13,                // Bollinger Band length for width calculation
  LOOKBACK: 252,                // Percentile ranking lookback (1 year)
  SMA_PERIOD: 5,                // 5-SMA smoothing on BBWP series
  STD_MULTIPLIER: 2,            // Bollinger Band standard deviation multiplier (upper = basis + 2*dev)
} as const;

// ── Volatility Regime Boundaries ─────────────────────────────────
export const VOL_REGIME = {
  COMPRESSION_THRESHOLD: 15,    // BBWP <15 = contraction zone
  NEUTRAL_UPPER: 70,            // BBWP 15-70 = neutral/trend environment
  EXPANSION_THRESHOLD: 70,      // BBWP 70-90 = expansion
  CLIMAX_THRESHOLD: 90,         // BBWP >90 = climax / extreme expansion
  EXTREME_LOW: 2,               // BBWP <2 = extreme low volatility alert
  EXTREME_HIGH: 98,             // BBWP >98 = extreme high volatility alert
} as const;

// ── VHM Histogram ────────────────────────────────────────────────
export const VHM = {
  SMOOTH_PERIOD: 5,             // 5-SMA smoothing on BBWP rate-of-change
} as const;

// ── Stochastic Momentum Parameters ──────────────────────────────
export const STOCHASTIC = {
  K_PERIOD: 14,                 // %K lookback
  D_PERIOD: 3,                  // %D smoothing
  SMOOTH: 3,                    // K smoothing
  BIAS_THRESHOLD: 15,           // |score| > 15 → directional bias confirmed
  MIDLINE: 50,                  // K above/below 50 → bull/bear territory
  RECENT_BARS: 10,              // Lookback for "recently in compression" check
} as const;

// ── Directional Pressure Weights ─────────────────────────────────
export const DIRECTION_WEIGHTS = {
  stochasticMomentum: { max: 15, components: {
    kd_spread: 4,               // K-D spread direction
    k_slope: 3,                 // K slope direction
    d_slope: 3,                 // D slope direction
    midline_bonus: 5,           // Above/below 50 with positive/negative spread
  }},
  trendStructure: { max: 20, components: { smaAlignment: 10, adx: 10 } },
  optionsFlow: { max: 20, components: { putCall: 8, unusual: 7, ivRank: 5 } },
  volumeExpansion: { max: 10 },
  dealerGamma: { max: 15 },
  fundingRate: { max: 10 },     // Crypto only, redistributed to others for equity
  marketBreadth: { max: 10 },
} as const;

// ── Breakout Readiness Weights ───────────────────────────────────
export const BREAKOUT_WEIGHTS = {
  volCompression: 40,           // BBWP compression (biggest weight)
  timeAlignment: 30,            // Multi-TF close cluster
  gammaWall: 20,                // Options gamma positioning
  adxRising: 10,                // ADX turning up from low base
} as const;

// ── Volatility Trap Thresholds ───────────────────────────────────
export const TRAP = {
  CANDIDATE_SCORE: 60,          // 60-69 → trap candidate (softer flag for monitoring)
  MIN_SCORE: 70,                // >= 70 → trap detected (full detection threshold)
  COMPRESSION_WEIGHT: 40,       // BBWP < 15 contribution
  GAMMA_LOCK_WEIGHT: 30,        // Price near gamma wall contribution
  TIME_CLUSTER_WEIGHT: 30,      // Multi-TF approaching contribution
  GAMMA_PROXIMITY_PCT: 1.5,     // Price within 1.5% of gamma wall = "locked"
} as const;

// ── Exhaustion Risk ──────────────────────────────────────────────
export const EXHAUSTION = {
  BBWP_TRIGGER: 85,             // BBWP above this signals exhaustion risk
  STOCH_EXTREME_BULL: 80,       // StochK > 80 during expansion = exhaustion
  STOCH_EXTREME_BEAR: 20,       // StochK < 20 during expansion = exhaustion
  ADX_DECLINING_THRESHOLD: 35,  // ADX was > 35 and now declining
  BBWP_DECEL_THRESHOLD: -0.5,   // BBWP rate decelerating during expansion
} as const;

// ── Signal Strength Weights ─────────────────────────────────────
export const SIGNAL_STRENGTH = {
  BBWP_CROSS_WEIGHT: 30,       // BBWP crossing threshold boundary
  SMA5_CONFIRM_WEIGHT: 20,     // SMA5 confirming the cross
  STOCH_ALIGN_WEIGHT: 25,      // Stochastic momentum alignment
  DIRECTION_ALIGN_WEIGHT: 25,  // Directional pressure alignment
} as const;

// ── Projection Defaults ──────────────────────────────────────────
export const PROJECTION = {
  FORWARD_BARS: 20,             // Measure forward return over 20 bars
  MIN_SAMPLE_SIZE: 5,           // Minimum historical signals for valid projection
} as const;

// ── Minimum Data Requirements ────────────────────────────────────
export const MIN_DATA = {
  CLOSES_FOR_BBWP: 14,          // Need at least BB_LENGTH + 1 closes
  CLOSES_FOR_PERCENTILE: 50,    // Need 50+ closes for meaningful percentile rank
  CLOSES_FOR_DWELL: 100,        // Need 100+ for meaningful dwell-time stats
} as const;
```

**Design rationale:**
- All magic numbers centralized and named
- Constants are `as const` for TypeScript literal inference
- **BBWP parameters** match ABT VHM v2: BB length=13, lookback=252, SMA=5
- **Stochastic parameters** match standard (14,3,3) with bias threshold at 15
- **Extreme alerts** at 2% and 98% — rare events that deserve immediate flagging
- **RSI removed entirely** — stochastic momentum is the sole momentum driver
- Signal strength weights ensure all four confirmation factors are balanced
- Separated from types file to avoid circular imports

---

## 5. Phase 3 — Core Engine

**File:** `lib/directionalVolatilityEngine.ts`

### Function Inventory (17 exports)

```
┌────────────────────────────────────────────────────────────┐
│ lib/directionalVolatilityEngine.ts                         │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  LAYER 1 — Linear Volatility State                         │
│  ──────────────────────────────────                        │
│  1. computeBBWP(closes, bbLen, lookback)                   │
│     → { bbwp: number, bbwpSeries: number[] }               │
│     Bollinger Band Width Percentile (core metric)          │
│                                                            │
│  2. computeVHMHistogram(bbwpSeries, smoothPeriod)          │
│     → { rate, smoothed, sma5, acceleration, direction }    │
│     Rate of BBWP change + acceleration, smoothed by 5-SMA  │
│                                                            │
│  3. classifyVolRegime(bbwp, rateDir, inSqueeze)            │
│     → { regime: VolRegime, confidence: number }            │
│     Map BBWP + context → regime label + boundary distance  │
│                                                            │
│  LAYER 2 — Directional Bias                                │
│  ──────────────────────────                                │
│  4. computeStochasticMomentum(indicators)                  │
│     → number (-15 to +15)                                  │
│     K/D spread, slopes, midline filter                     │
│                                                            │
│  5. computeDirectionalPressure(input)                      │
│     → DirectionalPressure                                  │
│     Score all components, sum to -100..+100                 │
│                                                            │
│  LAYER 3 — Phase Persistence                               │
│  ──────────────────────────                                │
│  6. computeZoneDurationStats(series, threshold, side)      │
│     → ZoneDurationStats                                    │
│     Episode lengths, average/median/max, age percentile    │
│                                                            │
│  7. computePhasePersistence(args)                          │
│     → PhasePersistence                                     │
│     Contraction + expansion continuation/exit probs        │
│                                                            │
│  LAYER 4 — Signal Triggering                               │
│  ──────────────────────────                                │
│  8. detectSignal(volState, direction, bbwpSeries, price)   │
│     → DVESignal                                            │
│     Fire compression_release or expansion_continuation     │
│                                                            │
│  9. computeSignalStrength(signal, volState, direction)     │
│     → number (0-100)                                       │
│     Composite: BBWP cross + SMA5 confirm + stoch + dir    │
│                                                            │
│  10. computeInvalidation(signal, volState, price)          │
│      → DVEInvalidation                                     │
│      Price, phase, smoothed-phase invalidation levels      │
│                                                            │
│  LAYER 5 — Outcome Projection                              │
│  ──────────────────────────                                │
│  11. computeSignalProjection(signalType, closes, bbwpSeries│
│      → SignalProjection                                    │
│      Historical fwd return, MFE, bars-to-move, hit rate   │
│                                                            │
│  SUPPORTING                                                │
│  ──────────                                                │
│  12. computeBreakoutReadiness(volState, input)             │
│      → BreakoutReadiness                                   │
│                                                            │
│  13. detectVolatilityTrap(volState, opts, time)            │
│      → VolatilityTrap                                      │
│                                                            │
│  14. computeExhaustion(volState, indicators)               │
│      → ExhaustionRisk                                      │
│                                                            │
│  15. predictTransition(regime, rateDir, bbwp)              │
│      → StateTransition                                     │
│      Predict next regime transition + probability          │
│                                                            │
│  16. computeMagnitude(signal, phasePersistence, direction)  │
│      → number (0-100)                                      │
│      Phase-opportunity-weighted directional magnitude       │
│                                                            │
│  ORCHESTRATOR                                              │
│  ────────────                                              │
│  17. computeDVE(input: DVEInput, symbol: string)           │
│      → DVEReading                                          │
│      Main entry — calls 1-16, assembles all layers          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Detailed Function Specifications

---

#### 1. `computeBBWP(closes: number[], bbLen: number, lookback: number)`

```
THE CORE METRIC. Replaces computeRealizedVolatility from v1 blueprint.

Input:  closes = [100, 101, 99, 102, ...] (at least bbLen + lookback values)
        bbLen = 13 (default from BBWP.BB_LENGTH)
        lookback = 252 (default from BBWP.LOOKBACK)

Step 1: Compute Bollinger Band width series
        For each bar i (where i >= bbLen):
          basis = SMA(closes[i-bbLen+1..i], bbLen)
          dev = stdDev(closes[i-bbLen+1..i], bbLen)
          upper = basis + BBWP.STD_MULTIPLIER * dev
          lower = basis - BBWP.STD_MULTIPLIER * dev
          width[i] = (upper - lower) / basis

Step 2: Compute percentile rank for each width value
        For each bar i (where i >= lookback):
          window = width[i-lookback+1..i]
          bbwp[i] = (count of window values <= width[i]) / lookback × 100

Step 3: Return latest bbwp + full bbwpSeries for downstream use

Output: { bbwp: 12,    // Current BBWP = 12% (compression)
          bbwpSeries: [45, 38, 29, 18, 12, ...] }

Edge case: If closes.length < bbLen + lookback, return { bbwp: 50, bbwpSeries: [] }
           (Need bbLen bars for BB width + lookback bars for percentile ranking)
```

---

#### 2. `computeVHMHistogram(bbwpSeries: number[], smoothPeriod: number)`

```
Input:  bbwpSeries = [45, 38, 29, 18, 12, 14, 22, ...]
        smoothPeriod = 5

Step 1: Compute rate of change of BBWP
        rateOfChange[i] = bbwpSeries[i] - bbwpSeries[i-1]

Step 2: Apply 5-SMA smoothing to rateOfChange → smoothed series

Step 3: Compute SMA5 of the BBWP series itself (not the rate)
        sma5[i] = SMA(bbwpSeries[i-4..i], 5)

Step 4: Determine direction from smoothed rate trend
        If latest smoothed > prev smoothed → 'accelerating'
        If latest smoothed < prev smoothed → 'decelerating'
        Else → 'flat'

Step 5: Compute acceleration (second derivative of BBWP)
        acceleration = rateOfChange[latest] - rateOfChange[latest - 1]
        Positive acceleration during compression → early exit signal
        Negative acceleration during expansion → early exhaustion signal

Output: { rate: -3.2,            // Latest BBWP change (negative = dropping)
          smoothed: -2.1,         // 5-SMA smoothed rate
          sma5: 22.4,             // 5-SMA of BBWP itself
          acceleration: 1.4,      // Second derivative (positive = rate accelerating)
          direction: 'decelerating' }
```

---

#### 3. `classifyVolRegime(bbwp: number, rateDirection: RateDirection, inSqueeze?: boolean)`

```
Input:  bbwp = 12
        rateDirection = 'decelerating'
        inSqueeze = true

Logic:
  if bbwp < COMPRESSION_THRESHOLD (15) → 'compression'
  if bbwp > CLIMAX_THRESHOLD (90) → 'climax'
  if bbwp > EXPANSION_THRESHOLD (70) → 'expansion'
  if rateDirection === 'accelerating' and bbwp > 15 and bbwp < 40:
    → 'transition'   // Just broke out of compression
  return 'neutral'

Regime Confidence:
  Measures distance from nearest regime boundary, normalized to 0-100.
  - compression:  confidence = ((15 - bbwp) / 15) × 100
  - climax:       confidence = ((bbwp - 90) / 10) × 100
  - expansion:    confidence = min((bbwp - 70) / 20, (90 - bbwp) / 20) × 100
  - neutral:      confidence = min((bbwp - 15) / 27.5, (70 - bbwp) / 27.5) × 100
  - transition:   confidence = 50 (inherently ambiguous)
  All clamped to 0-100.

Output: { regime: 'compression', confidence: 80 }
  return 'neutral'

Output: 'compression'

Note: extremeAlert field on VolatilityState set separately:
  if bbwp < EXTREME_LOW (2) → 'low'
  if bbwp > EXTREME_HIGH (98) → 'high'
  else → null
```

---

#### 4. `computeStochasticMomentum(indicators: DVEIndicatorInput)`

```
NEW FUNCTION — replaces the old RSI-based momentum component.

Input:  indicators.stochK = 72
        indicators.stochD = 65
        indicators.stochKSlope = 2.1     // positive = K rising
        indicators.stochDSlope = 1.4     // positive = D rising
        indicators.stochMomentum = 7     // K - D spread

Score = 0 (range: -15 to +15)

K-D SPREAD (±4):
  If stochMomentum > 0 (K > D) → +4
  If stochMomentum < 0 (K < D) → -4

K SLOPE (±3):
  If stochKSlope > 0 → +3
  If stochKSlope < 0 → -3

D SLOPE (±3):
  If stochDSlope > 0 → +3
  If stochDSlope < 0 → -3

MIDLINE BONUS (±5):
  If K > 50 AND spread > 0 → +5  (bullish confirmation above midline)
  If K < 50 AND spread < 0 → -5  (bearish confirmation below midline)

Output: clamp(score, -15, +15)

Why stochastic momentum:
- Better release timing than RSI (detects K/D crossovers as phase exits)
- Slopes catch momentum shifts before the absolute values change
- Midline filter prevents false signals in the wrong momentum territory
- Directly maps to ABT VHM v2's stochastic bias scoring
```

---

#### 5. `computeDirectionalPressure(input: DVEInput)`

```
Scoring breakdown (each component independently scored):

STOCHASTIC MOMENTUM (-15 to +15):
  Calls computeStochasticMomentum(input.indicators)
  See function #4 above for full scoring

  If stochastic data unavailable:
    Falls back to MACD-only scoring:
    MACD > 0 → +5, MACD < 0 → -5
    MACD histogram positive → +5, negative → -5
    (Capped at ±10 in fallback mode)

TREND STRUCTURE (-20 to +20):
  Price > SMA20 → +5, Price > SMA50 → +5
  SMA20 > SMA50 → +5 (golden cross direction)
  ADX > 25 → +5 (confirming trend), ADX < 15 → 0

OPTIONS FLOW (-20 to +20):
  P/C < 0.7 → +8 (call heavy), P/C > 1.3 → -8 (put heavy)
  Unusual activity with bullish sentiment → +7
  IV Rank < 20 (cheap = coiled) → +5, IV Rank > 80 → -5

VOLUME EXPANSION (-10 to +10):
  volume > avgVolume × 1.5 and changePct > 0 → +10
  volume > avgVolume × 1.5 and changePct < 0 → -10
  volume < avgVolume × 0.7 → 0 (no conviction either way)

DEALER GAMMA (-15 to +15):
  "Short gamma" → price trending direction gets amplified → ±15
  "Long gamma" → dampening → ±5 against direction
  "Neutral" → 0

FUNDING RATE (-10 to +10): [crypto only — 0 for equities]
  fundingRate > 0.03% → +10 (longs paying = bullish bias)
  fundingRate < -0.03% → -10 (shorts paying = bearish bias)

MARKET BREADTH (-10 to +10):
  MPE composite > 70 → +10, MPE composite < 30 → -10

Final: sum all → clamp to -100..+100
Bias: score > STOCHASTIC.BIAS_THRESHOLD (15) → 'bullish'
      score < -STOCHASTIC.BIAS_THRESHOLD → 'bearish'
      else → 'neutral'
Confidence: abs(score) mapped to 0-100
```

---

#### 6. `computeZoneDurationStats(series: number[], threshold: number, side: 'below' | 'above')`

```
NEW FUNCTION — one of the most important additions in this revision.

This answers: "How long does this asset usually stay below 15?" or "above 90?"

Input:  series = [45, 38, 29, 18, 12, 8, 11, 14, 16, 22, ...252+ values]
        threshold = 15
        side = 'below'  (find contiguous episodes where value <= threshold)

Step 1: Scan the series and identify all contiguous episodes
        For side='below':  episode = consecutive bars where series[i] <= threshold
        For side='above':  episode = consecutive bars where series[i] >= threshold

        Example with threshold=15, side='below':
        series: [45, 18, 12, 8, 11, 22, 30, 13, 9, 14, 25, ...]
                      ^^  ^^  ^  ^^          ^^  ^  ^^
        Episodes: [4] (bars 1-4), [3] (bars 7-9)

Step 2: Compute statistics from completed episodes ONLY (never the current one)
        completedLengths = [4, 3, 7, 2, 5, ...]  // historical
        averageBars = mean(completedLengths)
        medianBars = median(completedLengths)
        maxBars = max(completedLengths)

        DESIGN NOTE: Historical summary stats are computed from completed episodes
        only; the active episode is evaluated against that completed-episode
        distribution. Including the active episode would distort averages — a live
        stretched contraction could bias the benchmark upward, producing unreliable
        continuation/exit probabilities.

Step 3: Determine current episode
        If the series currently satisfies the condition (latest bar inside zone):
          currentBars = count of consecutive bars from end that satisfy condition
        Else:
          currentBars = 0

Step 4: Compute age percentile
        agePercentile = (count of completedLengths <= currentBars) / completedLengths.length × 100
        This tells you: "the current episode is longer than X% of historical episodes"

Output: {
  currentBars: 6,
  averageBars: 4.2,
  medianBars: 3,
  maxBars: 12,
  agePercentile: 72,    // Current 6-bar episode is longer than 72% of history
  episodeCount: 15       // 15 completed episodes in lookback
}

Edge case: If no completed episodes found → averageBars/medianBars/maxBars = 0,
           agePercentile = 0, episodeCount = 0
```

---

#### 7. `computePhasePersistence(args)`

```
NEW FUNCTION — combines zone stats with BBWP state to produce continuation/exit probs.

Input:  {
  bbwp: 11,
  bbwpSma5: 13,
  volatility: VolatilityState,
  contractionStats: ZoneDurationStats,
  expansionStats: ZoneDurationStats,
  direction: DirectionalPressure,
  stochK?: number,
  stochKSlope?: number,
}

─── CONTRACTION (bbwp < 15) ───

Contraction CONTINUATION probability rises when:
  - bbwp <= 15                              → base +40
  - bbwpSma5 <= 15                          → +15 (smoothed confirms)
  - currentBars < averageBars               → +15 (still young episode)
  - K slope flat or down                    → +10 (no momentum trigger)
  - direction.bias === 'neutral'            → +10 (no directional catalyst)
  - bbwp rate flat or decreasing            → +10 (not accelerating out)
  Capped at 100.

Contraction EXIT probability rises when:
  - currentBars >= averageBars              → +15
  - currentBars >= medianBars               → +10
  - agePercentile > 70                      → +15 (stretched)
  - bbwp rate direction = 'accelerating'    → +15 (BBWP turning up)
  - bbwpSma5 turning up                     → +15
  - stochK slope > 0 and K > D             → +15 (momentum trigger)
  - bbwp approaching 15 from below          → +15
  Capped at 100.

If bbwp >= 15: contraction.active = false, continuation = 0,
               exit = 0, stats still populated from history

─── EXPANSION (bbwp > 90) ───

Expansion CONTINUATION probability rises when:
  - bbwp >= 90                              → base +40
  - bbwpSma5 >= 90                          → +15
  - currentBars < averageBars               → +15 (still young)
  - direction.bias matches trend            → +10 (trending confirms)
  - stochK and direction aligned            → +10
  - exhaustion risk LOW                     → +10
  Capped at 100.

Expansion EXIT probability rises when:
  - currentBars >= averageBars              → +15
  - agePercentile > 70                      → +15 (stretched)
  - bbwp rate decelerating above 90         → +15
  - stoch diverges from direction           → +15
  - exhaustion risk HIGH or EXTREME         → +20
  - bbwp approaching 90 from above          → +20
  Capped at 100.

If bbwp <= 90: expansion.active = false, continuation = 0,
               exit = 0, stats still populated from history

Output: PhasePersistence (see types)
```

---

#### 8. `detectSignal(volState, direction, bbwpSeries, priceInput)`

```
NEW FUNCTION — fires one of 4 signal types or 'none'.

Uses the last N bars of bbwpSeries and the current BBWP + SMA5 to determine
if a signal condition has been met.

─── COMPRESSION RELEASE UP ───
Trigger requirements (ALL must be true):
  1. bbwp was <= 15 within the last STOCHASTIC.RECENT_BARS (10) bars
  2. bbwpSma5 was <= 15 recently
  3. Current bar closes with bbwp > 15  (the "break" above contraction)
  4. bbwp > bbwpSma5 OR both are turning higher
  5. Stochastic momentum is bullish (computeStochasticMomentum > 0)
  6. direction.bias === 'bullish'

If all true → type: 'compression_release_up'
  triggerBarPrice = priceInput.currentPrice
  triggerBarOpen = priceInput.opens?.[last] ?? currentPrice
  triggerBarHigh = priceInput.highs?.[last] ?? currentPrice
  triggerBarLow = priceInput.lows?.[last] ?? currentPrice
  triggerReason = ["BBWP broke above 15", "Stoch momentum bullish", ...]

─── COMPRESSION RELEASE DOWN ───
Same structure, but:
  5. Stochastic momentum is bearish (< 0)
  6. direction.bias === 'bearish'

If all true → type: 'compression_release_down'

─── EXPANSION CONTINUATION UP ───
Trigger requirements (ALL must be true):
  1. bbwp >= 90
  2. bbwpSma5 >= 90
  3. Stochastic momentum is bullish
  4. direction.bias === 'bullish'
  5. exhaustion is NOT 'HIGH' or 'EXTREME'

If all true → type: 'expansion_continuation_up'

─── EXPANSION CONTINUATION DOWN ───
Inverse of expansion continuation up:
  3. Stochastic momentum is bearish
  4. direction.bias === 'bearish'
  5. exhaustion not extreme

If all true → type: 'expansion_continuation_down'

─── DEFAULT ───
If none of the above → type: 'none', active: false

Output: DVESignal
```

---

#### 9. `computeSignalStrength(signal, volState, direction)`

```
Only runs when signal.type !== 'none'.

BBWP CROSS (0-30):
  For compression_release: how cleanly did BBWP break above 15?
    bbwp - 15 > 5 → 30,  > 3 → 20,  > 0 → 10
  For expansion_continuation: how deep above 90?
    bbwp - 90 > 5 → 30,  > 3 → 20,  > 0 → 10

SMA5 CONFIRMATION (0-20):
  SMA5 confirming the direction of the BBWP move → 20
  SMA5 lagging but same direction → 10
  SMA5 diverging → 0

STOCHASTIC ALIGNMENT (0-25):
  |stochasticMomentum score| mapped: 15 → 25, 10 → 17, 5 → 8, else → 0

DIRECTIONAL ALIGNMENT (0-25):
  |direction.score| / 100 × 25

Total = sum → 0-100

Output: number (assigned to signal.strength)
```

---

#### 10. `computeInvalidation(signal, volState, priceInput)`

```
NEW FUNCTION — defines when an active signal is considered dead.

Only runs when signal.type !== 'none' and signal.active === true.

─── FOR COMPRESSION RELEASE UP ───
  If INVALIDATION.MODE === 'extreme':
    priceInvalidation = signal.triggerBarLow
  Else ('open'):
    priceInvalidation = signal.triggerBarOpen
  (price drops below this level → invalidated)
  phaseInvalidation = 15
    (BBWP re-enters below 15 → phase re-entry = failed breakout)
  smoothedPhaseInvalidation = 15
    (BBWP SMA5 re-enters below 15 → smoothed confirmation failed)
  ruleSet:
    - "Price below signal bar low (${triggerBarLow})"
    - "BBWP re-enters below 15"
    - "BBWP SMA5 re-enters below 15"

─── FOR COMPRESSION RELEASE DOWN ───
  If INVALIDATION.MODE === 'extreme':
    priceInvalidation = signal.triggerBarHigh
  Else ('open'):
    priceInvalidation = signal.triggerBarOpen
  (price rises above this level → invalidated)
  phaseInvalidation = 15  (BBWP re-enters below 15 = re-compression)
  smoothedPhaseInvalidation = 15
  ruleSet:
    - "Price above signal bar high (${triggerBarHigh})"
    - "BBWP re-enters below 15 (re-compression)"
    - "BBWP SMA5 re-enters below 15"

─── FOR EXPANSION CONTINUATION UP ───
  If INVALIDATION.MODE === 'extreme':
    priceInvalidation = signal.triggerBarLow
  Else ('open'):
    priceInvalidation = signal.triggerBarOpen
  phaseInvalidation = 90  (BBWP drops below 90 = expansion ending)
  smoothedPhaseInvalidation = 90
  ruleSet:
    - "Price below signal bar low (${triggerBarLow})"
    - "BBWP exits below 90"
    - "BBWP SMA5 exits below 90"

─── FOR EXPANSION CONTINUATION DOWN ───
  If INVALIDATION.MODE === 'extreme':
    priceInvalidation = signal.triggerBarHigh
  Else ('open'):
    priceInvalidation = signal.triggerBarOpen
  phaseInvalidation = 90
  smoothedPhaseInvalidation = 90
  ruleSet:
    - "Price above signal bar high (${triggerBarHigh})"
    - "BBWP exits below 90"
    - "BBWP SMA5 exits below 90"

─── INVALIDATION CHECK ───
  invalidated = false
  If current price violates priceInvalidation → invalidated = true
  If current bbwp violates phaseInvalidation → invalidated = true
  If current bbwpSma5 violates smoothedPhaseInvalidation → invalidated = true

Output: DVEInvalidation
```

---

#### 11. `computeSignalProjection(signalType, closes, bbwpSeries)`

```
NEW FUNCTION — historical outcome profiling per signal type.

Input:  signalType = 'compression_release_up'
        closes = [full historical close array, 252+ bars]
        bbwpSeries = [full BBWP series, 252+ values]

Step 1: Scan historical bbwpSeries for all instances of this signal type
        For compression_release_up: find bars where
          - previous N bars had bbwp <= 15
          - current bar bbwp > 15
          - bbwp is rising
        (Simplified version — direction/stoch not available in historical scan,
         so we use the phase transition as proxy)

        IMPORTANT LIMITATION: Projection is a proxy model in-engine. Full
        institutional-grade expectancy requires: proper historical stochastic
        context, historical directional context, enough signal samples, and
        forward-walk consistency. This should later be upgraded in MSP backend
        analytics where complete historical signal context can be replayed.

Step 2: For each historical signal instance at bar i:
        - forwardReturn = (closes[i + PROJECTION.FORWARD_BARS] - closes[i]) / closes[i] × 100
        - maxFavorableExcursion = max price move in the direction of the signal within FORWARD_BARS
        - barsToMove = number of bars to reach max favorable excursion

Step 3: Aggregate across all instances:
        - expectedMovePct = mean(forwardReturns)
        - medianMovePct = median(forwardReturns)
        - maxHistoricalMovePct = max(maxFavorableExcursions)
        - averageBarsToMove = mean(barsToMove)
        - hitRate = count(forwardReturn > 0) / total × 100  (for up signals)
                    count(forwardReturn < 0) / total × 100  (for down signals)
        - sampleSize = total instances found

Output: SignalProjection

Edge case: If sampleSize < PROJECTION.MIN_SAMPLE_SIZE (5),
           return zeroed projection with sampleSize showing the insufficient count.
           This signals to the UI: "not enough data for reliable projection."
```

---

#### 12. `computeBreakoutReadiness(volState, input)`

```
(Unchanged from v1 blueprint except volPercentile → bbwp)

VOL COMPRESSION (0-40):
  if bbwp < 15 → 40
  if bbwp < 25 → 30
  if bbwp < 35 → 20
  if inSqueeze → +10 bonus (capped at 40)

TIME ALIGNMENT (0-30):
  activeTFCount >= 4 → 30
  activeTFCount >= 3 → 22
  activeTFCount >= 2 → 15
  hotZoneActive → +8 bonus (capped at 30)

GAMMA WALL (0-20):
  Price within 1% of max pain or highest OI strike → 20
  Price within 2% → 15
  Unusual activity detected → +5 bonus (capped at 20)
  Short gamma regime → +5 bonus (capped at 20)

ADX RISING (0-10):
  ADX < 20 and rising (compared to regime) → 10
  ADX 20-25 → 7
  ADX > 30 → 3 (already trending, less breakout potential)

Total = sum → 0-100
Label: >= 80 "EXTREME", >= 60 "HIGH", >= 40 "MODERATE", else "LOW"
```

---

#### 13. `detectVolatilityTrap(volState, options, time)`

```
(Unchanged from v1 blueprint except volPercentile → bbwp)

COMPRESSION (0-40):
  bbwp < 10 → 40
  bbwp < 15 → 30
  bbwp < 20 → 20
  inSqueeze with squeezeStrength > 0.7 → +10

GAMMA LOCK (0-30):
  (same as v1)

TIME CLUSTER (0-30):
  (same as v1)

Total = sum → 0-100
Candidate = total >= TRAP.CANDIDATE_SCORE (60) and total < TRAP.MIN_SCORE (70)
Detected = total >= TRAP.MIN_SCORE (70)
```

---

#### 14. `computeExhaustion(volState, indicators)`

```
Only applies when volState.regime === 'expansion' || 'climax'

Signals (each adds to exhaustion level):
  - bbwp > 85 → +30
  - bbwp > 95 → +20 additional
  - StochK > 80 (bull expansion) or StochK < 20 (bear expansion) → +20
  - ADX was > 35 and rate is decelerating → +15
  - VHM rate direction = 'decelerating' during expansion → +15

Level = sum (capped at 100)
Label: >= 80 "EXTREME", >= 60 "HIGH", >= 40 "MODERATE", else "LOW"

If regime is 'compression' or 'neutral' → level = 0, label = "LOW"

Note: Uses stochastic extremes instead of RSI (StochK > 80, StochK < 20)
```

---

#### 15. `predictTransition(regime: VolRegime, rateDirection: RateDirection, bbwp: number)`

```
Predicts the most likely next regime transition.

Input:  regime = 'compression'
        rateDirection = 'accelerating'
        bbwp = 13

Logic:
  COMPRESSION:
    If rateDirection === 'accelerating' → transition to 'neutral'/'transition'
      probability = 50 + (15 - bbwp) * 2   (closer to boundary = higher)
      trigger = "BBWP accelerating toward 15"
    Else → stay in compression
      probability = 30
      trigger = "BBWP still decelerating/flat"

  NEUTRAL:
    If bbwp < 25 and rateDirection === 'decelerating' → toward 'compression'
      probability = 40
    If bbwp > 60 and rateDirection === 'accelerating' → toward 'expansion'
      probability = 40
    Else → stay neutral
      probability = 20

  EXPANSION:
    If rateDirection === 'accelerating' and bbwp > 85 → toward 'climax'
      probability = 50
    If rateDirection === 'decelerating' → toward 'neutral'
      probability = 40
    Else → stay expansion
      probability = 25

  CLIMAX:
    If rateDirection === 'decelerating' → toward 'expansion'/'neutral'
      probability = 60  (climax rarely sustains)
    Else → stay climax
      probability = 30

  TRANSITION:
    → toward 'neutral' or 'expansion' depending on rate
      probability = 50

Output: StateTransition { from, to, probability, trigger }
```

---

#### 16. `computeMagnitude(signal: DVESignal, phasePersistence: PhasePersistence, direction: DirectionalPressure)`

```
Phase-opportunity-weighted directional magnitude.
Must be called AFTER Layer 4 (depends on signal + phasePersistence).

Logic:
  If signal.active:
    → signal.strength  (active signal is the strongest magnitude indicator)

  Else if phasePersistence.contraction.active:
    → phasePersistence.contraction.exitProbability × (Math.abs(direction.score) / 100)
    // High exit probability + strong direction = high magnitude opportunity

  Else if phasePersistence.expansion.active:
    → phasePersistence.expansion.continuationProbability × (Math.abs(direction.score) / 100)
    // High continuation + strong direction = high magnitude opportunity

  Else:
    → (direction.confidence / 100) × (Math.abs(direction.score) / 100) × 50
    // Neutral regime: blend of direction confidence and score, scaled down

Output: number (0-100), clamped

Design rationale: Raw BBWP overweights late expansion and underweights early
release states. This formula makes magnitude reflect phase opportunity — a low
BBWP with strong exit probability and clear direction produces higher magnitude
than a passively high BBWP with no directional conviction.
```

---

#### 17. `computeDVE(input: DVEInput, symbol: string)`

```
Main orchestrator. Calls all layer functions in order:

LAYER 1 — Linear Volatility State
  1. bbwpResult = computeBBWP(input.price.closes, BBWP.BB_LENGTH, BBWP.LOOKBACK)
  2. vhm = computeVHMHistogram(bbwpResult.bbwpSeries, VHM.SMOOTH_PERIOD)
  3. { regime, confidence: regimeConfidence } = classifyVolRegime(
       bbwpResult.bbwp, vhm.direction, input.indicators?.inSqueeze
     )
  4. volState = assemble VolatilityState {
       bbwp: bbwpResult.bbwp,
       bbwpSma5: vhm.sma5,
       regime,
       regimeConfidence,
       rateOfChange: vhm.rate,
       rateSmoothed: vhm.smoothed,
       acceleration: vhm.acceleration,
       rateDirection: vhm.direction,
       inSqueeze: input.indicators?.inSqueeze ?? false,
       squeezeStrength: input.indicators?.squeezeStrength ?? 0,
       atr: input.indicators?.atr ?? undefined,
       extremeAlert: bbwp < 2 ? 'low' : bbwp > 98 ? 'high' : null,
     }

LAYER 2 — Directional Bias
  5. direction = computeDirectionalPressure(input)

LAYER 3 — Phase Persistence
  7. contractionStats = computeZoneDurationStats(bbwpResult.bbwpSeries, 15, 'below')
  8. expansionStats = computeZoneDurationStats(bbwpResult.bbwpSeries, 90, 'above')
  9. phasePersistence = computePhasePersistence({
       bbwp: bbwpResult.bbwp,
       bbwpSma5: vhm.sma5,
       volatility: volState,
       contractionStats,
       expansionStats,
       direction,
       stochK: input.indicators?.stochK ?? undefined,
       stochKSlope: input.indicators?.stochKSlope ?? undefined,
     })

LAYER 4 — Signal Triggering
  10. signal = detectSignal(volState, direction, bbwpResult.bbwpSeries, input.price)
  11. signal.strength = computeSignalStrength(signal, volState, direction)
  12. invalidation = computeInvalidation(signal, volState, input.price)

  // Magnitude computed AFTER Layer 4 (depends on signal + phasePersistence)
  13. directionalVolatility = {
        magnitude: computeMagnitude(signal, phasePersistence, direction),
        bias: direction.score > 0 ? 'up' : direction.score < 0 ? 'down' : 'unknown',
        confidence: direction.confidence,
      }
      // computeMagnitude logic:
      //   if signal.active → signal.strength (strongest: active signal)
      //   else if in compression → contraction.exitProbability × (|direction.score| / 100)
      //   else if in expansion → expansion.continuationProbability × (|direction.score| / 100)
      //   else → blend of regimeConfidence + direction confidence

LAYER 5 — Outcome Projection
  14. projection = computeSignalProjection(
        signal.type, input.price.closes, bbwpResult.bbwpSeries
      )

SUPPORTING
  15. breakout = computeBreakoutReadiness(volState, input)
  16. trap = detectVolatilityTrap(volState, input.options, input.time)
  17. exhaustion = computeExhaustion(volState, input.indicators)
  18. transition = predictTransition(regime, vhm.direction, bbwpResult.bbwp)
  19. flags = deriveFlags(regime, direction, breakout, trap, exhaustion,
                          phasePersistence, signal)
  20. dataQuality = assessDataQuality(input)  // Score 0-100, list missing/warnings
      // Checks: closes length, stochK/D presence, stoch slopes, options,
      // time confluence, liquidity, historical episode count
  21. summary = buildSummary(all above)

Return DVEReading with all assembled data.

─── FLAGS DERIVATION ───
  deriveFlags adds to the flags array based on:
  - regime === 'compression' && breakout.score >= 60 → 'BREAKOUT_WATCH'
  - direction.bias === 'bullish' && regime === 'expansion' → 'EXPANSION_UP'
  - direction.bias === 'bearish' && regime === 'expansion' → 'EXPANSION_DOWN'
  - trap.detected → 'TRAP_DETECTED'
  - trap.candidate && !trap.detected → 'TRAP_CANDIDATE'
  - regime === 'climax' → 'CLIMAX_WARNING'
  - bbwp < 2 → 'COMPRESSION_EXTREME'
  - phasePersistence.contraction.exitProbability > 70 → 'CONTRACTION_EXIT_RISK'
  - phasePersistence.expansion.exitProbability > 70 → 'EXPANSION_EXIT_RISK'
  - signal.type ends with '_up' && signal.active → 'SIGNAL_UP'
  - signal.type ends with '_down' && signal.active → 'SIGNAL_DOWN'
```

---

## 6. Phase 4 — Unit Tests

**File:** `lib/directionalVolatilityEngine.test.ts`

### Test Suites

```
describe('computeBBWP')
  ✓ returns 50 for insufficient data (< bbLen + lookback closes)
  ✓ returns low bbwp for narrow-range price series
  ✓ returns high bbwp for volatile price series
  ✓ bbwpSeries length matches expected count
  ✓ bbwp is always 0-100

describe('computeVHMHistogram')
  ✓ returns accelerating when BBWP series is increasing
  ✓ returns decelerating when BBWP series is decreasing
  ✓ returns flat for stable BBWP series
  ✓ sma5 smooths the raw BBWP
  ✓ smoothed rate is less noisy than raw rate
  ✓ acceleration positive when rate is increasing
  ✓ acceleration negative when rate is decreasing
  ✓ acceleration near zero for steady rate

describe('classifyVolRegime')
  ✓ returns compression for bbwp < 15
  ✓ returns climax for bbwp > 90
  ✓ returns expansion for bbwp 70-90
  ✓ returns neutral for bbwp 15-70
  ✓ returns transition when rate accelerating from low base
  ✓ sets extremeAlert low when bbwp < 2
  ✓ sets extremeAlert high when bbwp > 98
  ✓ regimeConfidence high when deep inside regime
  ✓ regimeConfidence low near regime boundary
  ✓ regimeConfidence 50 for transition regime

describe('computeStochasticMomentum')
  ✓ returns positive for K > D with positive slopes
  ✓ returns negative for K < D with negative slopes
  ✓ midline bonus applied when K > 50 with positive spread
  ✓ midline penalty applied when K < 50 with negative spread
  ✓ returns 0 when all inputs null
  ✓ clamps to -15..+15

describe('computeDirectionalPressure')
  ✓ returns bullish for stoch bullish + MACD positive + price > SMA
  ✓ returns bearish for stoch bearish + MACD negative + price < SMA
  ✓ returns neutral when signals conflict
  ✓ falls back to MACD-only when stoch data unavailable
  ✓ crypto includes funding rate component
  ✓ equity excludes funding rate component
  ✓ score clamps to -100..+100

describe('computeZoneDurationStats')
  ✓ returns zero stats when no episodes found
  ✓ correctly identifies contiguous below-threshold episodes
  ✓ correctly identifies contiguous above-threshold episodes
  ✓ currentBars reflects active episode length
  ✓ currentBars = 0 when not in zone
  ✓ agePercentile correct when current episode is longest
  ✓ agePercentile correct when current episode is shortest
  ✓ episodeCount excludes current episode

describe('computePhasePersistence')
  ✓ contraction active with high continuation when bbwp < 15 and young
  ✓ contraction exit probability rises when age > average
  ✓ contraction inactive when bbwp >= 15
  ✓ expansion active with high continuation when bbwp > 90 and young
  ✓ expansion exit probability rises with exhaustion
  ✓ expansion inactive when bbwp <= 90
  ✓ stats always populated even when phase inactive

describe('detectSignal')
  ✓ fires compression_release_up on break above 15 with bullish stoch
  ✓ fires compression_release_down on break above 15 with bearish stoch
  ✓ fires expansion_continuation_up when bbwp > 90 with bullish bias
  ✓ fires expansion_continuation_down when bbwp > 90 with bearish bias
  ✓ returns none when no conditions met
  ✓ does not fire expansion_continuation when exhaustion is HIGH
  ✓ requires recent compression history for release signals

describe('computeSignalStrength')
  ✓ higher strength for clean BBWP cross
  ✓ SMA5 confirmation adds to strength
  ✓ stochastic alignment adds to strength
  ✓ returns 0 when signal.type is none

describe('computeInvalidation')
  ✓ price invalidation at signal bar low for up signals
  ✓ price invalidation at signal bar high for down signals
  ✓ phase invalidation at 15 for compression release signals
  ✓ phase invalidation at 90 for expansion continuation signals
  ✓ invalidated = true when price violates level
  ✓ invalidated = true when bbwp re-enters phase
  ✓ returns empty when signal.type is none

describe('computeSignalProjection')
  ✓ returns zeroed projection when sample size < 5
  ✓ correctly computes forward returns for compression release
  ✓ correctly computes max favorable excursion
  ✓ hit rate reflects % of positive outcomes for up signals
  ✓ sampleSize reflects actual instance count

describe('computeBreakoutReadiness')
  ✓ returns HIGH when compression + time alignment + gamma
  ✓ returns LOW when vol is expanded and no squeeze
  ✓ each component caps at its maximum weight

describe('detectVolatilityTrap')
  ✓ not detected when bbwp > 50
  ✓ detected when compression + gamma lock + time cluster
  ✓ partial detection (compression only) stays below threshold

describe('computeExhaustion')
  ✓ level 0 during compression
  ✓ high level during climax with stochK > 80
  ✓ rising when BBWP decelerating during expansion

describe('predictTransition')
  ✓ compression + accelerating → transition to neutral with high probability
  ✓ compression + decelerating → stay compression with low probability
  ✓ expansion + decelerating → toward neutral
  ✓ climax + decelerating → toward expansion/neutral (high probability)
  ✓ neutral near boundaries → toward adjacent regime
  ✓ transition → toward neutral or expansion

describe('computeMagnitude')
  ✓ returns signal.strength when signal is active
  ✓ uses exitProbability × direction for compression
  ✓ uses continuationProbability × direction for expansion
  ✓ returns blended low value for neutral regime
  ✓ clamps output to 0-100
  ✓ zero direction score produces zero magnitude in non-signal state

describe('computeDVE')
  ✓ full integration: compression scenario with phase persistence
  ✓ full integration: expansion scenario with signal fire
  ✓ full integration: climax scenario with exhaustion
  ✓ full integration: compression release up with projection
  ✓ flags array populated correctly (including new flags)
  ✓ invalidation populated when signal active
  ✓ summary string is non-empty
  ✓ handles missing optional inputs gracefully
  ✓ phasePersistence always present in output
  ✓ signal always present in output (even if type=none)
  ✓ signal.state reflects lifecycle (idle/armed/fired/invalidated)
  ✓ dataQuality present with score and missing array
  ✓ directionalVolatility.magnitude computed after signal (not NaN)
  ✓ regimeConfidence present and 0-100
  ✓ acceleration present in volatility state
```

### Test Data Strategy

Create synthetic price series with known properties:
- **Calm series:** 300 closes with ±0.3% daily moves → narrow BB width, low BBWP, compression regime
- **Volatile series:** 300 closes with ±3% daily moves → wide BB width, high BBWP, expansion regime
- **Transitioning series:** First 230 calm, last 70 volatile → BBWP rises through 15 → transition/release
- **Compressed-then-released series:** 200 calm, then 50 bars of increasing vol → tests compression_release signals
- **Expansion with exhaustion:** 200 moderate, then 100 bars of sustained high vol → tests expansion_continuation + exhaustion

---

## 7. Phase 5 — API Route

**File:** `app/api/dve/route.ts`

### Endpoint: `GET /api/dve?symbol=BTC`

```
Request:
  GET /api/dve?symbol=AAPL
  Cookie: ms_auth=...

Response (200):
  {
    "success": true,
    "data": DVEReading,
    "cached": false
  }

Response (401): { "success": false, "error": "Please log in" }
Response (403): { "success": false, "error": "Pro Trader subscription required" }
Response (400): { "success": false, "error": "Missing symbol parameter" }
Response (404): { "success": false, "error": "Unable to fetch price data for XXXX" }
```

### Pseudocode

```
export async function GET(request: NextRequest) {
  // 1. Auth + tier check (same pattern as golden-egg/route.ts)
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return 401;
  if (!hasProTraderAccess(session.tier)) return 403;

  // 2. Parse symbol
  const symbol = searchParams.get('symbol')?.trim().toUpperCase();
  if (!symbol) return 400;

  // 3. Check in-memory cache (3 min TTL, same pattern as golden-egg)
  const cached = dveCache.get(symbol);
  if (cached && Date.now() - cached.ts < DVE_CACHE_TTL) return cached;

  // 4. Detect asset class (reuse detectAssetClass from golden-egg)
  const assetClass = detectAssetClass(symbol);

  // 5. Fetch data in parallel (reuse existing helpers)
  const [priceData, mpeData] = await Promise.all([
    fetchPrice(symbol, assetClass),      // From golden-egg route (shared helper)
    fetchMPE(symbol, assetClass),        // From golden-egg route (shared helper)
  ]);
  if (!priceData) return 404;

  // 6. Fetch indicators
  const indData = await fetchIndicators(symbol, assetClass, priceData.historicalCloses);

  // 7. Fetch options (equities only)
  let optsData = null;
  if (assetClass === 'equity') {
    optsData = await fetchOptionsSnapshot(symbol, priceData.price);
  }

  // 8. Fetch time data
  let timeData = null;
  try {
    const scan = await confluenceLearningAgent.scanHierarchical(symbol, 'intraday_1h', 'extended');
    if (scan) {
      timeData = {
        activeTFCount: scan.scoreBreakdown?.activeTFs ?? 0,
        hotZoneActive: (scan.scoreBreakdown?.activeTFs ?? 0) >= 3,
        confluenceScore: scan.prediction?.confidence ?? 0,
      };
    }
  } catch {}

  // 9. Fetch liquidity (crypto only)
  let liqData = null;
  if (assetClass === 'crypto') {
    // Reuse getAggregatedFundingRates / getAggregatedOpenInterest
    ...
  }

  // 10. Assemble DVEInput from fetched data
  // Note: stochK, stochD come from existing Alpha Vantage STOCH indicator
  // stochMomentum = stochK - stochD (computed inline)
  // stochKSlope, stochDSlope = diff from previous bar (computed inline if historical available)
  const dveInput: DVEInput = {
    price: {
      closes: priceData.historicalCloses,
      highs: priceData.historicalHighs,
      lows: priceData.historicalLows,
      currentPrice: priceData.price,
      changePct: priceData.changePct,
      volume: priceData.volume,
    },
    indicators: indData ? {
      ...indData,
      stochMomentum: (indData.stochK != null && indData.stochD != null)
        ? indData.stochK - indData.stochD : null,
      // stochKSlope and stochDSlope computed from historical stoch series if available
    } : undefined,
    options: optsData ? { ...optsData } : undefined,
    time: timeData ?? undefined,
    liquidity: liqData ?? undefined,
    mpeComposite: mpeData?.composite,
  };

  // 11. Compute DVE (pure, no side effects)
  const reading = computeDVE(dveInput, symbol);

  // 12. Cache + return
  dveCache.set(symbol, { data: reading, ts: Date.now() });
  return NextResponse.json({ success: true, data: reading });
}
```

### Shared Helper Refactoring

The `fetchPrice`, `fetchIndicators`, `fetchOptionsSnapshot`, `fetchMPE` functions currently live **inside** `app/api/golden-egg/route.ts`. For DVE to reuse them without duplication:

**Option A (recommended):** Extract into `lib/goldenEggFetchers.ts` → both routes import from there.  
**Option B:** DVE route duplicates the calls (faster to ship, but debt).

The blueprint recommends **Option A** — extract ~200 lines of fetch helpers into a shared module.

---

## 8. Phase 6 — Golden Egg Integration

### 8a. Type Extension

**File:** `src/features/goldenEgg/types.ts`

Add optional fields to existing `layer3.structure.volatility`:

```typescript
// EXISTING (unchanged):
volatility: {
  regime: 'compression' | 'expansion' | 'neutral';
  atr?: number;

  // NEW additive optional fields (Layer 1):
  bbwp?: number;                 // 0-100 BBWP value
  bbwpSma5?: number;             // 5-SMA smoothed BBWP
  rateOfChange?: number;         // VHM histogram — rate of BBWP change

  // NEW (Layer 2):
  directionalBias?: 'bullish' | 'bearish' | 'neutral';
  directionalConfidence?: number; // 0-100

  // NEW (Layer 3):
  contractionContinuation?: number;  // 0-100
  expansionContinuation?: number;    // 0-100
  phaseAge?: number;                 // Current episode bars
  phaseAgePercentile?: number;       // 0-100 vs history

  // NEW (Layer 4):
  signalType?: string;               // DVESignalType
  signalStrength?: number;           // 0-100

  // NEW (Supporting):
  breakoutScore?: number;        // 0-100
  trapDetected?: boolean;
  trapScore?: number;            // 0-100
  exhaustionRisk?: number;       // 0-100
};
```

All fields are **optional** — existing UI continues to work unchanged.

### 8b. API Route Changes

**File:** `app/api/golden-egg/route.ts`

Inside `buildPayload()`, after existing volatility regime computation (~line 700):

```
// After existing: const volRegime = ...
// Add DVE computation:
const dveInput: DVEInput = { price: { closes: price.historicalCloses, ... }, indicators: ind, ... };
const dveReading = computeDVE(dveInput, symbol);

// Then populate the new optional fields:
volatility: {
  regime: volRegime,                              // existing
  atr: atr > 0 ? Math.round(atr * 100) / 100 : undefined,  // existing
  bbwp: dveReading.volatility.bbwp,
  bbwpSma5: dveReading.volatility.bbwpSma5,
  rateOfChange: dveReading.volatility.rateSmoothed,
  directionalBias: dveReading.direction.bias,
  directionalConfidence: dveReading.direction.confidence,
  contractionContinuation: dveReading.phasePersistence.contraction.continuationProbability,
  expansionContinuation: dveReading.phasePersistence.expansion.continuationProbability,
  phaseAge: dveReading.phasePersistence.contraction.active
    ? dveReading.phasePersistence.contraction.stats.currentBars
    : dveReading.phasePersistence.expansion.active
    ? dveReading.phasePersistence.expansion.stats.currentBars : undefined,
  phaseAgePercentile: dveReading.phasePersistence.contraction.active
    ? dveReading.phasePersistence.contraction.stats.agePercentile
    : dveReading.phasePersistence.expansion.active
    ? dveReading.phasePersistence.expansion.stats.agePercentile : undefined,
  signalType: dveReading.signal.type !== 'none' ? dveReading.signal.type : undefined,
  signalStrength: dveReading.signal.type !== 'none' ? dveReading.signal.strength : undefined,
  breakoutScore: dveReading.breakout.score,
  trapDetected: dveReading.trap.detected,
  trapScore: dveReading.trap.score,
  exhaustionRisk: dveReading.exhaustion.level,
}
```

### 8c. New Golden Egg Components

#### `GEVolatilityGauge`

```
Receives: layer3.structure.volatility (with new optional fields)

Visual: Semicircular gauge 0-100 with colored zones
  - 0-15: Deep blue (#1E3A5F) "COMPRESSION"
  - 15-70: Slate (#475569) "NEUTRAL"
  - 70-90: Amber (#D97706) "EXPANSION"
  - 90-100: Red (#DC2626) "CLIMAX"

Center: Large BBWP number
Below: Directional arrow (↑ bullish, ↓ bearish, ↔ neutral)
Subtitle line 1: "SMA5: 22.4"
Subtitle line 2: phase persistence if active ("Contraction: 72% continuation")

Conditional: Only renders when bbwp is defined (not undefined)
Graceful fallback: If bbwp is undefined, component returns null
```

#### `GEBreakoutReadiness`

```
Receives: breakoutScore + volatility object from layer3

Visual: 4 horizontal bars (same style as GEConfluenceHeatmap):
  - Vol Compression: 0-40
  - Time Alignment: 0-30
  - Gamma Wall: 0-20
  - ADX Rising: 0-10

Top right: Total score with label (HIGH / MODERATE / LOW)
Color: Green >= 60, Amber >= 40, Red < 40

Conditional: Only renders when breakoutScore is defined
```

#### `GEVolTrapAlert`

```
Receives: trapDetected, trapScore from layer3.structure.volatility

Visual: Full-width banner (only shows when trapDetected === true)
  - Background: pulsing amber/red gradient
  - Icon: ⚠️
  - Text: "VOLATILITY TRAP DETECTED — Score: 78/100"
  - Subtitle: "Compression + Gamma Lock + Time Cluster approaching"

Position: Between GERegimeBar and GEConfluenceHeatmap
Conditional: Returns null when trapDetected is falsy
```

### 8d. Golden Egg Page Layout Change

**File:** `src/features/goldenEgg/GoldenEggPage.tsx`

Insert new components into the existing layout:

```
{payload && (
  <div className="mt-8 space-y-8">
    <GESignalHero ... />

    {/* Regime + Timeframe row (existing) */}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <GERegimeBar ... />
      <GETimeframeContext ... />
    </div>

    {/* NEW: Volatility Trap Alert (conditional) */}
    <GEVolTrapAlert volatility={payload.layer3.structure.volatility} />

    {/* NEW: Volatility Gauge + Breakout Readiness row */}
    {payload.layer3.structure.volatility.bbwp != null && (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GEVolatilityGauge volatility={payload.layer3.structure.volatility} />
        <GEBreakoutReadiness volatility={payload.layer3.structure.volatility} />
      </div>
    )}

    {/* Confluence Heatmap (existing) */}
    <section>
      <SectionTitle icon="🔥" title="Confluence Heatmap" />
      <GEConfluenceHeatmap ... />
    </section>

    ... rest of existing layout unchanged ...
  </div>
)}
```

---

## 9. Phase 7 — Scanner Flags

### 9a. ScanResult Extension

**File:** `app/api/scanner/run/route.ts`

Add to the existing `ScanResult` interface:

```typescript
interface ScanResult {
  // ... all existing fields unchanged ...

  // NEW: DVE flags
  dveFlags?: DVEFlag[];                    // ['BREAKOUT_WATCH', 'SIGNAL_UP', ...]
  dveBreakoutScore?: number;               // 0-100
  dveBbwp?: number;                        // 0-100 BBWP value
  dveDirectionalBias?: 'bullish' | 'bearish' | 'neutral';
  dveSignalType?: DVESignalType;           // Active signal if any
  dveContractionContinuation?: number;     // 0-100
  dveExpansionContinuation?: number;       // 0-100
}
```

### 9b. Scanner Route Integration

In the per-symbol scan loop (both crypto and equity paths), after existing indicator computation:

```
// Compute DVE (lightweight — uses already-fetched data)
const dveInput: DVEInput = {
  price: { closes: candles.map(c => c.c), currentPrice: price, changePct, ... },
  indicators: { macd: macdHist, adx, atr, stochK, stochD, ... },
  // options/time/liquidity can be omitted for scanner speed
};
const dve = computeDVE(dveInput, sym);

// Add to scan result
result.dveFlags = dve.flags;
result.dveBreakoutScore = dve.breakout.score;
result.dveBbwp = dve.volatility.bbwp;
result.dveDirectionalBias = dve.direction.bias;
result.dveSignalType = dve.signal.type !== 'none' ? dve.signal.type : undefined;
result.dveContractionContinuation = dve.phasePersistence.contraction.active
  ? dve.phasePersistence.contraction.continuationProbability : undefined;
result.dveExpansionContinuation = dve.phasePersistence.expansion.active
  ? dve.phasePersistence.expansion.continuationProbability : undefined;
```

### 9c. Frontend Scanner Display

The scanner page (`app/tools/scanner/page.tsx`) would show flags as badges on scan results:

```
BREAKOUT_WATCH         → 🔥 "Breakout Watch" (amber badge)
EXPANSION_UP           → 📈 "Expansion Up" (green badge)
EXPANSION_DOWN         → 📉 "Expansion Down" (red badge)
TRAP_CANDIDATE         → 🔍 "Trap Watch" (amber outline badge)
TRAP_DETECTED          → ⚠️ "Vol Trap" (pulsing amber badge)
SIGNAL_UP              → 🟢 "Signal Up" (green pulse badge)
SIGNAL_DOWN            → 🔴 "Signal Down" (red pulse badge)
CONTRACTION_EXIT_RISK  → 💥 "Contraction Exit" (amber badge)
EXPANSION_EXIT_RISK    → 🔻 "Expansion Exit" (red badge)
COMPRESSION_EXTREME    → ❄️ "Extreme Compression" (blue badge)
CLIMAX_WARNING         → 🔥 "Climax" (red badge)
```

These render conditionally only when `dveFlags` exists and is non-empty.

---

## 10. Phase 8 — Standalone UI

### 10a. Route Entry

**File:** `app/tools/volatility-engine/page.tsx`

```typescript
'use client';
import VolatilityEnginePage from '@/src/features/volatilityEngine/VolatilityEnginePage';
import { useUserTier, canAccessVolatilityEngine } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

export default function Page() {
  const { tier, isLoading } = useUserTier();
  if (isLoading) return <div className="min-h-screen bg-[var(--msp-bg)]" />;
  if (!canAccessVolatilityEngine(tier)) {
    return <UpgradeGate requiredTier="pro_trader" feature="Volatility Engine" />;
  }
  return <VolatilityEnginePage />;
}
```

### 10b. Tier Gate

**File:** `lib/useUserTier.ts` — add one line:

```typescript
export const canAccessVolatilityEngine = (tier: UserTier) => tier === "pro_trader";
```

### 10c. Feature Structure

```
src/features/volatilityEngine/
├── types.ts                            — Frontend DVE types (mirrors API response)
├── VolatilityEnginePage.tsx             — Main page — phase intelligence console
└── components/
    ├── VEHeatmapGauge.tsx              — BBWP semicircle gauge + SMA5 line
    ├── VEBreakoutPanel.tsx             — Breakout readiness 4-bar breakdown
    ├── VEDirectionalCompass.tsx         — Stoch momentum direction + magnitude
    ├── VETrapAlert.tsx                 — Conditional trap detection banner
    ├── VEPhasePanel.tsx                — Phase persistence + dwell-time stats  (NEW)
    ├── VESignalCard.tsx                — Signal status + strength + reasons     (NEW)
    ├── VEProjectionCard.tsx            — Expected move projection              (NEW)
    ├── VEInvalidationCard.tsx          — Invalidation levels + state            (NEW)
    └── VERegimeTimeline.tsx            — Regime state with transition prediction
```

### 10d. Page Layout — Phase Intelligence Console

The standalone page is no longer just a volatility dashboard.  
It is a **phase intelligence console** with 5 sections mapping to the 5 engine layers.

```
VolatilityEnginePage:

┌─────────────────────────────────────────────────────────┐
│  [Symbol Input]  [Analyze]                              │
│  Quick symbols: BTC ETH AAPL TSLA NVDA SPX GOLD         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ═══ LAYER 1: VOLATILITY STATE ═══                      │
│  ┌──────────────────┐  ┌───────────────────────────┐    │
│  │  BBWP GAUGE       │  │  REGIME + SMA5 STATE       │    │
│  │  Semicircle        │  │  BBWP: 11.2               │    │
│  │  0 ←──█──→ 100    │  │  SMA5: 13.8               │    │
│  │  Regime: COMPRESS  │  │  Rate: -2.1 (decelerating)│    │
│  │  ❄️ Extreme Low     │  │  Squeeze: Active (0.82)    │    │
│  └──────────────────┘  └───────────────────────────┘    │
│                                                         │
│  ═══ LAYER 2: DIRECTIONAL BIAS ═══                      │
│  ┌──────────────────────────────────────────────┐       │
│  │  STOCHASTIC MOMENTUM + COMPOSITE              │       │
│  │  Stoch: K=72 D=65 Spread=+7 (Bullish)         │       │
│  │  Composite: +38 BULLISH (63% confidence)       │       │
│  │  Components:                                   │       │
│  │    Stoch Momentum  ████████████░░░  +12/15     │       │
│  │    Trend Structure  ██████████░░░░  +10/20     │       │
│  │    Options Flow     ████████░░░░░░   +8/20     │       │
│  │    Volume           ████░░░░░░░░░░   +5/10     │       │
│  │    Dealer Gamma     ███░░░░░░░░░░░   +3/15     │       │
│  │    Market Breadth   ░░░░░░░░░░░░░░   +0/10     │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  ═══ LAYER 3: PHASE PERSISTENCE ═══                     │
│  ┌──────────────────────────────────────────────┐       │
│  │  CONTRACTION (ACTIVE)                         │       │
│  │  Current: 6 bars                               │       │
│  │  Median:  3 bars    ← primary benchmark         │       │
│  │  Average: 4.2 bars  (secondary)                 │       │
│  │  Max:     12 bars                               │       │
│  │  Age Percentile: 72% — STRETCHED               │       │
│  │  Continuation: 35%  ████░░░░░░                 │       │
│  │  Exit:          72%  ████████░░                 │       │
│  │                                                │       │
│  │  EXPANSION (INACTIVE)                          │       │
│  │  Last episode: 8 bars (median: 5, avg: 5.1, max: 14)│  │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  ═══ LAYER 4: SIGNAL + INVALIDATION ═══                 │
│  ┌──────────────────┐  ┌───────────────────────────┐    │
│  │  SIGNAL STATUS    │  │  INVALIDATION LEVELS       │    │
│  │  ● COMPRESSION    │  │                            │    │
│  │    RELEASE UP     │  │  Price: $67,200 (bar low)  │    │
│  │  Strength: 78/100 │  │  Phase: BBWP < 15          │    │
│  │  Trigger: BBWP    │  │  Smooth: SMA5 < 15         │    │
│  │  broke above 15   │  │  Status: ✅ VALID           │    │
│  └──────────────────┘  └───────────────────────────┘    │
│                                                         │
│  ═══ LAYER 5: OUTCOME PROJECTION ═══                    │
│  ┌──────────────────────────────────────────────┐       │
│  │  HISTORICAL EXPECTANCY                        │       │
│  │  Signal: compression_release_up               │       │
│  │  Expected Move:  +4.2%                        │       │
│  │  Median Move:    +3.1%                        │       │
│  │  Max Historical: +12.8%                       │       │
│  │  Avg Bars:       8.4                          │       │
│  │  Hit Rate:       68% (17 of 25 signals)       │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  ═══ SUPPORTING ═══                                     │
│  ┌──────────────────────────────────────────────┐       │
│  │  BREAKOUT READINESS                           │       │
│  │  ████████░░  Vol Compression    32/40         │       │
│  │  ██████░░░░  Time Alignment     22/30         │       │
│  │  ████░░░░░░  Gamma Wall         15/20         │       │
│  │  ███░░░░░░░  ADX Rising          7/10         │       │
│  │                        Total: 76/100 HIGH     │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  ┌──────────────────────────────────────────────┐       │
│  │ ⚠️ VOLATILITY TRAP DETECTED — Score: 72/100    │       │
│  │ Compression + Gamma Lock + Time Cluster        │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  ┌──────────────────────────────────────────────┐       │
│  │  SUMMARY                                      │       │
│  │  BTC BBWP at 11.2 (compression). Stochastic   │       │
│  │  momentum bullish (+12). Contraction episode   │       │
│  │  stretched at 72nd percentile age. Compression │       │
│  │  release UP signal fired — strength 78/100.    │       │
│  │  Historical: +4.2% expected, 68% hit rate.     │       │
│  │  Invalidation: below $67,200.                  │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 11. Data Flow Diagram

```
                    ┌──────────────────────┐
                    │   Existing Fetchers   │
                    │                      │
                    │  fetchPrice()        │──→ closes[], highs[], lows[], price, changePct
                    │  getIndicators()     │──→ MACD, ADX, ATR, BB, Stoch(K,D)
                    │  fetchOptionsSnapshot│──→ P/C, IV rank, gamma, maxPain
                    │  scanHierarchical()  │──→ activeTFCount, hotZone
                    │  getFundingRates()   │──→ fundingRate, OI
                    │  computeMarketPressure│──→ composite score
                    └──────────┬───────────┘
                               │
                    Assembled into DVEInput
                    (stochMomentum, stochKSlope, stochDSlope
                     computed inline from raw stoch data)
                               │
                    ┌──────────▼───────────────────────────┐
                    │                                      │
                    │  computeDVE()   ← PURE FUNCTION      │
                    │                                      │
                    │  LAYER 1: Linear Volatility State    │
                    │    1. computeBBWP()                   │
                    │    2. computeVHMHistogram()           │
                    │    3. classifyVolRegime()             │
                    │                                      │
                    │  LAYER 2: Directional Bias           │
                    │    4. computeStochasticMomentum()     │
                    │    5. computeDirectionalPressure()    │
                    │                                      │
                    │  LAYER 3: Phase Persistence          │
                    │    6. computeZoneDurationStats() ×2   │
                    │    7. computePhasePersistence()       │
                    │                                      │
                    │  LAYER 4: Signal Triggering          │
                    │    8. detectSignal()                  │
                    │    9. computeSignalStrength()         │
                    │   10. computeInvalidation()          │
                    │                                      │
                    │  LAYER 5: Outcome Projection         │
                    │   11. computeSignalProjection()      │
                    │                                      │
                    │  SUPPORTING                          │
                    │   12. computeBreakoutReadiness()     │
                    │   13. detectVolatilityTrap()         │
                    │   14. computeExhaustion()            │
                    │   15. deriveFlags() + buildSummary() │
                    │                                      │
                    └──────────┬───────────────────────────┘
                               │
                          DVEReading
                    (volatility, direction,
                     phasePersistence, signal,
                     invalidation, projection,
                     breakout, trap, exhaustion,
                     transition, flags, summary)
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     /api/dve endpoint   Golden Egg API    Scanner Route
              │                │                │
      Phase Intelligence  layer3.volatility  dveFlags[] +
      Console consumes    gets 15+ new       dveBbwp +
      full DVEReading     optional fields    dveSignalType
```

---

## 12. Integration Map

| Existing File | What Changes | Lines Affected (approx) |
|---------------|-------------|------------------------|
| `src/features/goldenEgg/types.ts` | Add 15 optional fields to `volatility` | ~15 lines added at line 155 |
| `app/api/golden-egg/route.ts` | Import DVE, add `computeDVE()` call in `buildPayload()` | ~30 lines added near line 700 |
| `src/features/goldenEgg/GoldenEggPage.tsx` | Import + render 3 new components | ~15 lines added near line 170 |
| `app/api/scanner/run/route.ts` | Add 7 optional fields to `ScanResult`, compute DVE per symbol | ~20 lines per scan path |
| `app/tools/scanner/page.tsx` | Show DVE flag badges (10 flag types) on scan results | ~30 lines in result renderer |
| `lib/useUserTier.ts` | Add `canAccessVolatilityEngine` export | 1 line |

**Estimated net new code:** ~1,900 lines (up from ~1,200 in v1 due to phase persistence, signals, projection, invalidation, data quality)
**Estimated modified code:** ~120 lines across 6 files  

---

## 13. Dependency Order

Each phase can be shipped independently. Later phases depend on earlier ones.

```
Phase 1: lib/directionalVolatilityEngine.types.ts     ← No dependencies
Phase 2: lib/directionalVolatilityEngine.constants.ts  ← No dependencies
Phase 3: lib/directionalVolatilityEngine.ts            ← Depends on Phase 1 + 2
Phase 4: lib/directionalVolatilityEngine.test.ts       ← Depends on Phase 3
Phase 5: app/api/dve/route.ts                          ← Depends on Phase 3
Phase 6: Golden Egg integration                        ← Depends on Phase 3 + 5
Phase 7: Scanner flags                                 ← Depends on Phase 3
Phase 8: Standalone UI                                 ← Depends on Phase 5
```

**Recommended build order for PRs:**

1. **PR #1:** Phases 1-4 (types + constants + engine + tests) — pure library, zero integration risk. This is the entire 5-layer engine.
2. **PR #2:** Phase 5 (API route + shared helper extraction) — thin layer, easy to review
3. **PR #3:** Phases 6-7 (Golden Egg + Scanner integration) — UI changes
4. **PR #4:** Phase 8 (Standalone phase intelligence console) — new feature, independent

---

## Helper Refactoring: Shared Fetch Functions

Before Phase 5, extract these functions from `app/api/golden-egg/route.ts` into `lib/goldenEggFetchers.ts`:

- `detectAssetClass(symbol)` (~10 lines)
- `fetchPrice(symbol, assetClass)` (~50 lines)
- `fetchIndicators(symbol, assetClass, closes)` (~50 lines — must return stochK, stochD for DVE)
- `fetchOptionsSnapshot(symbol, price)` (~70 lines)
- `fetchMPE(symbol, assetClass)` (~40 lines)

Both `/api/golden-egg` and `/api/dve` import from the shared module.  
This is a **zero-behavior-change refactor** — just moving code.

**New requirement for `fetchIndicators`:** Must also return `stochK`, `stochD` from the Alpha Vantage STOCH endpoint. The DVE route will compute `stochMomentum` (K-D), `stochKSlope`, and `stochDSlope` inline from the returned values + any available historical stoch data.

---

## What This Does NOT Include

- No new database tables
- No new external API dependencies
- No changes to auth/middleware
- No changes to cookie/session format
- No changes to Stripe/payment logic
- No breaking changes to existing types (all additions are optional)
- No removal of existing functionality
- No modifications to `lib/marketPressureEngine.ts` (DVE runs alongside MPE, not inside it)

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| v1 | 2026-03-12 | Initial blueprint — realized volatility + directional pressure + breakout + trap |
| v2 | 2026-03-12 | Material upgrade: BBWP replaces realized vol as core metric. RSI replaced by stochastic momentum. Added 5-layer architecture: Linear Volatility State, Directional Bias, Phase Persistence, Signal Triggering, Outcome Projection. New functions: computeBBWP, computeStochasticMomentum, computeZoneDurationStats, computePhasePersistence, detectSignal, computeSignalStrength, computeInvalidation, computeSignalProjection. Engine grows from 9 to 15 exports. Standalone page upgraded from volatility dashboard to phase intelligence console. |
| v2.1 | 2026-03-12 | Pine Script re-audit: Added `triggerBarOpen` to DVESignal + `opens[]` to DVEPriceInput. Added `INVALIDATION.MODE` constant ('extreme' vs 'open') matching Pine's `i_priceInvalidationMode` input. Updated all 4 invalidation rule sets to be mode-aware. Added `invalidationMode` field to DVEInvalidation type. |

---

## End of Blueprint
