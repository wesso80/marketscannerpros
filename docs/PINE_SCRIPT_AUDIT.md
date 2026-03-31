# MSP Platform — Complete Technical Indicator & Trading Logic Audit
## For TradingView Pine Script Recreation

> **Generated from source code audit of all scanner engines, scoring systems, and signal generators.**
> Every parameter, threshold, weight, and formula extracted verbatim.

---

## Table of Contents
1. [Indicator Parameters (Global)](#1-indicator-parameters-global)
2. [Scanner Scoring Engine (run/route.ts — 5-Layer)](#2-scanner-scoring-engine-5-layer)
3. [Bulk Scanner Scoring Engines](#3-bulk-scanner-scoring-engines)
4. [Universe Scanner Scoring (Yahoo Finance)](#4-universe-scanner-scoring)
5. [Golden Egg Scoring (4-Pillar Model)](#5-golden-egg-scoring-4-pillar-model)
6. [Directional Volatility Engine (DVE)](#6-directional-volatility-engine-dve)
7. [Setup Label Derivation (Signal Classification)](#7-setup-label-derivation)
8. [Trade Parameter Computation](#8-trade-parameter-computation)
9. [Time Confluence Engines](#9-time-confluence-engines)
10. [Confluence Learning Agent](#10-confluence-learning-agent)
11. [Regime Classification](#11-regime-classification)
12. [Regime Engine](#12-regime-engine)
13. [Institutional Filter](#13-institutional-filter)
14. [Squeeze & Momentum Detection](#14-squeeze--momentum-detection)
15. [Capital Flow Engine](#15-capital-flow-engine)
16. [Soft Personalization (Edge Hints)](#16-soft-personalization)
17. [Local Indicator Implementations](#17-local-indicator-implementations)

---

## 1. Indicator Parameters (Global)

All engines share these standard parameters:

| Indicator | Period/Params | Source |
|-----------|--------------|--------|
| RSI | 14 | Alpha Vantage / Local |
| MACD | Fast=12, Slow=26, Signal=9 | Alpha Vantage / Local |
| EMA | 200 (primary trend filter) | Alpha Vantage / Local |
| EMA | 9, 20, 50 (additional) | Local only |
| SMA | 20, 50, 200 | Local only |
| ATR | 14 | Alpha Vantage / Local |
| ADX | 14 (includes +DI, -DI) | Alpha Vantage / Local |
| Stochastic | K=14, D=3, Smooth=3 | Alpha Vantage / Local |
| CCI | 20 | Alpha Vantage / Local |
| Aroon | 25 | Alpha Vantage / Local |
| OBV | — (cumulative) | Local |
| MFI | 14 | Alpha Vantage / Local |
| VWAP | Rolling (all bars) | Local |
| Bollinger Bands | Period=20, StdDev=2 | Local |
| Williams %R | 14 | Local |
| NATR | 14 | Local |
| Chaikin A/D | — (cumulative) | Local |
| ROC | 12 | Local |
| BOP | — (single bar) | Local |

**Minimum bars required for reliable computation:**
- RSI(14): 15 bars
- MACD(12,26,9): 35 bars
- ATR(14): 15 bars
- ADX(14): 29 bars
- EMA(200)/SMA(200): 200 bars
- BB(20): 20 bars
- Squeeze detection: 34 bars

---

## 2. Scanner Scoring Engine (5-Layer)

**File:** `app/api/scanner/run/route.ts` — function `computeScore()`

This is the **primary** scanner used for individual ticker scans. It uses a 5-layer architecture with 15+ signals.

### Layer 1: Trend Structure (45% of max weight)

**ADX Trend Multiplier** (applied to all Layer 1 signals):
| ADX Value | Multiplier |
|-----------|-----------|
| ≥ 40 | 1.4x |
| ≥ 25 | 1.2x |
| ≥ 20 | 1.0x |
| < 20 | 0.6x (choppy — distrust trend) |

**1a. Price vs EMA(200)** — weight: 2 × trendMultiplier
```
pctFromEma = ((close - ema200) / ema200) * 100
> +3%  → bullish += 2 × tm
> +1%  → bullish += 2 × tm × 0.7
< -3%  → bearish += 2 × tm
< -1%  → bearish += 2 × tm × 0.7
else   → neutral += 1
```

**1b. DI+ vs DI-** — weight: 1.5 × trendMultiplier
```
diDiff = plusDI - minusDI
> +10 → bullish += 1.5 × tm (strong buyer dominance)
> +3  → bullish += 1.5 × tm × 0.6
< -10 → bearish += 1.5 × tm
< -3  → bearish += 1.5 × tm × 0.6
else  → neutral += 0.5
```

**1c. MACD Histogram** — weight: 1.0 × trendMultiplier
```
hist > 0 → bullish += 1.0 × tm
hist ≤ 0 → bearish += 1.0 × tm
```

**1d. MACD vs Signal** — weight: 1.0 × trendMultiplier
```
macd > signal → bullish += 1.0 × tm
macd ≤ signal → bearish += 1.0 × tm
```

**1e. Aroon Oscillator** — weight: 1.0 × trendMultiplier
```
aroonOsc = aroonUp - aroonDown  // range: -100 to +100
> +50 → bullish += 1.0 × tm (strong uptrend structure)
> +20 → bullish += 1.0 × tm × 0.6
< -50 → bearish += 1.0 × tm
< -20 → bearish += 1.0 × tm × 0.6
else  → neutral += 0.5
```

### Layer 2: Volume & Participation (20% of max weight)

**2a. OBV Trend** — weight: 1.0 × trendMultiplier
```
obvChange = ((obvCurrent - obvPrev) / |obvPrev|) × 100
> +2%  → bullish += 1.0 × tm (volume flowing in)
> +0.5% → bullish += 1.0 × tm × 0.5
< -2%  → bearish += 1.0 × tm
< -0.5% → bearish += 1.0 × tm × 0.5
else   → neutral += 0.5
```

**2b. MFI (Money Flow Index)** — weight: 1.0 (NOT multiplied by ADX)
```
≥ 80 → bearish += 1.0 (overbought with volume = distribution)
≥ 60 → bullish += 0.8 (healthy inflow)
≤ 20 → bullish += 1.0 (oversold with volume = accumulation)
≤ 40 → bearish += 0.8 (weak flow)
else → neutral += 0.5
```

**2c. Price vs VWAP** — weight: 0.8 (NOT multiplied by ADX)
```
vwapPct = ((close - vwap) / vwap) × 100
> +1%  → bullish += 0.8 (trading above VWAP)
> +0.2% → bullish += 0.4
< -1%  → bearish += 0.8 (below VWAP)
< -0.2% → bearish += 0.4
else   → neutral += 0.3
```

### Layer 3: Oscillators (25% of max weight — NOT affected by ADX)

**3a. RSI** — weight: 1.0
```
> 70 & trendMultiplier ≥ 1.2 → bearish += 0.5 (respect strong trends)
> 70 & trendMultiplier < 1.2 → bearish += 1.0 (overbought)
55-70                         → bullish += 1.0 (healthy bull momentum)
< 30 & trendMultiplier ≥ 1.2 → bullish += 0.5 (respect strong downtrends)
< 30 & trendMultiplier < 1.2 → bullish += 1.0 (oversold bounce)
30-45                         → bearish += 1.0 (weakening momentum)
else                          → neutral += 0.7 (dead zone)
```

**3b. Stochastic %K + %D Crossover** — weight: up to 1.2
```
K > 80 AND K < D → bearish += 1.2 (overbought + bearish cross)
K > 80 AND K > D → bearish += 0.5 (overbought but bullish cross)
K < 20 AND K > D → bullish += 1.2 (oversold + bullish cross)
K < 20 AND K < D → bullish += 0.5 (oversold but bearish cross)
K > D            → bullish += 0.5
K ≤ D            → bearish += 0.5

// Fallback (only K available):
K > 80  → bearish += 0.8
K < 20  → bullish += 0.8
K ≥ 50  → bullish += 0.4
K < 50  → bearish += 0.4
```

**3c. CCI** — weight: 0.8
```
> +200  → bearish += 0.8 (extreme overbought = reversal)
> +100  → bullish += 0.8 (strong momentum)
> 0     → bullish += 0.3
< -200  → bullish += 0.8 (extreme oversold = reversal)
< -100  → bearish += 0.8 (strong downward)
else    → bearish += 0.3
```

### Layer 4: Volatility Regime (±10% boost/penalty from DVE)

**4a. BBWP (Bollinger Band Width Percentile)**
```
< 10 → +5 (extreme compression = breakout imminent)
< 20 → +3
> 90 → -3 (climax volatility = exhaustion risk)
> 80 → +2 (high vol but not exhaustion)
```

**4b. DVE Breakout Score**
```
≥ 70 → +5 (high breakout probability)
≥ 50 → +2
```

**4c. DVE Flags**
```
SQUEEZE_FIRE    → +8
HIGH_BREAKOUT   → +4
VOL_TRAP        → -3
EXHAUSTION_RISK → -5
```

**4d. ATR Risk Dampening**
```
atrPercent = (ATR / close) × 100
> 8% → -5 (extreme daily range)
> 5% → -2
```

Total volatility boost clamped to: `max(-10, min(15, volatilityBoost))`

### Layer 5: Derivatives (Crypto only, up to +8)

**Funding Rate:**
```
> +0.05% → bearish += 0.8 + derivativesBoost += 2 (crowded long)
< -0.05% → bullish += 0.8 + derivativesBoost += 2 (crowded short)
> +0.01% → bullish += 0.3 (mild long bias)
< -0.01% → bearish += 0.3
```

**Open Interest Change:**
```
|oiChange%| > 5 → derivativesBoost += 3 (big OI = active positioning)
|oiChange%| > 2 → derivativesBoost += 1
```

Derivatives boost clamped to: `max(0, min(8, derivativesBoost))`

### Direction Determination
```
bullishSignals > bearishSignals × 1.15 → direction = 'bullish'
bearishSignals > bullishSignals × 1.15 → direction = 'bearish'
else → direction = 'neutral'
```

### Score Calculation (0-100 Conviction)
```typescript
dominantSignals = max(bullish, bearish)
opposingSignals = min(bullish, bearish)
totalDirectional = dominant + opposing
maxSignals = 14 × trendMultiplier

// Net conviction: how much one side wins (0 to 1)
netConviction = totalDirectional > 0
  ? (dominant - opposing) / totalDirectional : 0

// Agreement ratio: dominant vs theoretical max (0 to 1)
agreementRatio = dominant / maxSignals

// Confluence bonus (independent signal layer count)
layersContributing = count of: [ema200, hist, rsi, stochK, cci, obv, mfi, adx, aroon]
≥ 7 layers → +8
≥ 5 layers → +4
< 5 layers → +0

// Base score: 50/50 blend
score = round((netConviction × 0.5 + agreementRatio × 0.5) × 85)
score += confluenceBonus
score += clamp(volatilityBoost, -10, 15)
score += clamp(derivativesBoost, 0, 8)
score = clamp(score, 0, 100)
```

---

## 3. Bulk Scanner Scoring Engines

**File:** `app/api/scanner/bulk/route.ts`

### 3A. computeScore (ADX-adjusted 7-signal — used by scan-universe cron)

**ADX Trend Multiplier (slightly different from main scanner):**
| ADX | Multiplier |
|-----|-----------|
| ≥ 40 | 1.4x |
| ≥ 25 | 1.25x |
| ≥ 20 | 1.0x |
| < 20 | 0.7x |

**Trend Signals (multiplied by tm):**
1. EMA200: price > 1.01×EMA → bull 2×tm; < 0.99×EMA → bear 2×tm; else neutral 1
2. MACD Hist: > 0 → bull 1×tm; else bear 1×tm
3. MACD vs Signal: same pattern as hist, 1×tm
4. Aroon: up>down & up>70 → bull 1×tm; down>up & down>70 → bear 1×tm; else neutral 0.5

**Oscillator Signals (NOT multiplied by ADX):**
5. RSI: 55-70 → bull 1; >70 → bear 1; 30-45 → bear 1; <30 → bull 1; else neutral 1
6. Stochastic: >80 → bear 1; <20 → bull 1; ≥50 → bull 0.5; else bear 0.5
7. CCI: >100 → bull 1; >0 → bull 0.5; <-100 → bear 1; else bear 0.5
8. ATR% > 5 → neutral 1 (volatility caution)

**Direction:** bullish if bull > bear × 1.15
**Score:** `50 + (diff / (10 × tm)) × 50`, clamped 0-100

### 3B. computeFullScore (Cache-first equity — 9-signal with ATR caution)
Same as 3A but simplified (reads from worker cache). Identical scoring logic.

### 3C. scoreLightCryptoCandidate (Market-data only)
```
momentumScore = normalized % change → 0-100
liquidityScore = log10(volume) / 9 × 100, clamped 0-100
turnoverScore = turnover ratio × 100 (from CoinGecko)
rankScore = inverse market cap rank

weightedScore = momentum × 0.45 + liquidity × 0.25 + turnover × 0.20 + rank × 0.10
```

### 3D. scoreLightEquityCandidate (AV bulk quotes only)
```
momentumChange = intradayChange * (1.2 or 0.8) + dailyChange * (0.35 or 0.6)
momentumRange = 12 (1d), 8 (1h), 5 (other)
momentumScore = clamp(((momentumChange + range) / (range × 2)) × 100, 0, 100)
liquidityScore = log10(volume) / 9 × 100
moverBiasScore = 50 + moverBias × 25

score = momentum × 0.55 + liquidity × 0.30 + moverBias × 0.15
```

### 3E. buildInstitutionalPickScoreV2
```
setupScore    = 0.40 × alignment + 0.30 × structure + 0.15 × momentum + 0.15 × flow
contextScore  = regime_fit + liquidity_state + data_health
executionScore = trigger_quality + risk_fit

confidence    = 0.55 × setupScore + 0.25 × contextScore + 0.20 × executionScore

Permission gates:
  blocked → confidence ≤ 54
  watch   → confidence ≤ 69
  trade   → confidence > 69

rankScore = 0.70 × confidence + 0.30 × contextScore

Regime classification within V2:
  expansion  → ATR% ≥ 5
  contraction → ATR% ≤ 0.8
  trend      → ADX ≥ 28
  range      → ADX < 20
```

**Block Reasons (any triggers no-trade):**
- direction_neutral
- tf_alignment_low
- quality_below_threshold
- risk_mode_block
- volatility_unfavorable
- liquidity_unfavorable
- no_trigger
- data_integrity_low

**Strategy Classification:**
- TREND_PULLBACK
- BREAKOUT_CONTINUATION
- MEAN_REVERSION
- RANGE_FADE
- MOMENTUM_REVERSAL

---

## 4. Universe Scanner Scoring

**File:** `app/api/jobs/scan-universe/route.ts`

7-indicator system, Yahoo Finance data, 6-month daily bars.

**Same ADX multiplier as bulk scanner 3A.**

**Signals (7 total, max 8.5 weighted):**
1. EMA200 trend: 2pts × tm
2. RSI(14): 1pt — 55-70 bull, >70 bear (reversal), 30-45 bear, <30 bull (reversal)
3. MACD: above signal +1, positive +0.5 = 1.5pts × tm total
4. ADX amplifier: >25 amplifies dominant direction, 1pt × tm
5. Stochastic: >80 bear, <20 bull, ≥50 +0.5 bull, 1pt
6. Aroon: Up>Down & Up>70 bull, Down>Up & Down>70 bear, 1pt × tm
7. CCI: >100 +1 bull, >0 +0.5, <-100 +1 bear, 1pt

**Direction:** bullish if bull > bear × 1.3
**Score:** `50 + (diff / 8.5) × 50`

---

## 5. Golden Egg Scoring (4-Pillar Model)

**File:** `lib/goldenEggScoring.ts`

Quick batch scoring for cron/opportunity scans.

### Weights
| Pillar | Weight |
|--------|--------|
| Structure | 30% |
| Flow | 25% |
| Momentum | 20% |
| Risk | 25% |

### Structure Pillar (base 50)
```
price > SMA20    → +10 / else -10
price > SMA50    → +10 / else -10
SMA20 > SMA50    → +8  / else -8
price > BB middle → +5  / else -5
ADX > 25         → +7  / else -3
```

### Flow Pillar
Returns neutral 50 (no options data available in cron context).

### Momentum Pillar (base 50)
```
RSI 55-70   → +12
RSI ≥ 70    → +5
RSI 30-45   → -10
RSI ≤ 30    → -5
MACD > 0    → +8  / else -8
MACD hist>0 → +7  / else -7
StochK > 80 → +3
StochK < 20 → -3
changePct>2 → +8
changePct>0 → +3
changePct<-2→ -8
else        → -3
```

### Risk Pillar (base 60)
```
ATR% > 6  → -20
ATR% > 4  → -10
ATR% < 1.5 → +5
ADX > 25  → +8
BB width<8 → +5
```

### Final Score
```
confidence = Structure×0.30 + Flow×0.25 + Momentum×0.20 + Risk×0.25
```

### Direction Voting System
Each votes bull or bear independently:
- RSI > 55 → bull
- MACD > 0 → bull
- MACD hist > 0 → bull
- changePct > 1 → bull (< -1 → bear)
- scannerDirection (if provided)

```
bullCount > bearCount + 1 → LONG
bearCount > bullCount + 1 → SHORT
else → NEUTRAL
```

### Permission & Grade
```
confidence ≥ 70 AND directional → TRADE
confidence < 40                 → NO_TRADE
else                            → WATCH

Grade: A ≥ 75, B ≥ 60, C ≥ 40, D < 40
```

---

## 6. Directional Volatility Engine (DVE)

**Files:** `lib/directionalVolatilityEngine.ts`, `lib/directionalVolatilityEngine.constants.ts`, `lib/directionalVolatilityEngine.types.ts`

5-layer pure computation engine. **This is the most complex and novel system.**

### Constants
```
BBWP:
  BB_LENGTH = 13
  LOOKBACK = 252 (1 year of trading days)
  SMA_PERIOD = 5
  STD_MULTIPLIER = 2

VOL_REGIME:
  COMPRESSION_THRESHOLD = 15
  NEUTRAL_UPPER = 70
  EXPANSION_THRESHOLD = 70
  CLIMAX_THRESHOLD = 90
  EXTREME_LOW = 2
  EXTREME_HIGH = 98

VHM (Volatility Histogram):
  SMOOTH_PERIOD = 5

STOCHASTIC (for DVE):
  K_PERIOD = 14, D_PERIOD = 3, SMOOTH = 3
  BIAS_THRESHOLD = 15
  MIDLINE = 50
  RECENT_BARS = 10

DIRECTION_WEIGHTS:
  stochasticMomentum: max ±15 (kd_spread=4, k_slope=3, d_slope=3, midline_bonus=5)
  trendStructure: max ±20
  optionsFlow: max ±20
  volumeExpansion: max ±10
  dealerGamma: max ±15
  fundingRate: max ±10
  marketBreadth: max ±10

BREAKOUT_WEIGHTS:
  volCompression = 40
  timeAlignment = 30
  gammaWall = 20
  adxRising = 10

TRAP:
  CANDIDATE_SCORE = 60
  MIN_SCORE = 70
  COMPRESSION_WEIGHT = 40
  GAMMA_LOCK_WEIGHT = 30
  TIME_CLUSTER_WEIGHT = 30
  GAMMA_PROXIMITY_PCT = 1.5%

EXHAUSTION:
  BBWP_TRIGGER = 85
  STOCH_EXTREME_BULL = 80
  STOCH_EXTREME_BEAR = 20
  ADX_DECLINING_THRESHOLD = 35
  BBWP_DECEL_THRESHOLD = -0.5

SIGNAL_STRENGTH:
  BBWP_CROSS_WEIGHT = 30
  SMA5_CONFIRM_WEIGHT = 20
  STOCH_ALIGN_WEIGHT = 25
  DIRECTION_ALIGN_WEIGHT = 25

PROJECTION:
  FORWARD_BARS = 20
  MIN_SAMPLE_SIZE = 5
```

### Layer 1: Linear Volatility State

**1. computeBBWP** — Bollinger Band Width Percentile
```
For each bar i ≥ bbLen (13):
  basis = SMA(closes, 13)
  dev = stdDev(closes, 13)
  upper = basis + 2 × dev
  lower = basis - 2 × dev
  width = (upper - lower) / basis

For each width[i]:
  windowSize = min(i+1, 252)
  count = widths in window ≤ width[i]
  bbwp[i] = (count / windowSize) × 100
```

**2. computeVHMHistogram** — Rate of change + acceleration
```
roc[i] = bbwp[i] - bbwp[i-1]
smoothed = SMA(roc, 5)
sma5 = SMA(bbwp, 5)
acceleration = roc[last] - roc[last-1]

direction:
  smoothed > prevSmoothed + 0.01 → 'accelerating'
  smoothed < prevSmoothed - 0.01 → 'decelerating'
  else → 'flat'
```

**3. classifyVolRegime**
```
BBWP < 15  → compression, confidence = (15 - bbwp) / 15 × 100
BBWP ≥ 90  → climax, confidence = max(50, (bbwp - 90) / 10 × 100)
BBWP > 70  → expansion, confidence = (bbwp - 70) / 20 × 100
15 < BBWP < 40 AND accelerating → transition, confidence = 50
else → neutral, confidence = min(distFromLow, distFromHigh) × 100
```

### Layer 2: Directional Bias

**4. computeStochasticMomentum** (±15 max)
```
spread = K - D
K-D spread: spread > 0 → +4, < 0 → -4
K slope: > 0 → +3, < 0 → -3
D slope: > 0 → +3, < 0 → -3
Midline bonus: K > 50 AND spread > 0 → +5; K < 50 AND spread < 0 → -5
```

**5. computeDirectionalPressure** (total: -100 to +100)
| Component | Max | Logic |
|-----------|-----|-------|
| Stochastic Momentum | ±15 | K-D spread + slopes + midline |
| Trend Structure | ±20 | Price vs SMA20 ±5, vs SMA50 ±5, SMA20 vs SMA50 ±5, ADX confirms ±5 |
| Options Flow | ±20 | P/C ratio (<0.7→+8, >1.3→-8), unusual activity ±7, IV rank (<20→+5, >80→-5) |
| Volume Expansion | ±10 | volRatio continuous: 0.5x→0, 1x→3, 1.5x→6, 2x→10 |
| Dealer Gamma | ±15 | Short gamma amplifies trend ±15; Long gamma dampens ±5 |
| Funding Rate | ±10 | >0.03%→+10, <-0.03%→-10 |
| Market Breadth | ±10 | MPE >70→+10, <30→-10 |

**Bias threshold:** totalScore > 15 → bullish; < -15 → bearish; else neutral

### Layer 3: Phase Persistence

**6. computeZoneDurationStats** — Episode counting
- Scans bbwpSeries for stretches below threshold (contraction) or above (expansion)
- Tracks: currentBars, averageBars, medianBars, maxBars, agePercentile, episodeCount

**7. computePhasePersistence**

**Contraction continuation (base 40):**
```
+15 if SMA5 ≤ 15
+15 if currentBars < averageBars
+10 if stochKSlope ≤ 0
+10 if bias = neutral
+10 if rate flat or decelerating
```

**Contraction exit:**
```
+15 if currentBars ≥ averageBars
+10 if currentBars ≥ medianBars
+15 if agePercentile > 70%
+15 if rate accelerating
+15 if SMA5 above BBWP and rate positive
+15 if stochK rising + K > D cross
+15 if BBWP approaching 15 (within 2)
```

**Expansion continuation/exit:** Mirror logic at BBWP > 90 threshold.

### Layer 4: Signal Triggering

**8. detectSignal** — 4 signal types:

**COMPRESSION_RELEASE_UP:**
```
Recent bars had BBWP ≤ 15 (in last 10 bars)
AND BBWP now > 15
AND (BBWP > SMA5 OR rate accelerating)
AND stochastic momentum bullish
AND directional bias = bullish
```

**COMPRESSION_RELEASE_DOWN:** Same but bearish stoch + bearish bias.

**EXPANSION_CONTINUATION_UP:**
```
BBWP ≥ 90 AND SMA5 ≥ 90
AND stochastic momentum bullish
AND bias = bullish
AND exhaustion risk NOT HIGH/EXTREME
```

**EXPANSION_CONTINUATION_DOWN:** Same but bearish.

**Armed state:** BBWP within 3 of 15 threshold → 'armed'.

**9. computeSignalStrength** (0-100):
```
BBWP Cross (0-30): distance > 5 → 30, > 3 → 20, > 0 → 10
SMA5 Confirmation (0-20): SMA5 confirms threshold → 20, accelerating → 10
Stochastic Alignment (0-25): |stochMomentum| ≥ 15 → 25, ≥ 10 → 17, ≥ 5 → 8
Directional Alignment (0-25): (|dirScore| / 100) × 25
```

**10. computeInvalidation:**
- UP signals: price below trigger bar low (extreme mode) or open
- DOWN signals: price above trigger bar high (extreme mode) or open
- Phase re-entry below/above threshold
- BBWP SMA5 re-entry

### Layer 5: Outcome Projection

**11. computeSignalProjection** — Backtests historical signals:
- Finds all instances where BBWP crossed threshold in same direction
- Forward window: 20 bars
- Calculates: expectedMovePct, medianMovePct, maxHistoricalMovePct, averageBarsToMove, hitRate
- Min sample size: 5

### Supporting Functions

**12. computeBreakoutReadiness** (0-100):
```
Vol Compression (0-40): BBWP<15→40, <25→30, <35→20, +squeeze +10
Time Alignment (0-30): ≥4 TFs→30, ≥3→22, ≥2→15, hotZone +8
Gamma Wall (0-20): <1% from maxPain→20, <2%→15, unusual +5, short gamma +5
ADX Rising (0-10): ADX<20→10 (potential), 20-25→7, >30→3 (already trending)

Labels: EXTREME ≥80, HIGH ≥60, MODERATE ≥40, LOW <40
```

**13. detectVolatilityTrap** (score 0-100):
```
Compression (0-40): BBWP<10→40, <15→30, <20→20, strong squeeze +10
Gamma Lock (0-30): near key strikes +20, long gamma +10
Time Cluster (0-30): ≥3 TFs→30, hotZone→20, ≥2 TFs→10

detected: score ≥ 70
candidate: score ≥ 60 AND < 70
```

**14. computeExhaustion** (0-100):
```
BBWP > 85 → +30
BBWP > 95 → +20
StochK > 80 → +20 (or < 20 → +20)
ADX > 35 AND decelerating → +15
BBWP decelerating below -0.5 → +15

Labels: EXTREME ≥80, HIGH ≥60, MODERATE ≥40, LOW <40
```

**15. predictTransition:**
| From | Condition | To | Probability |
|------|-----------|-----|------------|
| compression | accelerating | transition | 50 + (15-bbwp)×2 |
| neutral | bbwp<25 + decel | compression | 40 |
| neutral | bbwp>60 + accel | expansion | 40 |
| expansion | accel + bbwp>85 | climax | 50 |
| expansion | decel | neutral | 40 |
| climax | decel | expansion | 60 |
| transition | accel + bbwp>30 | expansion | 50 |

### DVE Flags (Scanner Integration)
The scanner wraps DVE readings into these flags:
```
COMPRESSED       — regime = compression
EXPANDING        — regime = expansion
CLIMAX           — regime = climax
BREAKOUT         — compression_release signal fired
CONTINUATION     — expansion_continuation signal fired
SQUEEZE_FIRE     — inSqueeze = true
VOL_TRAP         — trap.detected = true
EXHAUSTION_RISK  — exhaustion.level > 70
DIR_BULL/DIR_BEAR — directional bias
EXTENDED_PHASE   — agePercentile > 80
HIGH_BREAKOUT    — breakout.score ≥ 60
MOMENTUM_ACCEL   — momentum acceleration detected
```

---

## 7. Setup Label Derivation

**File:** `app/api/scanner/run/route.ts` — function `deriveSetupLabel()`

Priority-ordered classification (first match wins):

| Priority | Setup Label | Conditions |
|----------|-----------|------------|
| 1 | Squeeze Breakout | DVE flags include SQUEEZE_FIRE + (BREAKOUT or HIGH_BREAKOUT) |
| 2 | Compression Breakout Imminent | BBWP < 15 |
| 3 | Volatility Compression | DVE flags include COMPRESSED |
| 4 | Expansion Continuation | DVE flags include CONTINUATION |
| 5 | Exhaustion Reversal | DVE flags include EXHAUSTION_RISK |
| 6 | Oversold Bounce | RSI < 30 + direction bullish |
| 7 | Overbought Rejection | RSI > 70 + direction bearish |
| 8 | Stochastic Cross (Bull) | K < 30 AND K > D |
| 9 | Stochastic Cross (Bear) | K > 70 AND K < D |
| 10 | Trend Continuation | ADX > 25 + EMA200 alignment |
| 11 | Pullback to Structure | Near EMA200 ±2% |
| 12 | Crowded Long Fade | Funding rate > 0.03 + direction bearish |
| 13 | Crowded Short Fade | Funding rate < -0.03 + direction bullish |
| 14 | Range Consolidation | MFI 40-60 + Aroon both < 50 |
| 15 | Mean Reversion | CCI < -100 or > 100 |
| 16 | Bullish Momentum | Direction bullish (default) |
| 17 | Bearish Momentum | Direction bearish (default) |
| 18 | Neutral / Watching | Fallback |

---

## 8. Trade Parameter Computation

**Universal across ALL engines:**
```
entry  = current price
stop   = LONG: price - 1.5 × ATR  |  SHORT: price + 1.5 × ATR
target = LONG: price + 3.0 × ATR  |  SHORT: price - 3.0 × ATR
R:R    = target / stop distance = 2.0 (always)

// Neutral direction (range):
stop   = price - 1.0 × ATR
target = price + 1.5 × ATR

// ATR fallback when unavailable:
equity: ATR = price × 0.02 (2% of price)
forex:  ATR = price × 0.002 (0.2% = ~20 pips)
crypto: ATR = price × 0.02 (2% of price)
```

---

## 9. Time Confluence Engines

### 9A. Equity Time Confluence

**File:** `lib/time/equityTimeConfluence.ts`

**Reference Epoch:** January 2, 2020 (first NYSE trading day)
**Anchor:** NYSE close @ 4:00 PM ET
**Excludes:** Weekends + NYSE holidays

**Cycles & Scores:**
| Label | Trading Days | Score |
|-------|-------------|-------|
| 1D | 1 | 0 |
| 2D | 2 | 0 |
| 4D | 4 | 1 |
| 8D | 8 | 1 |
| 11D | 11 | 1 |
| 22D | 22 | 3 |
| 1W | 5 | 2 |
| 2W | 10 | 1 |
| 3W | 15 | 1 |
| 4W | 20 | 2 |
| 6W | 30 | 3 |
| 12W | 60 | 4 |

**High Priority:** 4D, 22D, 1W, 4W, 6W, 12W
**Active Window:** Closing within 2 trading days
**Alert Threshold:** Score ≥ 6

**Levels:**
| Level | Score |
|-------|-------|
| Low | < 3 |
| Medium | 3-5 |
| High | 6-9 |
| Extreme | ≥ 10 |

### 9B. Crypto Time Confluence

**File:** `lib/time/cryptoTimeConfluence.ts`

**Anchor:** UTC midnight (00:00 UTC) = 11:00 AM Sydney

**Cycles & Scores:**
| Label | Calendar Days | Score |
|-------|-------------|-------|
| 1D | 1 | 0 |
| 2D | 2 | 0 |
| 3D | 3 | 1 |
| 5D | 5 | 1 |
| 6D | 6 | 0 |
| 9D | 9 | 1 |
| 10D | 10 | 1 |
| 15D | 15 | 2 |
| 18D | 18 | 1 |
| 30D | 30 | 3 |

**High Priority:** 3D, 5D, 10D, 15D, 18D, 30D
**Active Window:** 48 hours
**Alert Threshold:** Score ≥ 6
**Levels:** Same as equity (low/medium/high/extreme)

---

## 10. Confluence Learning Agent

**File:** `lib/confluence-learning-agent.ts`

### All Tracked Timeframes
```
Scalping: 5m, 10m, 15m
Intraday: 30m, 1h, 2h, 3h, 4h
Swing:    6h, 8h, 12h, 1D-30D
Macro:    1W-52W, 1M-12M
```

Each TF has: `{ tf, label, minutes, postCloseWindow, preCloseStart, preCloseEnd, decompStart }`

### Scan Modes & Minimum Confluence
| Mode | Min Active TFs |
|------|---------------|
| scalping (≤15m) | 2 |
| intraday_30m | 3 |
| intraday_1h | 3 |
| intraday_4h | 4 |
| swing_1d | 5 |
| swing_3d | 5 |
| swing_1w | 6 |
| macro_monthly | 6 |
| macro_yearly | 7 |

### Scoring Formula
```
finalConfidence = 0.55 × clusterScore + 0.45 × decompressionScore
```

**Cluster score:** Temporal clustering of TFs closing within ±5 min window
**Decompression score:** Pull analysis from prior candle HL2 midpoint, pull direction (up/down/none), pull strength (1-10)

**Direction:** Weighted by TF hierarchy (higher TFs have more weight)

**Signal strength gates:**
- activeTFs count must meet mode minimum
- hasHigherTF (≥1h) provides additional confirmation

**Candle close confluence:**
- closingNow: within 5 min of close
- closingSoon: 1-4h before close
- specialEvents: month/week/quarter/year end

---

## 11. Regime Classification

**File:** `lib/regime-classifier.ts`

Unified classifier producing 3 taxonomy outputs from one function:

### Input
```
adx, rsi, atrPercent, aroonUp, aroonDown, direction, ema200Above
```

### Classification Rules (priority order):

**1. Extreme Volatility (overrides trend):**
```
ATR% > 7 → VOL_EXPANSION / high_volatility_chaos
```

**2. Strong Trend:**
```
ADX ≥ 22 (trending) OR ADX ≥ 30 AND |aroonUp-aroonDown| > 40:
  If RSI > 70 (bull) or < 30 (bear) → TREND_MATURE
  Else → TREND_EXPANSION
```

**3. Range/Compression:**
```
ADX ≤ 18 OR |aroonUp-aroonDown| < 20:
  If ATR% < 1.5 → VOL_CONTRACTION / RANGE_COMPRESSION
  Else → RANGE_NEUTRAL
```

**4. Moderate Vol Expansion:**
```
ATR% > 4 → VOL_EXPANSION
```

**5. Transition (fallback):**
```
Mixed signals → TRANSITION / unknown, confidence capped at 55
```

### Output Taxonomies
| Governor | Scoring | Institutional |
|----------|---------|--------------|
| TREND_UP | TREND_EXPANSION | trending |
| TREND_DOWN | TREND_MATURE | trending |
| RANGE_NEUTRAL | RANGE_COMPRESSION | ranging |
| VOL_EXPANSION | VOL_EXPANSION | high_volatility_chaos |
| VOL_CONTRACTION | TRANSITION | unknown |
| RISK_OFF_STRESS | — | news_shock |

---

## 12. Regime Engine

**File:** `lib/regime-engine.ts`

Separate from classifier — maps market mode + gamma to regime:

### Vol State
```
ATR% ≥ 3.5 OR expansionProb ≥ 75 → EXTREME
ATR% ≥ 2.2 OR expansionProb ≥ 62 → HIGH
ATR% ≤ 0.9 AND expansionProb ≤ 40 → LOW
else → NORMAL
```

### Liquidity State
```
dataHealthScore < 55 → THIN
marketMode = chop → NORMAL
else → RICH
```

### Market Regime
```
launch + EXTREME vol → VOL_EXPANSION
launch + other → TREND_DAY
pin → MEAN_REVERT_DAY
chop + LOW vol → VOL_COMPRESSION
chop + THIN liquidity → LIQUIDITY_VACUUM
chop + else → MEAN_REVERT_DAY
```

### Risk Mode
```
gamma = Negative OR vol = EXTREME → risk_off
else → risk_on
```

---

## 13. Institutional Filter

Applied after scoring to tag/block low-quality environments.

**Inputs:** baseScore, strategy, regime, liquidity session, volatility (ATR%, state), dataHealth freshness, riskEnvironment (traderRiskDNA, stressLevel)

**Volatility States:**
```
ATR% > 7 → extreme
ATR% > 4 → expanded
ATR% < 1 → compressed
else → normal
```

**No-trade triggers (tagged, not removed from results):**
- noTrade flag set based on filter composite
- Results sorted: trade-ready first, then by rankScore

---

## 14. Squeeze & Momentum Detection

**File:** `lib/indicators.ts`

### Squeeze Detection (BB inside KC)
```
Bollinger Bands: SMA(20) ± 2σ
Keltner Channel: EMA(20) ± 1.5 × ATR(20)

inSqueeze = BB_lower > KC_lower AND BB_upper < KC_upper

squeezeStrength = (1 - BB_width / KC_width) × 100
// 0 = loose, 100 = extremely tight
```

### Momentum Acceleration
```
Lookback: 5 bars, minimum 35 bars total

Components (each 0-25, total 0-100):
1. RSI Slope: |rsiNow - rsiPrev| × 2.5
2. MACD Expanding: |histNow| > |histPrev| AND same sign → +10 base + magnitude
3. Volume Surge: (lastVol / avgVol20 - 1) × 25
4. Price/ATR Move: |priceMove / ATR| × 12.5

accelerating = score ≥ 40
direction:
  rsiSlope > 3 AND priceMove > 0 → bullish
  rsiSlope < -3 AND priceMove < 0 → bearish
  priceAtrMove > 0.5 → bullish
  priceAtrMove < -0.5 → bearish
  else → neutral
```

### Golden Egg Squeeze (Simpler)
```
BB width = (upper - lower) / middle × 100
inSqueeze = bbWidth < 6%
squeezeStrength = (6 - bbWidth) / 6
```

---

## 15. Capital Flow Engine

**File:** `lib/capitalFlowEngine.ts`

Multi-system orchestrator that computes:
- Market mode (pin/launch/chop)
- Gamma state (Positive/Negative/Mixed)
- Flow bias (bullish/bearish/neutral)
- Conviction (0-100)
- Probability matrix (continuation/pinReversion/expansion)
- Flow trade permission
- Institutional risk governor
- Brain decision (final composite)

**Conviction Factors:**
```
mode, flow, liquidity, regime, data, alignmentMultiplier, timeModifier, locationModifier
```

**Probability Matrix:**
```
continuation, pinReversion, expansion
regime: TRENDING | PINNING | EXPANDING | MIXED
acceleration: rising | falling | flat
decision: allow_trend_setups | avoid_breakouts | prep_breakout_strategies
```

---

## 16. Soft Personalization

**Applied after institutional filter, max ±10% boost.**

**Dimensions:**
```
Asset class match: +3
Side match (long/short): +3
Regime match: +2
Strategy match: +2

Max boost = max(1, round(score × 0.1))
```

Only applied when `softHints.hasEnoughData = true`.

---

## 17. Local Indicator Implementations

**File:** `lib/indicators.ts` + inline in scanner routes

All indicators use standard TA formulas:

- **EMA:** `EMA = price × k + EMA_prev × (1-k)` where `k = 2/(period+1)`, seeded with SMA
- **RSI:** Wilder's smoothing: `avgGain = (avgGain × (period-1) + currentGain) / period`
- **MACD:** EMA(fast) - EMA(slow), signal = EMA of MACD line
- **ATR:** Wilder's smoothing of True Range
- **ADX:** Wilder's smoothing of DX (from +DM/-DM), +DI/-DI exported
- **Stochastic:** `%K = (close - lowestLow) / (highestHigh - lowestLow) × 100`, `%D = SMA(%K, 3)`
- **CCI:** `(TP - SMA(TP)) / (0.015 × meanDeviation)`
- **BB:** `SMA(20) ± 2 × stddev`
- **OBV:** Cumulative volume (add on up, subtract on down)
- **MFI:** Volume-weighted RSI: `100 - 100/(1 + posFlow/negFlow)`
- **VWAP:** Cumulative `Σ(TP × volume) / Σ(volume)`
- **Aroon:** Up = ((period - bars since highest high) / period) × 100
- **Williams %R:** ((HH - close) / (HH - LL)) × -100
- **NATR:** ATR / close × 100
- **Chaikin A/D:** Cumulative `CLV × volume` where `CLV = ((close-low)-(high-close))/(high-low)`
- **ROC:** ((current - nAgo) / nAgo) × 100
- **BOP:** (close - open) / (high - low)

---

## Summary: What to Implement in Pine Script

### Core Indicators (standard — use built-in Pine functions)
RSI(14), MACD(12,26,9), EMA(200), ATR(14), ADX(14) with DI±, Stochastic(14,3,3), CCI(20), Aroon(25), OBV, MFI(14), VWAP, BB(20,2)

### Custom Systems (must implement from scratch)
1. **BBWP** — BB width percentile over 252-bar lookback, BB length 13
2. **VHM Histogram** — Rate of BBWP change, smoothed period 5
3. **DVE 5-Layer Engine** — Volatility state → directional bias → phase persistence → signal triggering → outcome projection
4. **5-Layer Scanner Score** — ADX-multiplied trend (45%) + volume (20%) + oscillators (25%) + DVE volatility (±10%) + derivatives (±8%)
5. **Golden Egg 4-Pillar** — Structure(30%) + Flow(25%) + Momentum(20%) + Risk(25%)
6. **Time Confluence** — Fixed cycle lengths with weighted scores, active windows
7. **Squeeze Detection** — BB inside Keltner (EMA20 ± 1.5×ATR)
8. **Momentum Acceleration** — RSI slope + MACD expansion + volume surge + price/ATR

### Critical Thresholds Reference
```
ADX: 18 (ranging), 22 (trending), 25 (strong), 30 (very strong), 40 (extreme)
RSI: 30 (oversold), 45 (weak), 55 (healthy bull), 70 (overbought)
BBWP: 15 (compression), 70 (expansion start), 90 (climax)
ATR%: 1.5 (compressed), 4 (expanded), 5 (high), 7 (extreme), 8 (extreme daily range)
BB Width: 6% (squeeze in Golden Egg), KC method in indicators.ts
Aroon Osc: 20 (mild), 40 (threshold), 50 (strong), 70 (confirmed)
CCI: 100 (strong), 200 (extreme)
Stoch: 20 (oversold), 50 (midline), 80 (overbought)
Direction hysteresis: 1.15x (scanner), 1.3x (universe), 1.15x (bulk)
```
