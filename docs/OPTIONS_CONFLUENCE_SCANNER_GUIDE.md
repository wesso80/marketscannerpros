# Options Confluence Scanner — Comprehensive Educational Guide

> **Tier:** Pro Trader only (`canAccessOptionsConfluence(tier)` requires `pro_trader`)  
> **Route:** `/tools/options-confluence` (redirects to `/tools/terminal` via Next.js rewrite; also embedded as a tab in the Terminal page)  
> **Subtitle:** *"Get intelligent strike & expiration analysis based on Time Confluence data. Uses 50% levels, decompression timing, and Greeks-aware risk assessment."*  
> **Data Sources:** Nasdaq BX + Alpha Vantage FMV Options (LIVE) • REALTIME_OPTIONS_FMV primary, HISTORICAL_OPTIONS fallback • Redis-cached  
> **Scoring Engine:** MSP Universal Scoring v2.1 (`lib/scoring/options-v21.ts`)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Terminal Shell (Page Wrapper)](#2-terminal-shell-page-wrapper)
3. [Command Strip](#3-command-strip)
4. [Decision Cockpit (Three Info Cards)](#4-decision-cockpit-three-info-cards)
5. [Signal Rail](#5-signal-rail)
6. [AI Co-Pilot Bar](#6-ai-co-pilot-bar)
7. [Operator Panel — View Mode Toggle](#7-operator-panel--view-mode-toggle)
8. [Operator Proposal Rail](#8-operator-proposal-rail)
9. [Symbol Input & Scan Controls](#9-symbol-input--scan-controls)
10. [Decision Engine Banner](#10-decision-engine-banner)
11. [Dealer Positioning Strip](#11-dealer-positioning-strip)
12. [Decision Core — Three-Card Hero Panel](#12-decision-core--three-card-hero-panel)
13. [Analysis Brief](#13-analysis-brief)
14. [Tradeability State](#14-tradeability-state)
15. [Decompression Stack — Multi-TF 50% Magnet Levels](#15-decompression-stack--multi-tf-50-magnet-levels)
16. [Trap Door Section Navigation](#16-trap-door-section-navigation)
17. [Section 1 — Evidence](#17-section-1--evidence)
    - [AI Trade Command Card](#ai-trade-command-card)
    - [Signal Stack (5 Scored Components)](#signal-stack-5-scored-components)
    - [Analysis Panel (Execution Zone)](#analysis-panel-execution-zone)
    - [Co-Pilot Observations](#co-pilot-observations)
    - [MSP Signature Confluence Radar (Pentagon Chart)](#msp-signature-confluence-radar-pentagon-chart)
    - [Institutional Lens State](#institutional-lens-state)
    - [Institutional Intent Engine](#institutional-intent-engine)
    - [Dealer Positioning Engine](#dealer-positioning-engine)
    - [Liquidity & Level Map](#liquidity--level-map)
    - [Cross-Asset Flow Intelligence](#cross-asset-flow-intelligence)
    - [Market Playbook Engine (Bull/Base/Bear Scenarios)](#market-playbook-engine-bullbasebear-scenarios)
    - [MSP AI Setup (Master Setup Panel)](#msp-ai-setup-master-setup-panel)
    - [Decision Ladder](#decision-ladder)
    - [Heat Signals](#heat-signals)
    - [Pattern Formation](#pattern-formation)
    - [Candle Close Confluence](#candle-close-confluence)
18. [Section 2 — Contracts & Greeks](#18-section-2--contracts--greeks)
    - [Highest Confluence Strike](#highest-confluence-strike)
    - [Expiration Analysis](#expiration-analysis)
    - [Open Interest Analysis](#open-interest-analysis)
    - [Greeks & Risk Advice](#greeks--risk-advice)
    - [Risk Management](#risk-management)
    - [Analysis Summary](#analysis-summary)
19. [Section 3 — Analyst Narrative (Advanced)](#19-section-3--analyst-narrative-advanced)
20. [Section 4 — Execution Diagnostics (Advanced)](#20-section-4--execution-diagnostics-advanced)
21. [Scoring Engine Deep Dive (options-v21.ts)](#21-scoring-engine-deep-dive-options-v21ts)
22. [Adaptive Personality Matching](#22-adaptive-personality-matching)
23. [Terminal Modes (Adaptive Layout)](#23-terminal-modes-adaptive-layout)
24. [Color Codes Reference](#24-color-codes-reference)
25. [Threshold & Score Reference](#25-threshold--score-reference)

---

## 1. Architecture Overview

The Options Confluence Scanner is the flagship **options decision engine** in the MSP Terminal. It combines:

- **Time Confluence System** — Multi-timeframe 50% decompression levels that identify where candles gravitate
- **Real-time Options Chain** — Live from Alpha Vantage's REALTIME_OPTIONS_FMV endpoint (Nasdaq BX feed, 600 RPM plan)
- **MSP Universal Scoring v2.1** — Three-layer scoring (Context / Setup / Execution) with permission gating
- **Dealer Gamma/Vanna/DEX Engine** — Net GEX, gamma flip, call/put wall, pin zone analysis
- **Institutional Intent Engine** — 8-state classifier (ACCUMULATION, DISTRIBUTION, TRAP_UP, etc.)
- **Capital Flow Engine** — Market mode (PIN/LAUNCH/CHOP), gamma state, bias, key strike gravity map
- **Cross-Asset Correlation Regime** — SPY/VIX/DXY/Gold regime detection (RISK_ON, RISK_OFF, DIVERGENT, DECORRELATED, STRESS)
- **Adaptive Trader Personality** — Matches setups to your journal history to personalize confluence scoring
- **AI Co-Pilot** — Real-time attention state, watching focus, notices, and suggestions derived from scan data
- **Probability Engine** — Institutional-grade win probability calculation combining all signal layers

**API Route:** `POST /api/options-scan`  
**Analyzer:** `lib/options-confluence-analyzer.ts` (4,570+ lines, the `OptionsConfluenceAnalyzer` class)  
**Scoring:** `lib/scoring/options-v21.ts` (550 lines)  
**Page Component:** `app/tools/options-confluence/page.tsx` (4,725 lines)

---

## 2. Terminal Shell (Page Wrapper)

The entire page is wrapped in `<TerminalShell>`:

- **Title:** "Options Confluence Scanner" with icon (`/assets/scanners/options-confluence.png`)
- **Subtitle:** "Get intelligent strike & expiration analysis based on Time Confluence data. Uses 50% levels, decompression timing, and Greeks-aware risk assessment."
- **Background:** `var(--msp-bg)` (dark theme `#0F172A`)
- **ComplianceDisclaimer** — compact disclaimer shown at top of every scan

---

## 3. Command Strip

Appears **after a scan completes**. A persistent top bar showing at-a-glance status:

| Field | Source | Example |
|-------|--------|---------|
| **Symbol** | `result.symbol` | `AAPL` |
| **Status** | `commandStatus` — ACTIVE / WAIT / NO TRADE | `ACTIVE` (green), `WAIT` (amber), `NO TRADE` (red) |
| **Confidence** | `unifiedConfidence` (1-99%) | `72%` |
| **Data Health** | freshness field + checkmark | `REALTIME ✔` |
| **Mode** | `adaptiveModeMeta.label` | `TREND ACCELERATION` |
| **Density Toggle** | normal / compact / dense | User preference |
| **Focus Button** | Toggles focus mode on/off | Collapses non-critical sections |

**commandStatus logic:**
- `ACTIVE`: `result.tradeLevels` exists AND `compositeScore.confidence >= 60`
- `WAIT`: Has data but not meeting active threshold
- `NO TRADE`: `entryTiming.urgency === 'no_trade'`

---

## 4. Decision Cockpit (Three Info Cards)

A 3-column grid of `SectionCard` components:

### Card 1 — "Context: Bias & Regime" (Left)
- **Symbol + Thesis Direction**: e.g., `AAPL • BULLISH`
- **Regime**: `institutionalMarketRegime` — e.g., `BULLISH TREND`, `RANGE / ROTATION`, `BREAKOUT REGIME`, `REVERSAL REGIME`, `UNCERTAIN REGIME`
- **Session**: `entryTiming.marketSession` — `REGULAR`, `PREMARKET`, `AFTERHOURS`, `CLOSED`

### Card 2 — "Analysis: Setup Status" (Center)
- **Pill**: `ALIGNED` (green) / `NOT ALIGNED` (red) / `WAIT` (amber) — maps from `unifiedPermission`
- **Pipeline**: `{pipelineComplete}/{ladderSteps.length}` — e.g., `4/5`
- **Confluence**: `unifiedConfidence` percentage

### Card 3 — "Levels: Risk & Trigger" (Right)
- **Trigger**: `decisionTrigger` — e.g., `Price > 182.55` or `Await cleaner trigger + liquidity confirmation`
- **Risk**: Based on `expectedMove.selectedExpiryPercent`:
  - `≥ 4%` → `HIGH`
  - `≥ 2%` → `MODERATE`
  - `< 2%` → `LOW`
- **Data**: `dataHealth` — `REALTIME`, `DELAYED`, `EOD`, `STALE`, `CACHED`, `LIVE`

---

## 5. Signal Rail

A horizontal row of 6 color-coded badge cards:

| Label | Value | Tone Logic |
|-------|-------|-----------|
| **Confluence** | `{confluenceStack} TF` | `bull` if ≥3, else `warn` |
| **Flow** | OI sentiment (BULLISH/BEARISH/NEUTRAL) | `bull`/`bear`/`neutral` |
| **Expected Move** | `{pct}%` | `bear` if ≥4%, `warn` if ≥2%, else `bull` |
| **Conditions** | ALIGNED / NOT ALIGNED / WAIT | `bull`/`bear`/`warn` |
| **Mode** | Terminal mode label | `accent` always |
| **Updated** | `{seconds}s` since last update | `neutral` |

**Tone colors:**
- `bull` → green (`--msp-bull`), green tint background
- `bear` → red (`--msp-bear`), red tint background
- `warn` → amber (`--msp-warn`), amber tint background
- `accent` → teal/green (`--msp-accent`), panel background
- `neutral` → default text, panel-2 background

---

## 6. AI Co-Pilot Bar

A single-line panel showing the AI's current attention state:

- **Label:** `AI Co-Pilot`
- **Market State:** e.g., `TREND ACCELERATION`
- **Confluence:** Co-Pilot derived intensity percentage
- **Watching:** e.g., `FLOW + STRUCTURE`
- **Status Line:** Derived from `copilotDerived.statusLine` + first note
- **Source:** `deriveCopilotPresence()` from `lib/copilot/derive-copilot-presence.ts`

**Attention States:** `RISK`, `ACTIVE`, `WATCHING`, `IDLE`

---

## 7. Operator Panel — View Mode Toggle

Toggle between two view modes:

- **Guided Mode** — Keeps advanced sections collapsed for faster decision flow. Only shows Section 1 (Evidence) and Section 2 (Contracts & Greeks). Narrative and Diagnostics are hidden.
- **Advanced Mode** — All four trap-door sections available. Full analyst interpretation.

Persisted to localStorage as `msp_options_operator_mode_v1`.

---

## 8. Operator Proposal Rail

From `OperatorProposalRail` component:
- **Source:** `options_confluence_page`
- Shows up to 6 proposals (3 visible by default)
- Compact mode
- Tied to current symbol, timeframe, and asset class

---

## 9. Symbol Input & Scan Controls

### Input Fields:
1. **Symbol Input** — Text field, placeholder: `SPY, AAPL, QQQ, TSLA...`, auto-uppercased
2. **Scan Timeframe Selector** — Dropdown with 9 options:

| Value | Label | Description |
|-------|-------|-------------|
| `scalping` | ⚡ Scalping (5-15m) | 0-2 DTE |
| `intraday_30m` | 📊 30 Minute | 1-3 DTE |
| `intraday_1h` | 📊 1 Hour | 2-5 DTE |
| `intraday_4h` | 📊 4 Hour | 3-7 DTE |
| `swing_1d` | 📅 Daily | 5-14 DTE |
| `swing_3d` | 📅 3-Day | 1-3 weeks |
| `swing_1w` | 📅 Weekly | 2-4 weeks |
| `macro_monthly` | 🏛️ Monthly | 30-60 DTE |
| `macro_yearly` | 🏛️ LEAPS | 60+ DTE |

3. **Expiration Date Selector** — Populated via `GET /api/options/expirations?symbol=X`. Shows date + total OI. Default: `📅 Auto-select expiry`
4. **Scan Button** — `🎯 Scan Options Confluence` / `🔄 Scanning Options Confluence...`
5. **Refresh Button** — `🔄 Refresh` (appears after first scan)

### Expiration debounce: 250ms after symbol change

---

## 10. Decision Engine Banner

A compact bar across the top of results:
- Left: `Decision Engine` label
- Right: `Decision First • Evidence Second • Deep Analysis On Demand`

---

## 11. Dealer Positioning Strip

A compact single-line strip below the Decision Engine banner:

- **Dealer:** regime name with color coding:
  - `SHORT_GAMMA` → red text → `EXPANSION (Short Gamma)`
  - `LONG_GAMMA` → green text → `COMPRESSION (Long Gamma)`
  - `NEUTRAL` → slate text → `NEUTRAL`
- **Flip:** gamma flip price, e.g., `Flip 182.45`

---

## 12. Decision Core — Three-Card Hero Panel

A 3-column `DepthCard` grid with subtle 3D tilt effects:

### Card 1 — "Decision Core" (2fr width)
- **One-liner:** from `tradeSnapshot.oneLine` or generated from thesis direction + command status
- **Badges:**
  - `Grade {tradeQuality}` — A+/A/B/C/F
  - `{commandStatus}` — color-coded (ACTIVE green, WAIT amber, NO TRADE red)
  - `Trigger: {decisionTrigger}`
- **Why items:** First 2 from `tradeSnapshot.why` or generated primary reasons

### Card 2 — "Risk + Analysis" (1.2fr width)
- Highlighted with accent border-left, glow ring on ACTIVE+ALLOWED
- **Zone:** Entry zone `low - high` or `N/A`
- **Invalidation:** Stop loss level (red text)
- **Key Levels:** Target1 / Target2 (green text)
- **Expected Move:** Percentage
- **Invalidation Reason:** From `tradeSnapshot.risk.invalidationReason`

### Card 3 — "Options Snapshot" (1.2fr width)
- **P/C:** Put/Call ratio
- **IV Rank:** Percentage
- **Strategy:** Recommended strategy name (uppercased)
- **Contract:** Primary strike + type, e.g., `185C`
- **Theta:** Primary expiration theta risk (LOW/MODERATE/HIGH)

---

## 13. Analysis Brief

A single-line summary below the hero cards:
- `{tradeSnapshot.oneLine}` or `{symbol} {DIRECTION} setup with {confidence}% confluence — {commandStatus}.`

---

## 14. Tradeability State

A color-coded banner:

| State | Condition | Display | Color |
|-------|-----------|---------|-------|
| `EXECUTABLE` | commandStatus=ACTIVE AND tradePermission=ALLOWED | 🟢 CONDITIONS MET | Green border/bg |
| `CONDITIONAL` | Not meeting both conditions | 🟡 CONDITIONAL | Amber border/bg |
| `AVOID` | commandStatus=NO TRADE OR tradePermission=BLOCKED | 🔴 AVOID | Red border/bg |

---

## 15. Decompression Stack — Multi-TF 50% Magnet Levels

Only shown when `decompressionStack.stackScore > 0`. Purple-themed panel.

### Header:
- 🎯 **Decompression Stack** label
- **Stack Score** badge — color by rating:
  - `extreme` → red bg, red text
  - `high` → amber bg, amber text
  - `moderate` → violet bg, violet text
  - `low` / `none` → slate bg, slate text
- **Net Pull Direction:** ▲ BULL / ▼ BEAR / — NEUTRAL with bias number

### Active Windows:
- TF badges (e.g., `1H`, `4H`, `1D`) with individual scores
- Tagged TFs get a `✓tag` marker
- Untagged/tagged count summary

### AOI (Area of Interest) Clusters:
Up to 3 clusters displayed:
- **Price level** with $ prefix
- **Pull direction** arrow (▲ green / ▼ red / — slate)
- **Contributing TFs** listed
- **Quality score** (Q prefix)
- Primary cluster gets a violet border highlight

### Reasoning line at bottom in small slate text

---

## 16. Trap Door Section Navigation

Four collapsible sections controlled by toggle buttons:

| Key | Label | Count Badge |
|-----|-------|-------------|
| `evidence` | 1) Evidence | `{confluenceStack} TF` |
| `contracts` | 2) Contracts & Greeks | `Ready` or `N/A` |
| `narrative` | 3) Analyst Narrative (Advanced) | `{notes count} notes` |
| `logs` | 4) Analysis Diagnostics (Advanced) | Count of disclaimer flags + confidence caps |

**In Guided mode:** Only sections 1 and 2 are shown. Sections 3 and 4 are hidden with a prompt to switch to Advanced mode.

Each collapsed section shows as a dashed-border card with title + subtitle + "Click to expand". Clicking any section button smoothly scrolls to and expands it.

---

## 17. Section 1 — Evidence

### AI Trade Command Card

A prominent card with mode-specific accent border-left color:

| Terminal Mode | Accent Color | Reason |
|--------------|-------------|--------|
| TREND ACCELERATION | Emerald (green) | Directional structure + confluence alignment dominate |
| CHOP / RANGE | Amber | Low directional edge; prioritize boundaries and risk control |
| VOLATILITY EXPANSION | Red | IV/expected-move expansion detected; risk and flow prioritized |
| REGIME TRANSITION | Sky blue | Momentum/flow shift underway; confirmation sequencing in focus |

**Fields:**
- **Conviction:** `{terminalDecisionCard.conviction}%`
- **Terminal Mode:** Label + reason text
- **Direction:** BULLISH / BEARISH / NEUTRAL
- **Primary Setup:** Strategy name (e.g., `Long Call Spread`)
- **Expected Move:** `±{pct}%`
- **Invalidation:** Stop loss level or reason (red text)
- **Key Trigger:** e.g., `Price > 182.55`

In TRANSITION_MODE, additional timeline shown:
> SIGNAL TIMELINE: Flow shift → Momentum confirmation → Trigger validation

---

### Signal Stack (5 Scored Components)

Vertical list of 5 signal layers, each with a progress bar:

| Signal | Score Calculation | State Display |
|--------|-------------------|---------------|
| **Trend Structure** | `(confidence × 0.6) + (abs(directionScore) × 0.4)` | `{trendStrength}` • `{direction} bias • {confidence}% confluence` |
| **Momentum** | strong=84 / moderate=66 / weak=48 / none=30 | `{signalStrength}` • `{confluenceStack} TFs aligned • {urgency}` |
| **Options Flow** | high=86 / moderate=68 / unusual=52 / none=34 | `{smartMoneyDirection}` • `PCR {pcRatio} • {alertLevel} alert` |
| **Volatility Regime** | `(movePct × 11) + (abs(ivRank-50) × 0.8) + 24` | `IV {ivRank}%` • `Expected ±{movePct}%` |
| **Sentiment** | `capitalFlow.conviction` or 52 default | `{capitalFlow.bias}` • `{capitalFlow.market_mode} • {recommendation}` |

Each component shows:
- Label + `★ AI Watching` badge if Co-Pilot is watching that specific signal
- Score percentage (0-100%)
- Progress bar (accent color fill)
- State + Summary line

---

### Analysis Panel (Execution Zone)

Right column showing current execution status:

- **Reference Zone:** Entry zone `low - high` or `Await setup`
- **Invalidation Level:** Stop loss or reason (red)
- **Key Level / R:R:** Target1 price + risk-reward ratio
- **Status:** ALIGNED (green) / NOT ALIGNED (red) / WAIT (amber)
- **Co-Pilot Observation:** Suggestion action + reason text

---

### Co-Pilot Observations

Up to 3 notice cards, each color-coded by level:
- `warn` → red border/bg → ⚠️ icon
- `action` → green border/bg → ✅ icon
- `info` → slate border/bg → ⚡ icon

Each shows: `Co-Pilot Note • {title}` + message text

---

### MSP Signature Confluence Radar (Pentagon Chart)

A 5-axis radar/pentagon visualization:

| Axis | Calculation |
|------|-------------|
| **TREND** | `(confidence × 0.65) + (abs(directionScore) × 0.35)` |
| **FLOW** | Base: high=82, moderate=68, unusual=54, none=36; +12 if direction-aligned, -10 if not |
| **MOMENTUM** | strong=84, moderate=66, weak=48, none=30; +min(14, confluenceStack × 2) |
| **VOLATILITY** | `(movePct × 11) + (abs(ivRank-50) × 0.9) + 26` |
| **SENTIMENT** | OI sentiment bullish/bearish=62, neutral=44; + min(28, conviction × 0.28) or +8 |

**Composite Score:** Average of all 5 axes

Visual: SVG pentagon with 5 concentric rings (20/40/60/80/100), axis lines, filled data polygon (accent color), and per-axis value cards.

Also shows:
- Current price badge
- Expected Move badge (EM ±X%) — red text in HIGH_VOL_EVENT_MODE
- Composite percentage (accent color, large font)

---

### Institutional Lens State

A mode-specific card showing the scanner's current operating lens:

| Mode | Condition | Color | Meaning |
|------|-----------|-------|---------|
| `OBSERVE` | Low confidence or chaotic regime | Accent/Red | Market reading mode: structure, flow, and regime first |
| `WATCH` | Medium confidence, setup identified | Amber | Setup identified but not permitted. Focus on confirmation triggers |
| `ARMED` | High confidence + flow aligned + risk governor allows | Emerald | Institutional alignment confirmed |
| `EXECUTE` | Extreme confidence OR active trade for symbol | Orange | High confluence focus mode active |
| `ACTIVE_FOCUS` | EXECUTE mode but no active trade | Orange | Primary analysis data prioritized |

**Sub-fields in grid:**
- **MRI Regime:** `TREND_EXPANSION` / `ROTATIONAL_RANGE` / `VOLATILITY_EXPANSION` / `CHAOTIC_NEWS`
- **MRI Confluence:** Percentage
- **Adaptive Confluence:** Score + band (LOW / MEDIUM / HIGH / EXTREME)
- **Risk Modifier:** 1.1 (trend), 0.95 (range), 0.75 (vol expansion), 0 (chaotic)

**Adaptive Confidence Bands:**
- `< 40` → LOW
- `40-64` → MEDIUM
- `65-79` → HIGH
- `≥ 80` → EXTREME

---

### Institutional Intent Engine

Shows the 8-state classifier output:

**Intent States:** `ACCUMULATION`, `DISTRIBUTION`, `LIQUIDITY_HUNT_UP`, `LIQUIDITY_HUNT_DOWN`, `TRAP_UP`, `TRAP_DOWN`, `REPRICE_TREND`, `UNKNOWN`

**Fields:**
- **Primary Intent:** State name (accent color, or red if UNKNOWN)
- **Confluence:** Percentage with progress bar
- **Expected Path:** `↔ CHOP` / `↩ MEAN REVERT` / `↗ EXPAND` / `🚀 EXPANSION CONTINUATION`
- **Directional Bias:** `LONG` (green) / `SHORT` (red) / `NONE` (amber)
- **Notes:** Up to 3 institutional notes
- **Expandable:** "Show intent probabilities" — all 8 states with percentages sorted by probability

If `UNKNOWN` + `DATA_INSUFFICIENT`: Shows `🚫 Intent unavailable — DATA_INSUFFICIENT`

**Features used:** SBQ (Smart Bid Quote), SRS (Supply Range Strength), CES (Cumulative Edge Score), OPS (Options Positioning Score), PWP (Price-Weighted Probability), RC (Regime Consistency)

---

### Dealer Positioning Engine

The most detailed gamma analysis panel:

**Header:** Regime badge —
- `🔴 SHORT GAMMA` (red)
- `🟢 LONG GAMMA` (green)
- `🟡 NEUTRAL` (amber)

**Core Metrics Grid (6 cells):**

| Metric | Color Logic |
|--------|------------|
| **Net GEX** | Green if ≥0, red if <0 | Compact USD (e.g., $2.5M) |
| **Net DEX (Vanna)** | Green if ≥0, red if <0 |
| **Gamma Flip** | Slate text, price |
| **Flip Distance** | Amber if <1%, else slate | Percentage |
| **Call Wall** | Green text | Price from `dealerStructure.callWall` |
| **Put Wall** | Red text | Price from `dealerStructure.putWall` |

**Vanna Flow Direction:**
- Positive Vanna → `📈 Positive Vanna — IV decline lifts delta, dealers buy underlying`
- Negative Vanna → `📉 Negative Vanna — IV rise pushes delta down, dealers sell underlying`
- Flat → `➡️ Flat Vanna — Minimal directional delta/vanna pressure`

**Charm Decay Pressure:**
- Call-heavy → `⏳ Call-heavy — Charm decay adds upward delta pressure into expiry`
- Put-heavy → `⏳ Put-heavy — Charm decay adds downward delta pressure into expiry`
- Balanced → `⏳ Balanced — Charm decay neutral across strikes`

**Dealer Pressure Summary:** Color-coded summary box:
- SHORT_GAMMA (red border/bg): `⚡ Dealers are short gamma — expect AMPLIFIED moves. Pin zone: {X}. Volatility state: {X}. {attention trigger}`
- LONG_GAMMA (green border/bg): `🛡️ Dealers are long gamma — expect DAMPENED moves toward pin. Pin zone: {X}. Volatility state: {X}. Price likely gravitates to gamma flip.`
- NEUTRAL (amber border/bg): `⚖️ Neutral gamma environment — low dealer hedging pressure. Watch for regime shift near ${flip}.`

**Top GEX Nodes:** Up to 5 strike badges showing the highest absolute GEX values

---

### Liquidity & Level Map

Combined map from 3 data sources:

**Header:** `{count} Levels Mapped` — sum of all level types

**Sub-sections:**

1. **Liquidity Magnet Levels** (from Capital Flow)
   - Up to 6 levels with price, label, probability bar (cyan), percentage

2. **Open Interest Walls** (from Institutional Intent)
   - Up to 5 walls — CALL (green), PUT (red), MIXED (amber)
   - Strike price + strength bar + percentage

3. **Strike Gravity Map** (from Capital Flow key_strikes)
   - Up to 6 badges: `$strike • type • G:{gravity}`
   - call-heavy (green), put-heavy (red), mixed (slate)

4. **Gamma Flip Zones** (from Capital Flow)
   - `$level — ↑ Bullish Above` (green) or `$level — ↓ Bearish Below` (red)

5. **Structural Key Zones** (from Location Context)
   - Up to 5 zones: type (demand/supply/support/resistance/liquidity), level, strength (strong/moderate/weak)
   - demand/support → green, supply/resistance → red, liquidity → cyan

6. **Institutional Liquidity Pools**
   - From `institutionalIntent.key_levels.liquidity_pools`
   - 🏊 icon badges in cyan

7. **Most Likely Price Path**
   - Numbered steps (1-4) from `capitalFlow.most_likely_path`

8. **Risk Notes**
   - ⚠ warnings from `capitalFlow.risk` in red

---

### Cross-Asset Flow Intelligence

**Header:** Regime badge with color:
- `RISK_ON` → 🟢 green
- `RISK_OFF` → 🔴 red
- `STRESS` → 🚨 red-500
- `DIVERGENT` → 🟡 amber
- `DECORRELATED` → ⚪ slate

**Core Metrics Grid (6 cells):**

| Metric | Color Logic |
|--------|------------|
| **VIX Regime** | LOW=green, NORMAL=slate, ELEVATED=amber, EXTREME=red | Actual level in parentheses |
| **DXY Trend** | Strengthening=💪amber, Weakening=📉green, Neutral=➡️slate |
| **Risk Score** | ≤30=green, ≤60=amber, >60=red | `/100` |
| **Size Multiplier** | ≥1=green, <1=amber | `{x}x` |
| **Sector Rotation** | `GROWTH_LEADING` / `VALUE_LEADING` / `DEFENSIVE` / `MIXED` |
| **Gold Safe Haven** | `🟡 ACTIVE` or `⚪ Inactive` |

**Asset Momentum Bars:**
- SPY Momentum — horizontal fill bar with percentage
- BTC Momentum — horizontal fill bar with percentage
- Green fill for positive, red fill for negative

**Cross-Asset Analysis:** Accent-bordered recommendation text

**Warnings:** Amber ⚠ items

---

### Market Playbook Engine (Bull/Base/Bear Scenarios)

Three scenario cards in a 3-column grid:

| Scenario | Border Color | Icon | Fields |
|----------|-------------|------|--------|
| **Bull Case** | Green | 🐂 | Probability %, Target level, Catalyst, Strategy (if bullish direction) |
| **Base Case** | Slate | 📊 | Probability %, Target level, Catalyst |
| **Bear Case** | Red | 🐻 | Probability %, Target level, Catalyst, Strategy (if bearish direction) |

**Below the scenarios:**
- **Trigger Levels Integration** (3-column grid):
  - Bull Trigger: Above Target1 (green)
  - Gamma Flip Trigger: At flip price (amber)
  - Bear Trigger: Below StopLoss (red)

- **Primary Edge:** Edge name + type + strength percentage
- **Thesis Summary:** Text description
- **Time Horizon:** Duration text
- **Framework Invalidation:** `⛔ Below ${level} — all scenarios void` (red)

---

### MSP AI Setup (Master Setup Panel)

The largest single panel — full-width institutional display:

**Header:**
- ⭐ **MSP AI SETUP**
- Badge: `Powered by Nasdaq BX + FMV Options (LIVE)`

**Fields:**
- **Market Mode:** e.g., `Bullish Trend ↑`
- **Setup Type:** `Trend Continuation`, `Countertrend Bounce`, or `Awaiting Confirmation`
- **Setup Score:** Large number in colored status card (ACTIVE=green, WAIT=amber, NO TRADE=red)

**Execution Layer** (if execution metrics available):
- Execution Score
- Fill Quality
- Time Fit

**MSP AI Personality Match:**
- **Status:** `HISTORICALLY SIMILAR` (green) or `CAUTION FILTER ACTIVE` (red when `noTradeBias`)
- **Setup Fit Score:** 0-100%
- **Adaptive Confluence:** Score + color (≥70 green, ≥50 amber, <50 red)
- **Profile Source:** `Profile from {X} closed trades ({Y} wins)` or `Build profile by logging and closing trades in Trade Journal`
- **Match Reasons:** Up to 3 checkmark items

**Institutional Filters:**
- **Final Quality:** Grade + score (green if aligned, red if `noTrade`)
- **Filters:** Up to 4 items with ✔/⚠/✖ status indicators
  - Filter statuses: `pass`, `warn`, `block`

**Embedded Components:**
- `CapitalFlowCard` — compact mode
- `StateMachineTraderEyeCard` — state machine visualization
- `EvolutionStatusCard` — compact evolution tracker

**Footer:**
- **Risk State:** NORMAL (green) / ELEVATED (amber) / HIGH (red)
  - ≤2% → NORMAL, ≤4% → ELEVATED, >4% → HIGH
- **Primary Action:** Trigger text (uppercase)
- **Live Data Status:** `Nasdaq BX ✔ • FMV Options ✔`
- **Latency:** Seconds since last data update

---

### Decision Ladder

Shown **only in OBSERVE lens mode**. A 5-step institutional validation pipeline:

| Step | State Logic | Detail |
|------|-------------|--------|
| **1. Market State** | `valid` if data usable + regime known; `partial` if no regime; `fail` if session closed or data unusable | `{regime} • {dataHealth} • {session}` |
| **2. Setup Validation** | `valid` if confirmed pattern + confidence ≥60; `partial` if pattern or confidence ≥45; else `fail` | `{pattern name} • {confidence}% alignment` |
| **3. Options Flow** | `valid` if unusual activity + OI aligned; `partial` if one present; else `fail` | `{unusual activity status} • OI {sentiment}` |
| **4. Analysis Zone** | `valid` if has entry zone + not no_trade; `partial` if has trade levels; else `fail` | Zone range + invalidation level |
| **5. Management** | `valid` if has tradeSnapshot/executionNotes/candleCloseConfluence; else `partial` | Catalyst or monitoring status |

**State Visuals:**
- ✔ VALID — emerald border/bg
- ⚠ PARTIAL — amber border/bg
- ✖ FAIL — red border/bg

**Pipeline Status:**
- `READY` if ≥4 steps VALID
- `NO_TRADE` if step 1 is FAIL
- `WAITING` otherwise

---

### Heat Signals

Shown **only in OBSERVE lens mode**. Compact grid of 5 signal badges:

| Label | State | Value |
|-------|-------|-------|
| TREND | 🟢/🔴/🟡 by direction | Direction name |
| FLOW | 🟢 if unusual activity, else 🟡 | ACTIVE / QUIET |
| VOL | 🔴 if movePct > 4, 🟡 if has data, ⚪ none | `{pct}%` |
| LIQ | 🟢 if high OI strikes exist, else 🟡 | SUPPORTED / THIN |
| EXEC | 🟢/🟡/❌ by execution state | READY / WAIT / NO TRADE |

---

### Pattern Formation

- **Pattern:** Best pattern name (highest confidence), colored by bias (bullish=green, bearish=red, neutral=amber)
- **Status Badge:** `Confirmed` (if confidence ≥55) / `Pending`
- **Strength:** Pattern confidence percentage
- **Bias Align:** `YES` (green) if pattern bias matches thesis direction, `MIXED` (amber) otherwise

**Pattern confidence labels:**
- `≥ 75` → HIGH
- `≥ 55` → MEDIUM
- `< 55` → LOW

---

### Candle Close Confluence

Shows multi-TF candle close timing (only in OBSERVE mode):

**Market Closed Warning:** If market closed, amber banner with `🔒 MARKET CLOSED` + explanation about next session times.

**Confluence Score:** Large font with color:
- `≥ 50` → amber-500
- `< 50` → slate-400

**Rating Badges:**
- `extreme` → 🔥 EXTREME (red badge)
- `high` → ⚡ HIGH (amber badge)

**4-Column Grid:**

| Card | Border | Content |
|------|--------|---------|
| **Closing NOW** (0-5 mins) | Emerald if ≥2 TFs | Count + TF badges |
| **Closing Soon** (1-4 hours) | Accent | Count + peak timing |
| **Special Events** | Red=yearEnd, Amber=quarterEnd, Violet=monthEnd | Year/Quarter/Month/Week end + session close |
| **Primary Analysis Window** | Emerald | Time range + reason |

**Upcoming timeline:** TF badges with closing time, colored by weight:
- `weight ≥ 10` → red
- `weight ≥ 5` → amber
- else → slate

---

## 18. Section 2 — Contracts & Greeks

### Highest Confluence Strike

**Header:** 🎯 Highest Confluence Strike (green border)

**Primary strike card** (green bg for calls, red bg for puts):
- **Strike + Type:** e.g., `$185 CALL` — large font
- **Moneyness badge:** `ATM` (amber), `ITM`/`OTM` (slate)
- **Reason:** Text explanation
- **Grid:**
  - Est. Delta (signed for put/call)
  - Distance from price (%)
  - Key Level (target price, green)
  - Confluence score (%)

**Alternative Strikes:** Up to N items, each showing strike + type + moneyness + reason

---

### Expiration Analysis

**Header:** 📅 Expiration Analysis

**Primary expiration card:**
- **DTE:** Days to expiration — large font
- **Theta Risk badge:** LOW (green) / MODERATE (amber) / HIGH (red)
- **Date:** Calendar date
- **Reason:** Text explanation
- **Timeframe:** scalping/intraday/swing/position
- **Confluence score:** Percentage

**Alternative Expirations:** Compact badges with DTE + date

---

### Open Interest Analysis

**Header:** 📈 Open Interest Analysis + EOD Data badge + Expiry date badge

**3-Column Grid:**

| Card | Color Logic |
|------|------------|
| **Put/Call Ratio** | >1 = red (bearish), <0.7 = green (bullish), else amber (neutral) |
| **Max Pain Strike** | Amber bg | Shows "Above price" or "Below price" relative to current |
| **O/I Sentiment** | Green = 🟢 BULLISH, Red = 🔴 BEARISH, Slate = ⚪ NEUTRAL |

**Volume Comparison:**
- Total Call O/I (green) — formatted as XK
- Total Put O/I (red) — formatted as XK

**Strike Analysis with Greeks Table** (expandable, open by default):

| Column | Symbol | Color |
|--------|--------|-------|
| Strike | Type badge (C green, P red) | — |
| OI | — | Slate |
| IV | — | Slate |
| Δ (Delta) | — | Emerald |
| Γ (Gamma) | — | Violet |
| Θ (Theta) | — | Red |
| ν (Vega) | — | Accent |

Up to 6 highest-OI strikes shown.

**Alignment Check:**
- ✅ Green: OI sentiment CONFIRMS confluence direction
- ⚠️ Amber: OI sentiment neutral
- ⚠️ Red: OI sentiment DIVERGES from confluence

**Fallback:** If no options data, shows placeholder with message: "Options Data Loading Issue" + reassurance that strike/expiration still works from price action.

---

### Greeks & Risk Advice

Collapsible section (amber border):
- **Delta Guidance:** Target delta text
- **Theta Warning:** (if applicable) — orange text
- **Gamma Advice:** (if applicable)
- **Overall Strategy:** Full strategy text

---

### Risk Management

Collapsible section (red border):
- **Max Risk Exposure:** Large red percentage
- **Risk Boundary Strategy:** Stop loss approach
- **Key Level Strategy:** Profit target approach (green)

---

### Analysis Summary

Green-bordered summary card with monospace format:
- **Symbol:** + current price
- **Scenario:** `LONG CALL` or `LONG PUT`
- **Strike:** Price + moneyness
- **Expiration:** Date + DTE
- **Quality:** Grade emoji + grade | Urgency emoji + urgency
- **Expiration Logic** note
- **Key Level:** 50% level | Max Risk percentage

---

## 19. Section 3 — Analyst Narrative (Advanced)

Only visible in **Advanced** mode. Collapsible section containing:

### Institutional Brain Summary

**State Card:**
- Command status (ACTIVE/WAIT/NO TRADE)
- Institutional Flow state
- Conditions (ALIGNED/NOT ALIGNED/WAIT)

**Strategy Recommendation Banner:**
- Strategy name with icon (💰 sell premium / 📈 buy premium / ⚖️ neutral)
- Risk Profile badge: `✓ Defined Risk` (green) or `⚠️ Undefined Risk` (amber)
- Reason text
- Strike levels (long/short)
- Max Risk / Max Reward

**Composite Score Card:**
- **Final Direction:** BULLISH/BEARISH/NEUTRAL with color
- **Direction Score:** Signed number (+green/-red)
- **Confluence:** Percentage (≥70 green, ≥50 amber, <50 red)
- **Aligned:** Count/Total (violet)

**Signal Components (weighted):** Each component shows:
- Name + weight percentage
- Direction arrow + absolute score
- Reason text
- Fill bar colored by direction × strength
  - Strong (score ≥50): Full opacity, vivid color
  - Medium (score ≥25): 85% opacity, lighter color
  - Weak (<25): 65% opacity, slate

**Signal Conflicts:** Red box listing conflict reasons

### IV Rank / Percentile Card
- IV Rank: Large number (≥70 red, ≤30 green, else amber)
- Current IV: Percentage
- Signal: SHORT Premium (red) / LONG Premium (green) / Neutral (amber)
- Reason text

### Expected Move Card
- Weekly (7 DTE): ± dollar + percentage
- Monthly (30 DTE): ± dollar + percentage
- Selected Expiry: ± dollar + percentage (highlighted)
- Note: "Based on 1 standard deviation (68% probability)"

### Unusual Activity Card
- Alert level border: high=red, moderate=amber, else slate
- Institutional Flow direction: BULLISH/BEARISH/NEUTRAL/MIXED
- Up to 3 unusual strikes:
  - Strike + type (CALL green / PUT red)
  - Vol/OI ratio
  - Volume + OI counts

### Confluence Analysis (collapsible)
- Confluence stack count (large) with quality indicator:
  - ≥4: 🔥 green
  - ≥2: violet
  - 1: slate
- TF badges (violet)

---

## 20. Section 4 — Execution Diagnostics (Advanced)

Only visible in **Advanced** mode.

### Critical Risk Events
Red bordered box with 🚨 icon. Lists `disclaimerFlags` — items like earnings, FOMC, CPI, volatility events.

### System Diagnostics
Expandable amber box with:
- **Data Freshness badge:** REALTIME (green), DELAYED (amber), STALE (red)
- **Confidence Caps:** ⚠️ amber badges
- **Execution Notes:** 💡 slate badges

---

## 21. Scoring Engine Deep Dive (options-v21.ts)

### Three-Layer Architecture

**Context Score (30% of final):**
| Feature | Weight | Range |
|---------|--------|-------|
| volFit | 30% | IV rank normalized 20→80; inverted for debit strategies |
| underlyingRegimeAlignment | 20% | 0-1 from market regime alignment |
| liquidityHealth | 20% | Combined OI + volume + spread tightness |
| dataFreshness | 15% | Normalized from stale seconds (0 → 2× MAX_STALE) |
| macroRisk | 15% | 0-1 (0.35 if news event, 0.8 otherwise) |

**Setup Score (45% of final):**
| Feature | Weight | Range |
|---------|--------|-------|
| directionalAgreement | 20% | 1 if direction matches, 0.5 neutral, 0 conflict |
| emBufferFit | 25% | Expected-move distance fit (debit) or buffer fit (credit) |
| payoff | 20% | Max gain/debit ratio normalized 0.5→3.0 (debit); credit/risk normalized 0.1→0.45 (credit) |
| tfConfluenceScore | 20% | Time-frame confluence 0-1 |
| pWinProxy | 15% | Probability proxy from delta |

**Execution Score (25% of final):**
| Feature | Weight | Range |
|---------|--------|-------|
| spreadLiquidity | 35% | Min leg liquidity (OI 45% + Vol 35% + Spread 20%) |
| fillQuality | 22% | 1 - slippage estimate |
| dteSuitability | 18% | Matches timeframe: scalp/intraday → <14 DTE; swing → 7-45; macro → 30-90 |
| riskGeometry | 15% | payoff × 0.7 + pWinProxy × 0.3 |
| timeWindowFit | 10% | Time quality (capped at 0.85) |

### Permission Gating

**Blockers (→ BLOCK):**
- `data_stale_or_missing`: Stale >180s during regular session (or >16h off-session) OR freshness=STALE
- `leg_spread_too_wide`: Any leg spread > 8%
- `oi_below_minimum`: Any leg OI < 50
- `volume_below_minimum`: Any leg volume < 5
- `invalid_debit_pricing`: Debit strategy with debit ≤ 0
- `credit_to_risk_too_low`: Credit/risk ratio < 0.08

**Warnings (→ WAIT if >1):**
- `tf_confluence_low`: TF confluence < 45%
- `fill_quality_low`: Fill quality < 55%
- `dte_suitability_low`: DTE suitability < 50%
- `regime_conflict`: Directional agreement = 0

**Time Permission Override:**
- `BLOCK` always overrides to BLOCK
- `WAIT` overrides to WAIT if currently ALLOW

**Gate Multipliers:**
| State | Multiplier |
|-------|-----------|
| ALLOW | 1.0 |
| WAIT | 0.72 |
| BLOCK | 0.35 |

### Strategy Types Built
- `CALL` — Long single call (ATM nearest)
- `PUT` — Long single put (ATM nearest)
- `BULL_CALL_DEBIT` — Bull call spread (buy lower, sell higher)
- `BEAR_CALL_CREDIT` — Bear call spread (sell lower, buy higher)
- `BEAR_PUT_DEBIT` — Bear put spread (buy higher, sell lower)
- `BULL_PUT_CREDIT` — Bull put spread (sell higher, buy lower)

Candidates filtered to strikes within `expectedMovePct` band of spot, up to 6 per side per expiry, spreads up to width 5. Capped at 24 candidates per symbol:DTE key. Final output: top 12 sorted by permission → confidence → execution.

### Quality Tiers
- `confidence ≥ 76` → `high`
- `confidence ≥ 55` → `medium`
- `confidence < 55` → `low`

### TF Alignment
- `tfConfluenceScore ≥ 78` → 4
- `≥ 62` → 3
- `≥ 45` → 2
- `< 45` → 1

---

## 22. Adaptive Personality Matching

Built from the user's **Trade Journal** (minimum 6 closed trades).

### Profile Dimensions:
- **Style Bias:** momentum, mean_reversion, breakout, options_flow, macro_swing — from winning trade text analysis
- **Risk DNA:** aggressive (avg R ≥2 or avg %P/L ≥6), balanced (≥1.1 R or ≥3%), defensive — from absolute R-multiple and P/L%
- **Decision Timing:** early, confirmation, late_momentum — from trade text keywords
- **Environment Rates:** win rate per regime (trend/range/reversal/unknown)

### Match Scoring:
| Factor | Weight | Logic |
|--------|--------|-------|
| Style | 35% | 95 if exact match; 78 if adjacent (momentum↔breakout); 45 otherwise |
| Risk | 20% | 92 if same DNA; 68 if 1 step; 42 if 2 steps |
| Timing | 20% | 90 if match; 55 otherwise |
| Environment | 25% | Historical win rate in current regime (30-95 range) |

**Adaptive Score:** `(base signal × 0.6) + (personality match × 0.4)`

**No-Trade Bias:** Triggered if sample ≥8 AND environment score <40

---

## 23. Terminal Modes (Adaptive Layout)

The page dynamically adjusts its layout based on market conditions:

| Mode | Trigger | Grid Layout | Priority |
|------|---------|-------------|----------|
| **TREND ACCELERATION** | direction ≠ neutral AND abs(directionScore) ≥35 AND confidence ≥62 AND confluenceStack ≥3 | 3-col (signal/market/exec) | Signal first |
| **CHOP / RANGE** | direction = neutral OR abs(directionScore) <22 OR conflicts ≥2 OR no_signal | Auto-fit columns, execution dimmed to 78% opacity | Signal first |
| **VOLATILITY EXPANSION** | movePct ≥4.8 OR ivRank ≥72 OR flow burst OR event flag | Auto-fit columns | Execution second (prioritized) |
| **REGIME TRANSITION** | Default/fallback | Auto-fit columns | Market first (confirmation focus) |

---

## 24. Color Codes Reference

| Color | CSS Variable / Hex | Usage |
|-------|-------------------|-------|
| Background | `var(--msp-bg)` / `#0F172A` | Page background |
| Panel | `var(--msp-panel)` | Card backgrounds |
| Panel-2 | `var(--msp-panel-2)` | Secondary backgrounds |
| Accent (Green) | `var(--msp-accent)` / `#10B981` | Primary accent, active states |
| Accent Glow | `var(--msp-accent-glow)` | Radar fill, highlight backgrounds |
| Bull | `var(--msp-bull)` | Bullish indicators |
| Bear | `var(--msp-bear)` | Bearish indicators |
| Warn | `var(--msp-warn)` | Warning states |
| Text | `var(--msp-text)` | Primary text |
| Text Muted | `var(--msp-text-muted)` | Secondary text |
| Text Faint | `var(--msp-text-faint)` | Tertiary text |
| Border | `var(--msp-border)` | Standard borders |
| Border Strong | `var(--msp-border-strong)` | Emphasis borders |
| Emerald-500 | `#10B981` / Tailwind `emerald-500` | ALLOW, bullish, A+ grade, valid state |
| Amber-500 | `#F59E0B` / Tailwind `amber-500` | WAIT, cautionary, B grade, partial state |
| Red-500 | `#EF4444` / Tailwind `red-500` | BLOCK, bearish, F grade, fail state |
| Violet-500 | Tailwind `violet-500` | Confluence, institutional, IV analysis |
| Cyan-400 | Tailwind `cyan-400` | Liquidity levels, pools |
| Sky-400 | Tailwind `sky-400` | Transition mode accent |
| Orange-500 | Tailwind `orange-500` | Execute lens mode |

---

## 25. Threshold & Score Reference

### Grade Thresholds
| Grade | Emoji | Color Class |
|-------|-------|-------------|
| A+ | 🏆 | `text-emerald-500` |
| A | ✅ | `text-green-500` |
| B | ⚡ | `text-amber-500` |
| C | ⚠️ | `text-orange-500` |
| F | ❌ | `text-red-500` |

### Urgency Thresholds
| Urgency | Emoji | Color |
|---------|-------|-------|
| immediate | 🚀 | Emerald |
| within_hour | ⏰ | Amber |
| wait | ⏳ | Gray |
| no_trade | 🚫 | Red |

### Scoring Thresholds (options-v21.ts config)
| Parameter | Value |
|-----------|-------|
| MAX_SPREAD_PCT | 8% |
| MIN_OI | 50 contracts |
| MIN_VOL | 5 contracts |
| MIN_CREDIT_TO_RISK | 0.08 (8%) |
| MAX_STALE_SEC_REALTIME | 180 seconds (regular session) |
| Off-session stale limit | 57,600 seconds (16 hours) |

### MRI Risk Modifiers
| Regime | Modifier |
|--------|---------|
| TREND_EXPANSION | 1.10 |
| ROTATIONAL_RANGE | 0.95 |
| VOLATILITY_EXPANSION | 0.75 |
| CHAOTIC_NEWS | 0.00 |

### Volatility State Thresholds
| State | Trigger |
|-------|---------|
| extreme | IV Rank ≥85 OR movePct ≥7 OR unusual activity HIGH |
| elevated | IV Rank ≥70 OR movePct ≥4.5 OR unusual activity MODERATE |
| normal | Below all elevated triggers |

### API Route Input Validation
Valid scan modes: `scalping`, `intraday_30m`, `intraday_1h`, `intraday_4h`, `swing_1d`, `swing_3d`, `swing_1w`, `macro_monthly`, `macro_yearly`

---

## How It Works (Help Section — shown before first scan)

Four feature cards:
1. 🔮 **Time Confluence** — Scans multiple timeframes for decompression events - when candles are gravitating toward their 50% levels.
2. 🎯 **Strike Selection** — Identifies strikes based on 50% level clusters and target zones from decompressing timeframes.
3. 📅 **Expiration Logic** — Matches expiration to your trading timeframe - scalping gets 0-2 DTE, swing trading gets weekly/monthly options.
4. 📊 **Greeks-Aware** — Provides delta targets, theta decay warnings, and gamma considerations based on your chosen timeframe.

**Risk Warning:** "Options trading involves significant risk. This tool provides confluence-based analysis, not financial advice. Always manage position sizes and use stops. Paper trade first!"

---

*This document covers every section, field, label, score, threshold, color code, and conditional display in the Options Confluence Scanner as of page version 4,725 lines.*
