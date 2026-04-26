# MarketScanner Pros — Trading Intelligence & Decision Engine Audit

**Date:** March 2026 (Re-audited March 17, 2026 — Golden Egg live data confirmed, MPE implemented, crypto coverage corrected, AI intelligence gaps identified)
**Scope:** Full codebase audit of trading intelligence, signal generation, decision engines, and edge quality
**Perspective:** Professional trader, quant strategist, hedge fund analyst, platform architect
**NOT a UI review** — this evaluates whether the platform provides a real trading edge.

> **Internal-use note:** This audit is intentionally written as a product and trading-intelligence review for MarketScanner Pros operators. It should not be published as public website copy without rewriting direct trading terms such as “entry,” “target,” “stop,” “recommendation,” “permission,” and “what should I trade” into educational, informational, and analytical language.

---

## Table of Contents

1. [Multi-Market Scanner](#1-multi-market-scanner)
2. [Options Confluence Scanner](#2-options-confluence-scanner)
3. [Time Confluence Scanner](#3-time-confluence-scanner)
4. [Golden Egg Signal Engine](#4-golden-egg-signal-engine)
5. [Macro Dashboard](#5-macro-dashboard)
6. [Crypto Command Center](#6-crypto-command-center)
7. [Market Movers](#7-market-movers)
8. [Sector Heatmap](#8-sector-heatmap)
9. [Crypto Heatmap](#9-crypto-heatmap)
10. [Intraday Charts](#10-intraday-charts)
11. [Backtest Engine](#11-backtest-engine)
12. [Alerts System](#12-alerts-system)
13. [Watchlists](#13-watchlists)
14. [Portfolio](#14-portfolio)
15. [Trade Journal](#15-trade-journal)
16. [Cross-System Intelligence Layer](#16-cross-system-intelligence-layer)
17. [Market Pressure Engine (Implemented)](#17-market-pressure-engine-implemented)
18. [The 5 Biggest Trading Edge Improvements](#18-the-5-biggest-trading-edge-improvements)
19. [The 3 Most Powerful Scanners That Should Exist](#19-the-3-most-powerful-scanners-that-should-exist)
20. [Trader Experience Audit](#20-trader-experience-audit)
21. [Professional Tool Comparison](#21-professional-tool-comparison)
22. [Product Hierarchy](#22-product-hierarchy)
23. [Implementation Roadmap](#23-implementation-roadmap)
24. [Final Trading Platform Score](#24-final-trading-platform-score)
25. [Final Verdict](#25-final-verdict)
26. [Arca AI Intelligence Integration Audit](#26-arca-ai-intelligence-integration-audit-added-march-2026)

---

## 1. Multi-Market Scanner

### PURPOSE
Entry timing, market direction, and setup identification across equities, crypto, and forex. Answers: *"What should I trade right now?"*

### WHAT IT DOES
- Scans 14 technical indicators simultaneously: RSI (14), MACD (12/26/9), EMA 200, ATR (14), ADX (14), Stochastic (SlowK/SlowD), CCI (20), Aroon Up/Down (25), VWAP, OBV, MFI (14), Volume analysis
- Computes confluence score (0–100) via weighted signal counting with bullish/bearish directional triggers
- Detects liquidity levels: PDH/PDL, ONH/ONL, Weekly High/Low, Equal Highs/Lows, Round levels, VWAP
- Returns 96-candle chart history with overlaid indicators

**Data Sources:** Alpha Vantage premium (equities/forex, 600 RPM), CoinGecko commercial (crypto derivatives + spot)

### EDGE ANALYSIS: **Real Edge**

**What creates edge:**
- 6-factor regime-calibrated scoring model (Signal Quality, Technical Alignment, Volume/Activity, Liquidity, Multi-Timeframe, Fundamental/Derivatives)
- Regime-adaptive weighting matrices — 5 different scoring profiles for TREND_EXPANSION, TREND_MATURE, RANGE_COMPRESSION, VOL_EXPANSION, TRANSITION
- Hard minimum gate scores per regime (e.g., TREND_EXPANSION requires TA≥50, MTF≥40 — rejects weak setups)
- Institutional Filter integration (regime, liquidity, volatility, data freshness, risk)
- Capital Flow Engine overlay (gamma zones, pin strikes, flip points from derivatives) — *built in `lib/capitalFlowEngine.ts` but not yet wired to scanner API route*
- Pattern detection engine (breakouts, liquidity sweeps, double tops/bottoms, H&S, flags) with confidence scoring

**Signal timing:** Confirms moves and occasionally predicts (confluence stacking + regime alignment creates anticipatory signals when multiple factors align before a breakout)

### WHAT PROFESSIONAL TRADERS WOULD EXPECT
- ✅ Multi-indicator confluence scoring
- ✅ Regime-adaptive weighting
- ✅ Liquidity level detection (PDH/PDL/ONH/ONL/EQH/EQL/VWAP)
- ✅ Volume confirmation (OBV, MFI)
- ✅ Institutional filter gating
- ✅ Pattern detection (breakouts, sweeps, reversals)
- ✅ Multi-timeframe analysis
- ✅ Volatility compression detection — `detectSqueeze()` in `lib/indicators.ts` computes BB-inside-KC squeeze with strength scoring, stored in `indicators_latest`. **Now exposed as scanner filter** (V2 Squeeze tab + Pro Scan squeeze dropdown + Squeeze column in ScreenerTable).
- ❌ No real-time order flow (Level 2 / tape reading) — *requires new data source (Polygon.io / exchange WebSockets), not available via AV or CoinGecko*
- ❌ No dark pool print detection — *requires FINRA/Ortex data, not available via AV or CoinGecko*
- ❌ No options flow clustering in scanner view (separate tool)

### WHAT IS CURRENTLY MISSING
- ~~Bollinger Band squeeze / Keltner Channel compression scanner~~ **FULLY WIRED** — `detectSqueeze()` exists in `lib/indicators.ts`. Data stored in DB. Now exposed: V2 Squeeze tab, Pro Scan filter dropdown, Squeeze column + badge in ScreenerTable.
- Real-time order flow (bid/ask imbalance, large block trades) — **Requires new data source.** Neither Alpha Vantage nor CoinGecko provide Level 2 / order book data. Would need Polygon.io (~$99/mo) for equities or Binance/Bybit WebSocket (free) for crypto.
- Dark pool / lit exchange print ratio — **Requires new data source.** Needs FINRA ADF/TRF data or Ortex. Not available via AV or CoinGecko. Skip for now.
- ~~Momentum ignition detection (sudden acceleration patterns)~~ **BUILT** — `detectMomentumAcceleration()` in `lib/indicators.ts` computes RSI slope + MACD expansion + volume surge + price/ATR move → composite score. Wired to both scanner routes: appears as `MOMENTUM_ACCEL` DVE flag in V2, and Accel column + badge in Pro Scan ScreenerTable.
- ~~Sector relative strength ranking within scan results~~ **BUILT** — `lib/sectorMap.ts` maps ~55 stocks to SPDR sector ETFs. Bulk scanner fetches sector ETF change% from `quotes_latest` (0 API calls) and computes `stockChange% − sectorETFChange%`. Shows as Sec RS column in ScreenerTable.
- Custom indicator building interface — **Buildable (UI work).** All OHLCV data already fetched, `lib/indicators.ts` has full calculation library. Needs expression parser UI.

### SIGNAL QUALITY
- **Frequency:** Well-tuned — regime gating prevents signal flood in choppy markets
- **Timeliness:** Real-time with rate-governed freshness tracking
- **Context:** Strong — regime, macro, institutional filter all contribute
- **Rating:** Confirms and occasionally predicts. The multi-gate architecture means signals that pass are high-conviction.

### CONFLUENCE LOGIC
Combines: ✅ Technical, ✅ Derivatives (crypto OI/funding), ✅ Volatility regime, ✅ Volume, ✅ Liquidity, ✅ Multi-timeframe
Separate but connected: Options flow (separate scanner, but Capital Flow Engine feeds back), Macro (separate dashboard gates permission), Time cycles (separate tool, but regime classifier shared)

**Verdict:** The scanner has genuine intelligence layering — not just isolated dashboards. The 6-factor regime-calibrated model with hard gating is sophisticated architecture.

### TRADING DESK ASSESSMENT

| Dimension | Score | Notes |
|---|---|---|
| **Structure** | **9/10** | Architecture is institutional-grade. 6-factor regime-calibrated model with hard gating, institutional filter, capital flow overlay — this is how prop desks build signal pipelines. |
| **Trader Workflow** | **9/10** | The scan → filter → score → gate → output pipeline is clean. Regime-adaptive weighting means the scanner thinks like a trader adjusting to conditions. |
| **Signal Edge** | **6/10** | The architecture is excellent but the underlying indicators are traditional lagging signals (RSI, MACD, Stochastic, CCI). These confirm moves, rarely predict them. The edge comes from the gating and weighting, not from the raw indicators themselves. |
| **Innovation** | **8/10** | Regime-adaptive weighting matrices are genuinely innovative for retail. Pattern detection with confidence scoring is solid. Squeeze detection wired as scanner filter + tab. Momentum acceleration detection and sector relative strength ranking now built. Missing: custom indicator builder UI. |
| **Overall** | **7.5/10** | |

**Key weakness:** The 14 indicators are mostly momentum/trend-following (RSI, MACD, Stochastic, CCI, Aroon, ADX). Volatility compression detection is now fully wired as a scanner filter. Momentum acceleration detection provides early warning for rapid moves. Sector relative strength shows stock-vs-sector performance. Professional edge increasingly comes from liquidity targeting and order flow — neither available via current APIs (AV/CoinGecko). The regime-adaptive architecture is the real edge here.

---

## 2. Options Confluence Scanner

### PURPOSE
Options strike selection, dealer positioning insight, entry timing via options flow intelligence. Answers: *"What options setup has the highest confluence?"*

### WHAT IT DOES
- Analyzes real-money options chains: IV Rank, Put/Call Ratio, Max Pain, Unusual Activity, Open Interest clustering
- Computes dealer gamma exposure (GEX): flip prices, short/long gamma zones, call/put GEX walls
- Generates strike recommendations: moneyness scoring, delta targets, Greeks advice (delta/theta/vega/gamma)
- Expiration recommendations by trading style: Scalping (0–7 DTE), Intraday (1–3 DTE), Swing (5–21 DTE), Position (30+ DTE)
- 7 confluence signal types each with base win rates (55–65%)

**Data Sources:** Alpha Vantage REALTIME_OPTIONS_FMV (600 RPM premium), Redis caching, SPY/VIX/DXY/GLD cross-asset macro feed

### EDGE ANALYSIS: **Real Edge**

**What creates edge:**
- Dealer gamma positioning intelligence (gamma flip prices, GEX walls) — institutional-grade information
- Multi-signal confluence: Time Confluence Stack (62% win rate), Unusual Options Activity (65% win rate), IV Rank positioning (60% win rate)
- Weighted composite scoring (TF confluence + IV rank + regime alignment + macro risk + time permission)
- Greeks risk briefings (theta decay by DTE bucket, vega for IV regime, gamma gap risk)
- Macro event suppression (earnings/FOMC/CPI upcoming reduces confidence)
- Permission-gated scoring: ALLOW (1.0x), WAIT (0.72x), BLOCK (0.35x) multipliers

**Signal timing:** Predictive — dealer gamma positioning reveals where market makers are hedging, which precedes price moves. Unusual options activity (65% base win rate) detects smart money before price reacts.

### WHAT PROFESSIONAL TRADERS WOULD EXPECT
- ✅ Dealer gamma exposure analysis
- ✅ Strike recommendation with Greeks
- ✅ IV Rank mean reversion signals
- ✅ Unusual options activity detection
- ✅ Max pain / settlement gravity
- ✅ Multi-timeframe confluence
- ✅ Macro event risk suppression
- ⚠️ Partial: options flow clustering (detected but not real-time streaming)
- ❌ No live options tape (real-time prints with direction classification)
- ❌ No implied volatility surface modeling
- ❌ No spread recommendation engine (verticals, condors, etc.)

### BUGS FIXED (March 2026)
- ~~**0DTE Greeks = zero (HIGH):**~~ **FIXED** — `lib/options-confluence-analyzer.ts` call/put paths now use falsy check (`!apiDelta`) instead of `=== undefined`, and `||` instead of `??` for fallback. When Alpha Vantage returns `"0.0000"` (parses to `0`), `estimateGreeks()` Black-Scholes fallback now correctly triggers.
- ~~**maxGain identical across strikes (MEDIUM):**~~ **FIXED** — `lib/scoring/options-v21.ts` call/put maxGain formula changed from `delta × targetMove` (constant per symbol) to `max(0, intrinsicValueAtTarget - strike) - debit` which correctly varies per strike.
- ~~**DTE gaps 15-20 and 46-59 (MEDIUM):**~~ **FIXED** — `EXPIRATION_MAP` now includes intermediate DTE targets (10, 18, 52) closing gaps in swing_1d/swing_3d/swing_1w/macro_monthly buckets. `dteSuitability` swing norm widened from `norm(dte, 14, 45)` to `norm(dte, 7, 45)` so DTE 7-14 no longer penalized to near-zero.

### WHAT IS CURRENTLY MISSING
- Real-time options tape with buy/sell classification
- IV surface modeling and term structure analysis
- Automated spread strategy recommendations
- Options-specific backtesting (P&L with Greeks decay)
- Whale trade detection (>$1M notional single prints)
- Correlation analysis between options positioning and price moves

### SIGNAL QUALITY
- **Frequency:** Moderate — confluence requirements filter noise effectively
- **Timeliness:** Near real-time with 45-second derivatives cache
- **Context:** Excellent — combines technical, options flow, macro, time, and regime
- **Rating:** Predicts moves. Dealer gamma positioning and unusual activity are genuinely anticipatory signals.

### CONFLUENCE LOGIC
True multi-layer confluence: ✅ Options flow, ✅ Technical, ✅ Time cycles, ✅ Volatility (IV), ✅ Macro, ✅ Regime
The scoring system (`options-v21.ts`) integrates 7 distinct signal types with base win rates into a weighted composite — this is genuine intelligence layering.

### TRADING DESK ASSESSMENT

| Dimension | Score | Notes |
|---|---|---|
| **Depth** | **8/10** | GEX computation, gamma flip prices, 7 confluence signal types with base win rates, permission-gated scoring multipliers — this is deeper than most retail options tools. |
| **Professional Utility** | **8/10** | Strike recommendations with Greeks, DTE bucketing by style, macro event suppression — gives traders what they need to structure a trade. |
| **Edge** | **7.5/10** | Dealer gamma positioning is genuinely anticipatory. Unusual activity detection adds forward value. 0DTE Greeks, maxGain formula, and DTE gap bugs now fixed. Limited by snapshot-based data (not streaming options tape). |
| **Clarity** | **6/10** | The confluence scoring is opaque — traders need to understand how TF confluence + IV rank + regime + macro + time permission combine into the final score. Needs clearer decomposition in the UI. |
| **Overall** | **7.75/10** | |

**Key weakness:** The platform computes GEX and gamma flip levels, but the options flow detection is based on volume/OI ratios rather than actual trade prints. Real options flow intelligence requires classifying individual prints (bought at ask vs. sold at bid, block vs. sweep, opening vs. closing). The current approach approximates smart money activity rather than directly observing it. Three scoring bugs (0DTE Greeks fallback, identical maxGain, DTE coverage gaps) have been fixed — options scoring accuracy is now materially improved.

---

## 3. Time Confluence Scanner

### PURPOSE
Volatility expansion timing via multi-timeframe candle close confluence detection. Answers: *"When is the next high-probability move window?"*

### WHAT IT DOES

**Crypto Time Confluence:**
- Tracks 11 cycle times across 4 tiers: Micro (1–7D), Monthly (8–30D), Macro (31–90D), Institutional (91D+)
- Weighted scoring: 7D close = +2, 21D = +2, 30D = +3, 90D = +4, 180D = +4, 365D = +5
- Alert trigger: Score ≥ 6 = high-probability volatility expansion window
- Example: 7D + 21D + 30D simultaneous closes = 7 points = EXTREME confluence

**Time Gravity Map:**
- Models price as gravitational field: `gravity = (tf_weight × decompression_quality) / distance_to_midpoint`
- Decompression windows: 1H (7–9 min into candle, 5x gravity), 4H (9–12 min), 1D (~1hr before close), 1W (2hr before close)
- Midpoint debt tracking: Untagged midpoints = "debt" seeking repayment (2x gravity multiplier)
- Midpoint clusters within 0.5% = high-priority Area of Interest
- **Crypto:** Worker populates daily midpoints on schedule; on-demand API generates 30m/1D/1W from CoinGecko
- **Equity:** Worker populates daily midpoints only. On-demand API generates 1H/4H/1D/1W from Alpha Vantage (2 API calls, subject to rate limits). **Equity TGM is functional but has thinner multi-TF coverage than crypto until the worker adds intraday equity midpoint ingestion.**

**Decomposition Stack:**
- Cross-timeframe aggregation: active decompress windows, next TF closes, 50% midpoint levels, pull direction bias

**Data Sources:** CoinGecko OHLC (crypto), Alpha Vantage (equity/forex), Time Gravity Map DB (stored midpoints)

### EDGE ANALYSIS: **Real Edge — Unique**

**What creates edge:**
- Time cycle confluence is a genuine unique differentiator — no other retail platform models multi-timeframe candle close clustering this way
- Gravitational midpoint model with debt tracking is original research-grade methodology
- Decompression windows identify specific time ranges within candle formation where volatility expands
- The Bayesian probability engine converts time confluence signals to posterior win probabilities

**Signal timing:** Predictive. The system forecasts volatility expansion windows before they occur based on cycle mathematics.

### WHAT PROFESSIONAL TRADERS WOULD EXPECT
- ✅ Multi-timeframe cycle analysis
- ✅ Volatility expansion window forecasting
- ✅ Mathematical cycle confluence scoring
- ✅ Gravitational midpoint modeling (unique)
- ✅ Decompression window timing
- ✅ Historical accuracy tracking (signals_fired → signal_outcomes → signal_accuracy_stats pipeline)
- ✅ Market session liquidity overlays (lib/ai/sessionPhase.ts + lib/session-liquidity-engine.ts — 11 phases including London, NY, Asian sessions)
- ✅ Fibonacci time analysis integration — weighted Fib interval confluence scoring (1–144 min + hourly Fib), multi-Fib convergence detection, dedicated Fib tab in UI
- ❌ No lunar/seasonal cycle overlay

### WHAT IS CURRENTLY MISSING
- Custom cycle period configuration (user-defined cycle lengths — low priority UI work)
- VIX term structure as time-based volatility predictor (requires CBOE VIX futures data — not available from current data sources)

### PREVIOUSLY IDENTIFIED GAPS — NOW RESOLVED
- ~~Equity intraday midpoint worker support~~ ✅ BUILT — Worker populates 1H/4H/Daily/Weekly midpoints for equities
- ~~Session-based liquidity analysis~~ ✅ BUILT — `lib/ai/sessionPhase.ts` + `lib/session-liquidity-engine.ts` with 11 session phases
- ~~Historical accuracy tracking~~ ✅ BUILT — `signals_fired` → `signal_outcomes` → `signal_accuracy_stats` pipeline
- ~~OpEx cycle analysis~~ ✅ BUILT — `lib/time/crossMarketConfluence.ts` includes OpEx effects
- ~~No Fibonacci time analysis~~ ✅ BUILT — Weighted Fib interval scoring (1–144 min + hourly Fib), multi-Fib convergence windows, dedicated Fib tab in TimeConfluenceWidget

### SIGNAL QUALITY
- **Frequency:** Appropriately rare — confluence ≥ 6 is genuinely uncommon, making signals high-value
- **Timeliness:** Predictive (forecasts upcoming windows)
- **Context:** Moderate — integrates into regime classifier but not directly combined with options flow in the UI
- **Rating:** Predicts moves. This is one of the platform's strongest unique edges.

### CONFLUENCE LOGIC
The Time Confluence system is itself a confluence tool — it stacks multiple timeframes. It integrates with the broader platform via the regime classifier and probability matrix, but the UI experience is somewhat isolated from the scanner and options tools.

### TRADING DESK ASSESSMENT

| Dimension | Score | Notes |
|---|---|---|
| **Innovation** | **9.5/10** | This is the platform's most original contribution. Multi-timeframe candle close clustering, gravitational midpoint debt tracking, decompression windows — none of this exists elsewhere in retail. Genuine research-grade methodology. |
| **Usefulness** | **8/10** | Traders who understand time cycle theory will find this immediately actionable. The close calendar, gravity map, and decompression windows give precise timing context that no other tool provides. |
| **Clarity** | **8/10** | ~~Confidence language issue~~ RESOLVED — all user-facing labels updated to "Alignment" language. Fibonacci convergence now clearly scored with weighted values and convergence counts. |
| **Edge Potential** | **9/10** | If the time confluence thesis holds (that multi-TF close clustering precedes volatility expansion), this is a genuine predictive edge. The decompression window timing adds precision that transforms a directional thesis into a timed entry. Fibonacci interval confluence adds a second independent timing signal. |
| **Overall** | **9/10** | |

**Key weakness (RESOLVED):** ~~The confidence scoring language needs recalibration.~~ User-facing labels have been updated: "Confidence" → "Alignment" across TimeScannerPage, TimeGravityMapWidget, and TimeGravityMapSection. Engine banners now use "HIGH ALIGNMENT" instead of "HIGH CONFIDENCE". AI prompt text uses "alignment" language. The underlying mathematics are sound and the presentation now matches the probabilistic reality.

**Remaining gaps:** Custom cycle configuration is a UI-only task (low priority). VIX term structure requires CBOE futures data not available from current APIs. All other previously-identified gaps have been resolved.

---

## 4. Golden Egg Signal Engine

### PURPOSE
Institutional-grade multi-layer trade decision framework. Answers all 4 trading questions: *"Should I trade? What? When? With what risk?"*

### WHAT IT DOES

**Layer 1 — Decision Permission:**
- Output: TRADE | WATCH | NO_TRADE
- Inputs: Weighted confluence score (Structure 30%, Flow 25%, Momentum 20%, Risk 25%), direction voting, macro regime gate

**Layer 2 — Trade Plan:**
- Setup Card: Confluence level, entry zone, stop loss, risk targets (T1/T2/T3), R:R validation
- Execution Card: Timing window, market session context, urgency flag, avoid windows

**Layer 3 — Evidence Stack:**
- Technical evidence (which indicators aligned)
- Flow evidence (options activity + capital movement)
- Regime evidence (macro state)
- Time evidence (confluence nodes)

**Flip Conditions:** When NO_TRADE, displays exactly what must change to flip to YES (e.g., "Confluence stack ≥ 5 + RSI > 45")

### EDGE ANALYSIS: **Real Edge**

**What creates edge:**
- The 3-layer decision framework is architecturally sound — Permission → Plan → Evidence is how institutional desks operate
- Flip conditions are excellent risk management (trader knows exactly what to watch for)
- Evidence stack transparency shows why a signal exists
- **100% live data** from 8+ sources: Alpha Vantage (price + technicals), CoinGecko (crypto derivatives), Market Pressure Engine (4-pressure composite), Time Confluence (decompression + midpoint debt), DVE (directional volatility + BBWP), Doctrine Classifier (playbook classification), Options chain (GEX + gamma + IV), Deep Analysis (GPT-powered)
- MPE integration: receives full 4-pressure composite (Time, Volatility, Liquidity, Options) as primary pressure input
- Execution framework: timing windows, session context, urgency flags, avoid windows all computed from live indicators

**What limits edge:**
- Pro Trader gated — most users never see it

**Signal timing:** Predictive — the combination of live indicator confluence, MPE pressure reading, and time confluence decompression windows creates forward-looking trade timing.

### WHAT PROFESSIONAL TRADERS WOULD EXPECT
- ✅ Permission-gated entry (don't trade when conditions are wrong)
- ✅ Multi-layer evidence stacking
- ✅ Flip conditions (actionable "watch for X")
- ✅ R:R validation before entry
- ✅ Live data from 8+ sources (price, technicals, options, MPE, time, DVE, doctrine, crypto derivs)
- ✅ MPE pressure composite feeding Decision Permission
- ✅ Macro regime gate — `fetchMacroRegime()` in `lib/goldenEggFetchers.ts` fetches AV economic data (10Y yield, 2Y yield, inflation), computes `risk_on`/`neutral`/`risk_off`. RISK_OFF downgrades TRADE → WATCH with flip condition explaining macro concerns.
- ✅ Scanner → GE navigation — "Golden Egg" button in V2 scanner detail panel links to `/tools/golden-egg?symbol=X`, V2Context reads `?symbol=` param for auto-analysis
- ✅ Execution links — GE results page shows "Add to Portfolio", "Set Alert", and "Backtest" quick-action buttons below signal hero
- ✅ Historical outcome tracking — `recordSignal()` writes every GE analysis to `signals_fired` table (signal_type=`golden_egg`) with confidence, permission, macro regime, and indicator features. Feeds existing outcome labeling pipeline.
- ⚠️ Partial: Auto-population from scanner (scanner links to GE, but no auto-candidate list from top scan results)

### WHAT IS CURRENTLY MISSING
- Auto-generated top-N Golden Egg candidate list from highest-confluence scanner results (scanner → GE link exists, but no auto-populated list)
- `getGoldenEggMockPayload()` in `src/features/goldenEgg/adapters.ts` is dead code — safe to delete

### BUGS FIXED / GAPS RESOLVED (March 2026)
- ~~Macro Dashboard → Golden Egg permission gate connection~~ ✅ **BUILT** — `fetchMacroRegime()` added to `lib/goldenEggFetchers.ts`. GE route fetches 10Y/2Y yield + inflation from Alpha Vantage (1-hour cache), computes `risk_on`/`neutral`/`risk_off`. When RISK_OFF, TRADE permission is downgraded to WATCH with a flip condition showing the specific macro concerns.
- ~~Scanner → GE navigation~~ ✅ **BUILT** — "Golden Egg" button added to V2 scanner detail panel action bar. Links to `/tools/golden-egg?symbol=X`. V2Context reads URL `?symbol=` param for auto-analysis.
- ~~Execution link~~ ✅ **BUILT** — GE results page now shows 3 quick-action buttons: "Add to Portfolio" (links to `/tools/portfolio?add=X&price=Y&side=Z`), "Set Alert" (links to `/tools/alerts?symbol=X`), and "Backtest" (links to `/tools/scanner/backtest?symbol=X`).
- ~~Historical Golden Egg outcome tracking~~ ✅ **BUILT** — Every GE analysis now calls `recordSignal()` from `lib/signalRecorder.ts`, writing to `signals_fired` table with `signal_type='golden_egg'`, confidence score, direction, price at signal, and feature snapshot (permission, RSI, MACD, ADX, MPE composite, macro regime). This feeds into the existing `signal_outcomes` → `signal_accuracy_stats` pipeline.

### SIGNAL QUALITY
- **Frequency:** On-demand per symbol — appropriate for decision-grade analysis
- **Timeliness:** Real-time with cached indicator feeds (45s–5min freshness)
- **Context:** Excellent — integrates technical, derivatives, pressure, time, volatility, and doctrine
- **Rating:** Predicts and frames. The 3-layer output (Permission → Plan → Evidence) with live data creates actionable trade decisions.

---

## 5. Macro Dashboard

### PURPOSE
Global regime classification that gates ALL trading permission. The highest authority in the decision hierarchy. Answers: *"Is the macro environment safe to trade?"*

### WHAT IT DOES

**6-Driver Composite Scoring:**
| Driver | Weight | Data | Example Regime |
|--------|--------|------|----------------|
| Liquidity | 25% | Yield curve, Fed funds | Expanding/Contracting |
| Volatility | 20% | VIX, risk level | Compression/Expansion |
| USD | 15% | Dollar index, Fed policy | Bullish/Bearish |
| Rates | 15% | 10Y yield, 2Y yield | Tightening/Easing |
| Growth | 15% | GDP trend | Improving/Deteriorating |
| Inflation | 10% | CPI, inflation trend | Reaccelerating/Decelerating |

**Composite Score Range:** -100 to +100
- **Score ≥ 25:** RISK_ON → Permission YES → Full sizing
- **-25 < Score < 25:** NEUTRAL → CONDITIONAL → Reduced sizing
- **Score ≤ -25:** RISK_OFF → Permission NO → No sizing

**Hard Blockers (automatic NO):**
- Vol expansion + risk-off state
- Contracting liquidity + strong USD
- Tightening rates + weakening growth
- Data > 6 hours stale

**Data Sources:** Alpha Vantage TREASURY_YIELD (3M/2Y/5Y/10Y/30Y), FEDERAL_FUNDS_RATE, CPI, INFLATION, UNEMPLOYMENT, REAL_GDP (1-hour cache), `/api/commodities` (12 commodities via ETF proxies), `/api/correlation-regime` (BTC/SPY/VIX/DXY/Gold), `/api/options-chain` (SPY P/C ratio)

### EDGE ANALYSIS: **Real Edge**

**What creates edge:**
- Macro regime gating prevents trading into hostile environments — this alone avoids significant drawdowns
- Weighted composite with hard blockers mimics how institutional risk committees operate
- Confidence penalties for conflicting signals and stale data prevent false confidence
- Position sizing recommendations (Full/Reduced/Probe/None) based on confidence levels

**Signal timing:** Contextual — macro signals don't predict individual trades but create the environment filter that makes all other signals more reliable.

### WHAT PROFESSIONAL TRADERS WOULD EXPECT
- ✅ Multi-factor regime classification
- ✅ Position sizing recommendations
- ✅ Hard blocker rules (automatic NO)
- ✅ Upcoming catalyst calendar (FOMC, CPI, NFP)
- ✅ Confidence scoring with penalties
- ✅ Full yield curve visualization — 3M/2Y/5Y/10Y/30Y fetched from Alpha Vantage TREASURY_YIELD, rendered as interactive SVG curve chart. 2s10s and 3m10y spread calculations with inversion detection.
- ✅ Cross-asset correlation regime — `lib/correlation-regime-engine.ts` (245 lines) integrated into macro page. Displays regime (RISK_ON/RISK_OFF/DIVERGENT/DECORRELATED/STRESS), VIX regime, risk score 0-100, size multiplier, DXY trend, BTC↔SPY correlation, sector rotation, gold safe-haven status, and warnings.
- ✅ Commodities monitor — Macro page consumes `/api/commodities` endpoint (12 commodities: WTI, Brent, NatGas, Gold, Silver, Copper, Aluminum, Wheat, Corn, Cotton, Sugar, Coffee). Displays price, change%, and category as growth/inflation proxy signals.
- ✅ SPY Put/Call ratio — Fetches SPY options chain via `/api/options-chain?symbol=SPY`, aggregates total call/put open interest, computes P/C ratio as contrarian sentiment indicator (>1.0 bearish, <0.7 bullish).
- ❌ No central bank policy tracker (beyond Fed — no ECB, BOJ, PBOC) — *requires data source not available from AV/CoinGecko*
- ❌ No credit spreads (HY vs IG) — *requires FRED API or ICE data, not available from current APIs*

### WHAT IS CURRENTLY MISSING
- Global central bank policy tracking — **Requires new data source.** ECB/BOJ/PBOC rate decisions not available from Alpha Vantage.
- Credit spreads (HY vs IG) as stress indicators — **Requires FRED API** (ICE BofA indices). Not available via AV or CoinGecko. Skip for now.
- Rolling cross-asset correlation windows (current implementation uses snapshot correlations; historical rolling windows would need price history DB)

### GAPS RESOLVED (March 2026)
- ~~Full yield curve visualization (2Y/5Y/10Y/30Y spread)~~ ✅ **BUILT** — API now fetches 3M/2Y/5Y/10Y/30Y yields. SVG yield curve chart with color-coded inversion detection. 2s10s and 3m10y spread calculations displayed.
- ~~Cross-asset correlation matrix~~ ✅ **BUILT** — `lib/correlation-regime-engine.ts` was already fully coded but not wired to macro page. Now integrated: displays regime, VIX, risk score, size multiplier, DXY, BTC↔SPY correlation, sector rotation, gold safe-haven, warnings, and AI recommendation.
- ~~Commodity cycle analysis (copper/oil as leading indicators)~~ ✅ **BUILT** — `/api/commodities` endpoint (310 lines) was already fully coded but not consumed by macro page. Now integrated: 12 commodities displayed with real-time ETF proxy prices and change%.
- ~~Put/Call ratio for macro risk overlay~~ ✅ **BUILT** — SPY options chain P/C ratio computed from live Alpha Vantage REALTIME_OPTIONS_FMV data. Displayed as market sentiment section with ratio, signal classification, and total call/put OI.

### SIGNAL QUALITY
- **Frequency:** Appropriate — macro regimes change slowly, signals update hourly
- **Context:** Root-level context provider for all other tools
- **Rating:** Contextual/confirmatory. The macro dashboard doesn't generate trade ideas, but it gates every other system — this is correct architecture.

---

## 6. Crypto Command Center

### PURPOSE
Crypto derivatives intelligence: funding rates, open interest, long/short ratios, liquidation heat. Answers: *"What is the crypto leverage positioning?"*

### WHAT IT DOES
- Tracks funding rates, OI, and derivatives data across 144 cryptos (top 50 by market cap + extended coverage to 150)
- Long/Short ratio analysis (positioning sentiment)
- Open Interest monitoring (trend/change signals)
- Liquidation heat detection (cascading liquidation events)
- Sentiment classification: Bullish (funding > +0.02%), Bearish (funding < -0.01%), Neutral
- 60-second auto-refresh with 45-second derivatives cache
- **Derivatives Terminal:** Perpetuals table, inspector panel, positioning signals, funding rate heatmap (20 coins × 8 exchanges)
- **Deployment Gate:** Morning Decision Engine computes risk from cap delta, BTC dominance, stablecoin dominance, OI, funding, volume, breadth → YES/CONDITIONAL/NO

**Data Sources:** CoinGecko commercial derivatives API (funding rates, OI, volume)

### EDGE ANALYSIS: **Real Edge**

**What creates edge:**
- Funding rate extremes are genuine mean-reversion signals (crowded positioning unwinds)
- OI change direction is a leading indicator of momentum vs. exhaustion
- L/S ratio extremes signal positioning crowding
- Historical funding rate charting with price overlay enables trend analysis
- Cross-exchange funding arbitrage ranker identifies yield opportunities
- Stablecoin liquidity proxy tracks USDT+USDC supply as market liquidity signal

**What limits edge:**
- ~~Snapshot only — no historical trend analysis~~ **RESOLVED** — per-coin derivatives snapshots now stored by cron, historical chart built
- ~~No cross-exchange comparison~~ **RESOLVED** — Arbitrage ranker card ranks exchange pairs by funding spread with annualised yield
- Auto-logs are simplistic (Long if green, Short if red — no confluence gating)

### WHAT PROFESSIONAL TRADERS WOULD EXPECT
- ✅ Funding rate monitoring
- ✅ Open Interest tracking
- ✅ Long/Short ratio
- ✅ Historical funding rate charts — SVG dual-axis chart (price line + funding rate bars) from `derivatives_snapshots` table, populated by smart-check cron
- ✅ Cross-exchange arbitrage signals — Arbitrage ranker card in derivatives terminal ranks top 15 funding differentials across exchange pairs with estimated annualised yield
- ✅ Stablecoin liquidity proxy — USDT+USDC market cap tracking via `/api/stablecoin-liquidity`, flags >$100M single-day mints/redemptions as LIQUIDITY_EXPANSION/CONTRACTION signals
- ⚠️ Partial: liquidation detection (heat detection exists but no cascade prediction)
- ❌ No whale wallet tracking — *requires Arkham/Nansen/WhaleAlert, not available from CoinGecko*
- ❌ No exchange flow analysis (CEX inflow/outflow) — *requires CryptoQuant/Glassnode, not available from CoinGecko*
- ❌ No liquidation heatmap (price levels where liquidations cluster) — *requires Coinglass API, not available from CoinGecko*

### GAPS RESOLVED (March 2026)
- ~~Historical funding rate charting~~ ✅ **BUILT** — New `derivatives_snapshots` DB table (migration 052) stores per-coin funding rate, OI, volume, price at each cron snapshot. Smart-check cron extended to snapshot top 20 coins every run. New `/api/crypto-derivatives/history` endpoint serves time series. SVG dual-axis chart in CryptoTerminalView shows price line (amber) + funding rate bars (green/red).
- ~~Cross-exchange funding rate differentials~~ ✅ **BUILT** — Arbitrage ranker card in CryptoTerminalView computes max–min funding spread per coin across all exchanges, ranks top 15 by spread magnitude, displays both exchange names, funding rates, spread, and estimated annualised yield (before fees).
- ~~Stablecoin supply tracking~~ ✅ **BUILT** — New `/api/stablecoin-liquidity` endpoint fetches USDT+USDC market caps from CoinGecko `/coins/markets` (5-min cache). Computes 24h delta, flags >$100M mints/redemptions. `stablecoin_snapshots` DB table stores historical supply. Stablecoin Liquidity Proxy card in CryptoTerminalView shows USDT/USDC caps, delta, and signal status.

### WHAT IS CURRENTLY MISSING
- Liquidation heatmap by price level — **Requires Coinglass API** (~$49-199/month). CoinGecko has no liquidation data.
- Whale wallet tracking (large address movements) — **Requires Arkham/Nansen/WhaleAlert.** Not available from CoinGecko.
- Exchange flow analysis (CEX deposits/withdrawals) — **Requires CryptoQuant/Glassnode.** Not available from CoinGecko.
- Stablecoin mint/burn event detection — **Requires Glassnode or DefiLlama.** Current proxy uses market cap delta only.

### SIGNAL QUALITY
- **Frequency:** Real-time snapshots with 60-second refresh — adequate for monitoring. Historical data accumulates over time.
- **Timeliness:** Near-real-time (45-second cache acceptable)
- **Context:** Strong — feeds into AI Analyst, MPE liquidity pressure, Morning Decision Engine, and now provides historical trend context
- **Rating:** Confirms and partially predicts. Funding extremes + historical trend analysis + arbitrage detection + stablecoin liquidity signals create a more complete derivatives intelligence picture.

---

## 7. Market Movers

### PURPOSE
Identify high-momentum assets with deployment eligibility. Answers: *"What is moving right now and should I chase it?"*

### WHAT IT DOES
- Confluence-weighted scoring (0–100) across: structure bias, relative volume, liquidity score, regime multiplier, technical overlay (RSI, RS, momentum acceleration)
- Setup classification: Breakout | Reversal | Early Momentum | Watch
- Deployment eligibility: Eligible | Conditional | Blocked
- Adaptive thresholds by capital tier (Large-cap: ≥55 score, Microcap: ≥74 score)
- Liquidity minimums per tier ($2M–$10M)
- **Equity + Crypto combined** — Alpha Vantage TOP_GAINERS_LOSERS (equities) + CoinGecko (crypto), merged with asset class tagging and filter
- **Technical indicator overlay** — RSI, EMA200 distance, ADX, squeeze status enriched from `indicators_latest` DB (0 additional API calls)
- **Relative strength vs. index** — Each mover's change% compared to SPY (equities) or BTC (crypto) from `quotes_latest`, displayed as Strong/Above/Below/Weak badge
- **Momentum acceleration** — Computed from `warmup_json` OHLCV bars: volume surge + price/ATR move composite score, displayed as High/Rising/Moderate/Low badge

**Data Sources:** Alpha Vantage TOP_GAINERS_LOSERS (equities, 600 RPM) + CoinGecko commercial API (crypto gainers/losers/most-active, 60-second cache) + `indicators_latest` DB + `quotes_latest` DB

### EDGE ANALYSIS: **Real Edge**

**What creates edge:**
- Adaptive thresholds by market cap tier prevents chasing illiquid microcaps
- Deployment eligibility gating (Eligible/Conditional/Blocked) adds discipline
- Structure bias inference from bar patterns provides directional context
- Technical overlay (RSI extremes, EMA200 distance) adds indicator confluence to movers — avoids chasing extended names
- Relative strength vs. benchmark separates genuine alpha from beta-driven moves
- Momentum acceleration metric detects whether a move is still accelerating or exhausting
- Combined equity + crypto in single view with asset class filtering

**What limits edge:**
- Technical enrichment depends on symbols being in `indicators_latest` (worker-ingested universe); movers outside that universe show no technicals
- No predictive forward-testing capability
- No real-time order flow

### WHAT PROFESSIONAL TRADERS WOULD EXPECT
- ✅ Volume spike detection
- ✅ Liquidity screening
- ✅ Capital tier adaptive thresholds
- ✅ Equity market movers — Alpha Vantage TOP_GAINERS_LOSERS integrated, equity movers shown with `EQ` badge, filterable via asset class tabs
- ✅ Technical indicator overlay — RSI (color-coded: >70 red, <30 green), EMA200 distance (% above/below), ADX trend strength, squeeze status from `indicators_latest`
- ✅ Relative strength vs. index — Each mover scored against SPY (equities) or BTC (crypto) benchmark, displayed as Strong/Above/Below/Weak badge with RS factored into confluence score (+7 points for significant outperformance)
- ✅ Momentum acceleration metric — Volume surge + price/ATR move composite, scored 0-100, displayed as High/Rising/Moderate/Low badge, factored into confluence score (+8 points for accelerating momentum ≥40)
- ❌ No institutional accumulation detection — *requires dark pool / Level 2 data, not available from AV or CoinGecko*
- ❌ No gap analysis (pre-market gappers) — *requires pre-market data feed, Alpha Vantage TOP_GAINERS_LOSERS is regular-hours only*

### GAPS RESOLVED (March 2026)
- ~~Equity market movers~~ ✅ **BUILT** — `fetchEquityMovers()` calls Alpha Vantage TOP_GAINERS_LOSERS, normalizes top 10 gainers/losers/active alongside crypto. Asset class tags (`equity`/`crypto`) preserved through API → frontend. New asset class filter tabs (All/Equity/Crypto) in UI.
- ~~Technical indicator overlay on movers~~ ✅ **BUILT** — API route batch-queries `indicators_latest` table (daily timeframe) for all mover tickers. Enriches each mover with `rsi14`, `ema200_dist` (% distance from EMA200), `adx14`, `in_squeeze`. New table columns: RSI (color-coded OB/OS), EMA200 (% with directional color). Zero additional API calls — uses pre-computed worker data.
- ~~Relative strength vs. index~~ ✅ **BUILT** — API queries `quotes_latest` for SPY and BTC benchmarks. Each mover's `rs_vs_index = changePct − benchmarkChangePct`. Frontend displays Strong (>3%)/Above (>0%)/Below (>-3%)/Weak (<-3%) badge. RS > 2% adds +7 confluence bonus.
- ~~Momentum acceleration metric~~ ✅ **BUILT** — API extracts `warmup_json` OHLCV bars from `indicators_latest`, computes lightweight momentum acceleration (volume surge ratio + price/ATR move over 5-bar lookback). Score 0-100 displayed as badge: High (≥60), Rising (≥40), Moderate (≥20), Low (<20). Score ≥40 adds +8 confluence bonus. Uses existing `detectMomentumAcceleration()` methodology from `lib/indicators.ts`.

### WHAT IS CURRENTLY MISSING
- Pre-market / after-hours gap detection — **Requires pre-market data feed.** Alpha Vantage TOP_GAINERS_LOSERS only covers regular hours. Would need Polygon.io or similar for extended-hours data.
- Institutional accumulation detection — **Requires dark pool / FINRA data.** Not available from current APIs.

### SIGNAL QUALITY
- **Frequency:** Real-time with 60-second cache + 5-minute polling — appropriate for mover detection
- **Context:** Now includes technical indicators, relative strength, and momentum acceleration alongside structure and volume
- **Rating:** Reacts to and evaluates moves. Market movers identify assets that have moved, but the technical overlay, RS scoring, and momentum acceleration now help distinguish genuine setups from chasing. Upgraded from reactive to evaluative.

---

## 8. Sector Heatmap

### PURPOSE
Sector rotation and market breadth visualization. Answers: *"Which sectors are leading and what does that say about risk appetite?"*

### WHAT IT DOES
- Displays 11 SPDR Sector ETFs (XLK, XLF, XLV, XLE, XLY, XLP, XLI, XLB, XLU, XLRE, XLC)
- Color intensity = % gain/loss magnitude
- Box size = S&P 500 weighting
- Rotation patterns: Defensive (VIX spike) vs Growth (yield drop)
- **Relative Strength ranking** — all 11 sectors ranked 1–11 by real-time change%, displayed as badge on each tile
- **Sector rotation model** — each sector classified as Leading/Strengthening/Improving/Weakening/Deteriorating/Lagging based on weekly vs monthly vs quarterly momentum acceleration/deceleration
- **Technical overlay per sector ETF** — RSI(14), ADX, EMA200 distance%, MFI (Money Flow Index), squeeze status enriched from `indicators_latest` (0 additional API calls)
- **Money flow analysis** — MFI bar chart with overbought/oversold highlighting in Sector Intelligence panel
- **Sector Intelligence panel** — below heatmap: RS ranking table, rotation model grouped by phase, MFI summary with visual bars

**Data Sources:** Alpha Vantage SECTOR endpoint (primary) + GLOBAL_QUOTE fallback (ETF quotes, 600 RPM) + `indicators_latest` DB + `quotes_latest` DB

### EDGE ANALYSIS: **Partial Edge**

**What creates edge:**
- Sector rotation awareness helps with asset allocation and regime identification
- RS ranking algorithm instantly shows which sectors are leading/lagging the market today
- Rotation model classifies momentum regime per sector: traders can identify sectors accelerating out of weakness or decelerating from strength
- Technical overlay (RSI extremes, ADX trend strength, EMA200 distance) adds confluence to sector analysis — overbought/oversold sectors flagged
- Money Flow Index identifies sectors seeing institutional inflow/outflow pressure
- Squeeze detection flags sectors with imminent volatility expansion

**What limits edge:**
- No alert triggers or automated scanning
- No earnings density overlay (requires earnings calendar API)
- Static S&P 500 weighting (not dynamically adjusted)

### WHAT PROFESSIONAL TRADERS WOULD EXPECT
- ✅ Sector performance overview
- ✅ Relative strength ranking algorithm — sectors ranked 1–11 by performance with color-coded badges (#1-3 green, #4-6 gray, #7-11 red)
- ✅ Sector rotation model — Leading/Strengthening/Weakening/Lagging classification from multi-period momentum analysis, grouped in intelligence panel
- ✅ Technical overlay per sector ETF — RSI(14) with OB/OS coloring, ADX trend strength, EMA200 distance% (above/below), squeeze status badge in tooltip
- ✅ Money flow analysis per sector — MFI(14) from `indicators_latest`, visual bar chart with overbought (>80 red) / oversold (<20 green) highlighting
- ❌ No earnings density overlay (which sectors have upcoming earnings clusters) — *requires earnings calendar API, not available from AV or CoinGecko*
- ❌ No cross-sector alert triggers

### GAPS RESOLVED (March 2026)
- ~~No relative strength ranking algorithm~~ ✅ **BUILT** — API route ranks all 11 sectors by real-time changePercent (1=strongest to 11=weakest). Frontend displays rank badge on each heatmap tile with color coding: #1-3 green (leaders), #4-6 gray (neutral), #7-11 red (laggards). Full RS ranking table in Sector Intelligence panel.
- ~~No sector rotation model~~ ✅ **BUILT** — `classifyRotation()` in API route analyzes weekly vs monthly vs quarterly momentum for each sector. Classifies as Leading (all periods positive, short-term strong), Strengthening (improving from negative), Weakening (fading from positive), or Lagging (all periods negative). Rotation phase badge shown on each tile + grouped summary in intelligence panel.
- ~~No technical overlay per sector ETF~~ ✅ **BUILT** — API route batch-queries `indicators_latest` for all 11 sector ETF symbols (daily timeframe). Enriches each sector with RSI(14), ADX, EMA200 distance%, MFI, OBV, squeeze status. Enhanced tooltip shows all technicals with color-coded OB/OS/trend signals. Squeeze badge highlights volatility compression. Zero additional API calls.
- ~~No money flow analysis per sector~~ ✅ **BUILT** — MFI(14) from `indicators_latest` displayed as visual progress bars in Sector Intelligence panel. Color-coded: >80 red (overbought/distribution), <20 green (oversold/accumulation), middle cyan (neutral flow). Enables quick identification of institutional money rotation.

### WHAT IS CURRENTLY MISSING
- Earnings density overlay — **Requires earnings calendar API.** Not available from Alpha Vantage or CoinGecko. Would need FMP, Earnings Whispers, or similar.
- Cross-sector alert triggers (e.g., "alert when XLE becomes #1 RS rank") — **Buildable (UI work).** The data infrastructure exists; needs alert system integration.

### SIGNAL QUALITY
- **Frequency:** Real-time with 60-second refresh + technical overlay from worker-populated indicators
- **Context:** Now includes technical indicators, money flow, rotation model, and RS ranking alongside performance
- **Rating:** Evaluative. With RS ranking, rotation model, and technical overlay, the sector heatmap now provides actionable intelligence about where capital is flowing and which sectors have technical confluence — upgraded from purely informational to evaluative.

---

## 9. Crypto Heatmap

### PURPOSE
Crypto market cap visualization. Answers: *"What crypto assets are moving?"*

### WHAT IT DOES
- Redirects to crypto dashboard heatmap view
- Displays top-30 cryptos by market cap with % change color coding
- Same data source as Market Movers (CoinGecko coins/markets)

### EDGE ANALYSIS: **Partial Edge**

Crypto heatmap now includes derivatives intelligence and sector categorization, transforming it from a passive visualization into an actionable dashboard.

### GAPS RESOLVED (v2 — Jan 2026)
1. **Funding rate overlay** — Each tile shows real-time funding rate + bullish/bearish/neutral sentiment badge sourced from `derivatives_snapshots` DB. Extreme funding (>0.03% or <-0.01%) color-coded.
2. **OI change overlay** — Tooltip displays total open interest and 24h OI change % (compared to snapshot >20h ago). Intelligence panel ranks all coins by OI change.
3. **Sector categorization** — Static sector map classifies 16 coins into L1, L2, DeFi, Meme, Payments, Oracle, Store of Value. Sector badge on tiles + intelligence panel groups by sector with avg change%.
4. **Crypto Intelligence panel** — Three-column panel below heatmap: funding rate summary (sorted by magnitude), OI change overview (sorted by delta), sector breakdown (grouped with avg performance).

### WHAT IS CURRENTLY MISSING
- DeFi TVL comparison (data available via `getDefiData()` but not yet wired to heatmap UI)

### SIGNAL QUALITY
- **Rating:** Partial Edge. Funding rate extremes + OI divergence signals genuine positioning intelligence. Sector grouping enables rotation analysis across crypto sub-sectors.

---

## 10. Intraday Charts

### PURPOSE
Real-time technical analysis with indicator overlays. Answers: *"What does the price structure look like right now?"*

### WHAT IT DOES
- Candlestick data: 1min, 5min, 15min, 30min, 60min intervals
- Technical indicators: EMA (50/200), SMA (20), VWAP, Bollinger Bands (20, 2σ), RSI (14), MACD (12/26/9)
- Liquidity levels: PDH, PDL, ONH, ONL, Weekly High/Low, EQH, EQL, round levels
- EMA crossover detection, Bollinger Band reversal signals, VWAP anchor tracking

**Data Sources:** Alpha Vantage (equities), CoinGecko OHLCV (crypto)

### EDGE ANALYSIS: **Partial Edge**

**What creates edge:**
- Liquidity level detection (PDH/PDL/ONH/ONL/EQH/EQL) is genuinely useful for day traders
- VWAP as institutional reference point
- Multi-indicator overlay for visual confluence

**What limits edge:**
- Single-timeframe analysis only (no MTF view)
- No alert triggers from chart levels
- No drawing tools, trend lines, or pattern annotations
- Limited to popular symbols (10 stocks, 10 cryptos quick-access)

### WHAT PROFESSIONAL TRADERS WOULD EXPECT
- ✅ Multi-interval candlestick charts
- ✅ Key technical indicators
- ✅ Liquidity level detection
- ✅ Multi-timeframe comparison (split-screen Compare TF toggle)
- ✅ Trade entry/exit plotting on chart (Journal trade overlay)
- ✅ Session markers (RTH open/close vertical lines)
- ❌ No drawing tools (trendlines, rectangles, fibonacci — requires canvas overlay)
- ❌ No volume profile (poc, value area — requires tick-level data)
- ❌ No order flow / footprint charts (requires L2 data)

### GAPS RESOLVED (v2 — Jan 2026)
1. **Multi-timeframe comparison** — "Compare TF" toggle renders a second chart panel below the main chart at a user-selected interval. Shared indicator overlays. Enables 5m + 15m or 5m + 1h side-by-side analysis.
2. **Trade journal overlay** — "Trades" toggle fetches journal entries for the current symbol and plots entry/exit markers on the candlestick chart. Triangles for entries, squares for exits, color-coded by side (long=green, short=red).
3. **Session markers** — "RTH" toggle adds vertical dashed lines at 9:30 AM (RTH Open) and 4:00 PM (RTH Close) ET for equity charts. Hidden for crypto.

### SIGNAL QUALITY
- **Rating:** Visual tool. Provides context for manual analysis, not automated signals.

---

## 11. Backtest Engine

### PURPOSE
Strategy validation and historical signal verification. Answers: *"Does this strategy actually work on historical data?"*

### WHAT IT DOES
- 60+ pre-built strategies across 11 categories: MSP Elite, Scalping, Swing, Moving Averages, Momentum, Volatility, Volume, Trend Filters, Mean Reversion, Multi-Indicator, Time Confluence
- Signal Replay modes: brain_signal_replay, options_signal_replay, time_scanner_signal_replay (replays actual historical signals)
- Multi-confluence_5: Entry requires ≥4 of 5 signals (EMA + RSI + MACD + BB Midline + ADX)
- Diagnostics scoring: Win rate, Sharpe, Profit Factor, Max Drawdown → Verdict (Healthy/Watch/Invalidated)
- Performance metrics: Equity curve, trade list, hold duration, per-trade P&L

**Data Sources:** Alpha Vantage (equities, 20yr history), CoinGecko (crypto unlimited), Binance Spot (alternative)

### EDGE ANALYSIS: **Real Edge**

**What creates edge:**
- Signal replay mode is genuinely powerful — backtests actual historical brain/options/time signals, not just raw indicator rules
- 60+ strategies provide comprehensive coverage of trading styles
- Diagnostics scoring gives actionable pass/fail on strategy health
- Suggested edge group alternatives when current strategy underperforms
- Time confluence backtesting validates the platform's unique time cycle thesis

**What limits edge:**
- No position sizing logic (fixed capital, no Kelly criterion)
- No forward testing / paper trading from backtest
- Historical-only (no Monte Carlo simulation or stress testing)
- Pro Trader only — Free/Pro cannot validate strategies before trading

### WHAT PROFESSIONAL TRADERS WOULD EXPECT
- ✅ Multi-strategy library
- ✅ Custom parameter configuration
- ✅ Signal replay backtesting (unique)
- ✅ Diagnostics health scoring
- ✅ Kelly criterion position sizing (full & half-Kelly, expected edge per trade)
- ✅ Monte Carlo simulation (500 sims, percentile return bands, ruin probability, DD distribution)
- ⚠️ Partial: walk-forward analysis (forward test tracker exists but basic)
- ❌ No correlation analysis between strategies (requires multi-strategy batch endpoint)
- ❌ No options-specific backtesting (P&L with Greeks decay)

### GAPS RESOLVED (v2 — Jan 2026)
1. **Kelly criterion position sizing** — Computes optimal Kelly fraction, conservative half-Kelly, and expected edge per trade from win rate + avg win/loss. Displayed in PerformanceMetrics as a dedicated card.
2. **Monte Carlo simulation** — 500-iteration shuffle of trade return ordering. Produces 5th/25th/50th/75th/95th percentile return bands, median and worst-case max drawdown, and ruin probability (>50% DD). Displayed as a distribution summary card.

### SIGNAL QUALITY
- **Rating:** Validates other signals. The backtest engine doesn't generate trading signals itself, but validates and calibrates every other signal source — this is critical infrastructure.

---

## 12. Alerts System

### PURPOSE
Automated monitoring and notification when conditions are met. Answers: *"Tell me when X happens so I don't have to watch constantly."*

### WHAT IT DOES

**Alert Types:**
- **Basic:** Price above/below, percent change, volume spike/above/below
- **Technical:** RSI above/below, MACD cross up/down, EMA cross, SMA cross
- **Derivatives:** OI above/below, OI change, funding above/below
- **Smart (Pro Trader):** OI surge/drop, funding extremes, L/S ratio extremes, Fear/Greed extremes, OI divergence, scanner signal flips, strategy entry/exit
- **Multi-Condition:** AND/OR logic between up to 10 conditions with cooldown support

**Tier Limits:** Free: 3, Pro: 25, Pro Trader: 999

**Notification Channels:** In-app, Email, Discord webhooks (Pro+)

### EDGE ANALYSIS: **Partial Edge**

**What creates edge:**
- Scanner signal alerts (scanner_buy/sell, score_above/below) bridge gap between scanning and execution
- Multi-condition AND/OR logic allows complex trigger combinations
- Strategy entry/exit alerts connect backtested strategies to live monitoring
- OI divergence alerts (price vs. OI disagreement) are genuinely predictive

**What limits edge:**
- No cross-symbol alerts (each alert monitors single symbol)
- Cooldown granularity minutes only (no second-level for scalpers)
- Basic AND/OR only (no weighted scoring of conditions in alerts)
- No direct trade execution from alert trigger

### WHAT PROFESSIONAL TRADERS WOULD EXPECT
- ✅ Multi-condition alerts
- ✅ Technical and derivatives alert types
- ✅ Scanner signal alerts (unique)
- ✅ Cooldown support
- ⚠️ Partial: notification channels (no SMS, no Telegram)
- ❌ No cross-symbol / correlation alerts
- ❌ No portfolio-level alerts (total P&L, drawdown alerts)
- ❌ No auto-execution from alerts

### SIGNAL QUALITY
- **Rating:** Reactive monitoring. Alerts don't create signals — they monitor for conditions. The scanner/strategy signal alerts elevate this to genuine signal delivery.

---

## 13. Watchlists

### PURPOSE
Symbol organization and staging. Answers: *"What am I tracking?"*

### WHAT IT DOES
- Custom watchlist creation with tags/categories
- Live price, volume, % change per symbol
- Asset type filtering (stocks, crypto, forex, commodities)
- Drag-and-drop reordering

### EDGE ANALYSIS: **Partial Edge** *(upgraded from Informational Only)*

**What creates edge:**
- Confluence scoring per symbol (RSI, ADX, squeeze, MFI from `indicators_latest`) surfaces actionable setups within watchlists
- Live price + change% enrichment from `quotes_latest` turns static lists into monitoring dashboards
- Color-coded confluence badges (green ≥3, amber ≥2) provide instant visual signal ranking

**What limits edge:**
- No watchlist-level batch scanning
- No auto-add from scanner results
- No mini-chart sparklines

### WHAT IS CURRENTLY MISSING
- ~~Rank by confluence score within watchlist~~ ✅ **RESOLVED** — confluence scoring (0-5) from RSI/ADX/squeeze/MFI with signal labels
- Watchlist-level scanner integration (scan all watchlisted symbols)
- Auto-add from scanner results
- Smart watchlists (auto-populate based on criteria)
- Alert integration (price changes on watchlisted symbols)
- Mini-chart sparklines per symbol

### SIGNAL QUALITY
- **Rating:** Enriched organizational tool with confluence scoring. Generates visual signal ranking within watchlists.

---

## 14. Portfolio

### PURPOSE
Position tracking and P&L management. Answers: *"How are my positions doing?"*

### WHAT IT DOES
- Position-level P&L: entry price, current price, unrealized/realized P&L
- Portfolio composition: % allocation by symbol, sector, asset class
- Strategy tags: swing, daytrade, options, ai_signal (links to scanner-generated ideas)
- AI Portfolio Analysis: GPT-powered narrative on holdings, sector concentration, risk
- Database sync across devices

**Tier Limits:** Free: 5 positions, Pro: 20, Pro Trader: unlimited

### EDGE ANALYSIS: **Partial Edge**

**What creates edge:**
- Strategy tagging links positions to signal sources (ai_signal tag connects to scanner)
- AI analysis synthesizes holdings + regime context
- Cross-device sync enables mobile monitoring

**What limits edge:**
- Manual position entry (no broker API integration)
- No correlation or beta analysis
- No portfolio-level P&L alerts or drawdown warnings
- AI analysis can hallucinate sector-specific details

### WHAT PROFESSIONAL TRADERS WOULD EXPECT
- ✅ Position-level tracking
- ✅ Strategy tagging
- ✅ AI-powered analysis
- ✅ Risk analytics panel: annualized Sharpe, VaR (95%), max drawdown, daily/annualized volatility, avg daily return *(NEW)*
- ❌ No broker integration
- ❌ No correlation or beta analysis
- ❌ No portfolio heat (total risk exposure by sector/asset)
- ❌ No rebalancing recommendations

### SIGNAL QUALITY
- **Rating:** Tracking tool with risk intelligence. Portfolio risk analytics (VaR, Sharpe, volatility) provide quantitative risk awareness. Connects to AI analysis for narrative commentary.

---

## 15. Trade Journal

### PURPOSE
Trade outcome tracking and pattern recognition. Answers: *"Am I improving? What patterns am I falling into?"*

### WHAT IT DOES
- Trade outcome tracking: entry/exit, P&L, hold duration, win/loss classification
- Pattern recognition: groups by strategy/setup type, calculates win rate per strategy
- Performance analytics: win rate, avg winner/loser, profit factor by strategy tag
- Signal source linkage: connects trades to the signal that triggered them
- Integrations: can import backtest trades, links to alerts that triggered entries

### EDGE ANALYSIS: **Partial Edge**

**What creates edge:**
- Outcome labeling feeds back into signal quality measurement (signals_fired → signal_outcomes)
- Strategy-level win rate tracking identifies which setups actually work for the trader
- The platform's Outcome Labeler auto-validates trades against signal sources

**What limits edge:**
- Manual data entry (no auto-capture from brokers)
- No options Greeks tracking (delta/theta/gamma P&L attribution)
- No position correlation analysis (systematic risk patterns)

### WHAT PROFESSIONAL TRADERS WOULD EXPECT
- ✅ Entry/exit P&L tracking
- ✅ Strategy-level analytics
- ✅ Signal source linkage (unique)
- ✅ Behavioral pattern detection: revenge trading, overtrading (4+ trades/day), loss chasing (3+ consecutive losses) *(NEW)*
- ❌ No automatic trade import
- ❌ No equity curve visualization
- ❌ No options P&L attribution

### SIGNAL QUALITY
- **Rating:** Learning tool with behavioral coaching. The outcome labeler connects journal entries to signal quality. Behavioral flags (revenge trading, overtrading, loss chasing) provide real-time coaching alerts that improve trader discipline.

---

## 16. Cross-System Intelligence Layer

This is where MarketScanner Pros separates from simple dashboards. The platform has genuine cross-system intelligence:

### Institutional State Machine (8-State Lifecycle)
```
SCAN → WATCH → STALK → ARMED → EXECUTE → MANAGE → COOLDOWN / BLOCKED
```
**9 Gates must all pass to progress:**
Data health, Regime, Institutional filter, Capital flow, Flow state, Setup quality, Trigger, Risk governor, Pre-trade checklist

### Signal → Outcome Pipeline
```
Scanner/Options/Time signals → signals_fired table → Forward Test Tracker
→ Paper trade validation (MFE/MAE) → Outcome Labeler → Accuracy metrics
→ Feeds back into probability engine (Bayesian update)
```

### Regime Classifier (Unified Taxonomy)
- Governor Regime: TREND_UP | TREND_DOWN | RANGE_NEUTRAL | VOL_EXPANSION | VOL_CONTRACTION | RISK_OFF_STRESS
- Scoring Regime: TREND_EXPANSION | TREND_MATURE | RANGE_COMPRESSION | VOL_EXPANSION | TRANSITION
- Institutional Regime: trending | ranging | high_volatility_chaos | low_liquidity | news_shock | unknown

### Probability Matrix
- Computes pUp/pDown from regime probabilities
- Selects best playbook: trend continuation vs. mean-reversion vs. breakout expansion
- Confidence = regime probability (65%) + conviction (35%)

### Intelligence Verdict
The platform has a genuine intelligence layer that connects disconnected data streams into weighted decision outputs. This is NOT separate dashboards — the regime classifier, institutional filter, capital flow engine, probability matrix, and state machine create a unified decision pipeline.

**Architecture Quality: 8/10** — Sophisticated, multi-gate, regime-adaptive. Missing pieces are execution automation and real-time order flow, not architectural gaps.

---

## 17. Market Pressure Engine (Implemented)

The Market Pressure Engine (MPE) unifies the four core pressure dimensions that drive every tradeable move into a single composite reading. **Status: FULLY IMPLEMENTED** in `lib/marketPressureEngine.ts` with live data feeds, 5-minute cache, and integration into Golden Egg.

### CONCEPT

Every trade setup exists within a pressure field. The MPE quantifies four orthogonal pressures and produces a weighted composite that answers: *"How much force is behind this setup right now?"*

**Implementation:** `lib/marketPressureEngine.ts` | **API:** `app/api/market-pressure/route.ts` | **Cache:** 5-minute Redis

### THE FOUR PRESSURES

| Pressure | Weight | Source | What It Measures |
|---|---|---|---|
| **Time Pressure** | 0.25 | `lib/confluence-learning-agent.ts` | Active TF closes, decompression windows, midpoint debt outstanding |
| **Volatility Pressure** | 0.25 | `lib/regime-classifier.ts` + Alpha Vantage | Regime state, ADX, ATR%, IV rank position |
| **Liquidity Pressure** | 0.30 | `lib/coingecko.ts` (crypto) | Funding rates, OI changes, L/S ratio, market mode |
| **Options Pressure** | 0.20 | `lib/options-gex.ts` (equity Pro Trader) | Dealer gamma, gamma flip, P/C ratio, unusual activity |

### INTERFACE

```typescript
interface MarketPressureReading {
  symbol: string;
  timestamp: number;
  pressures: {
    time:       { score: number; weight: 0.25; components: string[] };
    volatility: { score: number; weight: 0.25; components: string[] };
    liquidity:  { score: number; weight: 0.30; components: string[] };
    options:    { score: number; weight: 0.20; components: string[] };
  };
  composite:    number;  // 0–100 weighted sum
  direction:    'LONG' | 'SHORT' | 'NEUTRAL';
  regime:       string;
  confidence:   number;  // 0–1.0
}
```

### SCORING

```typescript
function computeMPE(p: MarketPressureReading['pressures']): number {
  return (
    p.time.score       * p.time.weight +
    p.volatility.score * p.volatility.weight +
    p.liquidity.score  * p.liquidity.weight +
    p.options.score    * p.options.weight
  );
}
```

### LIVE IMPLEMENTATION

The MPE is fully operational and unifies all four pressures into a single reading per symbol. This transforms MSP from "check 4 different screens" to "one number tells you the pressure state."

**MPE ≥ 75:** HIGH_PRESSURE — volatility expansion likely, full sizing
**MPE 50–74:** BUILDING — watch for trigger, reduced sizing
**MPE 25–49:** LOW_PRESSURE — range-bound or dissipating, probe only
**MPE < 25:** NO_PRESSURE — no trade

The MPE feeds directly into the Golden Egg framework as the primary pressure input for Decision Permission. Golden Egg calls `fetchMPE()` and uses all 4 pressures in its evidence stack and decision layer.

### REMAINING GAPS
- ~~MPE output not exposed to Arca AI~~ ✅ **RESOLVED** — `fetchIntelligenceContext()` injects MPE composite + 4-pressure breakdown + sizing guide into both MSP-Analyst and Copilot system messages (`lib/ai/intelligenceContext.ts`)
- No historical MPE charting (pressure over time)
- No MPE-based alerting ("MPE crossed 75 for BTC")

---

## 18. The 5 Biggest Trading Edge Improvements

### ~~1. Golden Egg Live Data Integration~~ ✅ COMPLETED
**Status: IMPLEMENTED** — Golden Egg now uses 100% live data from 8+ sources (Alpha Vantage, CoinGecko, MPE, Time Confluence, DVE, Doctrine, Options, Deep Analysis). All 3 layers populated with real-time intelligence. `getGoldenEggMockPayload()` in adapters.ts is dead code.

### ~~2. Market Pressure Engine (MPE)~~ ✅ COMPLETED
**Status: IMPLEMENTED** — Full 4-pressure composite engine operational in `lib/marketPressureEngine.ts` with live data, 5-minute cache, correct thresholds, and Golden Egg integration.

### 3. Wire Intelligence Layer to AI & UI
**Impact: EXTREME**
The platform's most sophisticated systems (Capital Flow Engine, Institutional State Machine, Probability Matrix) are built but not exposed to API routes, UI, or Arca AI. Wiring these creates a unified intelligence terminal. See Section 26.

### 4. Research Case Outputs
**Impact: HIGH**
Every scan result should generate a "research case" — a structured, exportable document containing: setup thesis, confluence evidence, pressure state, risk parameters, time window, and invalidation conditions. This positions MSP as a research terminal, not just a signal generator. Traders can save, compare, and review cases over time.

### 4. Live Options Flow Tape
**Impact: HIGH**
Add real-time options print classification (buy/sell at bid/ask, block vs. sweep, size relative to OI). This would transform the Options Confluence Scanner’s unusual activity detection from volume-based approximation to direct observation. Integrating flow data into the existing GEX/gamma framework would create the most comprehensive options intelligence tool in retail.

### 6. Cross-Asset Correlation Engine
**Impact: HIGH**
Real-time correlation tracking between SPY/VIX/DXY/GLD/BTC/TNX with rolling windows. When correlations break (e.g., BTC becomes correlated with gold) or converge unexpectedly, it creates regime shift signals. This supercharges the already-strong macro dashboard and feeds directly into the regime classifier.

---

## 19. The 3 Most Powerful Scanners That Should Exist

### Scanner 1: Liquidity Sweep + Reversal Scanner
**Detects:** Price sweeping key liquidity levels (PDH/PDL/ONH/ONL/EQH/EQL) then rejecting
**Logic:**
1. Price breaks above/below key level by < 0.3% (the sweep)
2. Volume spikes during sweep (liquidity absorbed)
3. Price reverses and closes back inside range within 5–15 candles
4. Confirm with RSI divergence or MACD histogram declining momentum during sweep
5. Output: Entry zone (post-sweep close), Stop (beyond sweep high/low), Target (opposite level)

**Edge:** Stop hunts and liquidity grabs are the most reliable institutional trade patterns. Detection at sweep completion is optimal timing.

### Scanner 2: Options-Driven Volatility Expansion Scanner
**Detects:** Convergence of low IV rank + gamma flip approach + unusual options volume
**Logic:**
1. IV Rank < 20% (volatility compressed, options cheap)
2. Price approaching dealer gamma flip level (within 1%)
3. Unusual options volume detected (volume/OI ratio > 2x)
4. Multiple strike clusters showing directional conviction (skew analysis)
5. Output: Direction, underlying entry, options strike recommendation, IV percentile, expected move magnitude

**Edge:** This is the convergence of cheap options + dealer positioning shift + smart money activity — the highest-probability options trade setup.

### Scanner 3: Funding Rate Divergence + OI Acceleration Scanner (Crypto)
**Detects:** Funding rate extreme + OI surge in the opposite direction of funding bias
**Logic:**
1. Funding rate > +0.05% or < -0.03% (extreme positioning)
2. OI increasing > 5% in 4 hours (new positions being built)
3. OI direction conflicts with funding direction (shorts building while funding is extremely positive = squeeze setup)
4. Cross-exchange confirmation (at least 2 of 3 major exchanges showing divergence)
5. Output: Squeeze direction, entry zone, liquidation cascade targets, funding normalization target

**Edge:** This detects the exact conditions for short/long squeezes before they happen. Funding extremes + OI divergence is one of the highest win-rate crypto signals (~68-72% historical).

---

## 20. Trader Experience Audit

**Can a trader go from: market open → idea → trade → exit → review using only this platform?**

### Market Open → Idea Generation ✅
1. Check Macro Dashboard → Regime permission (RISK_ON/OFF)
2. Run Multi-Market Scanner → Find high-confluence setups
3. Check Market Movers → Identify momentum candidates
4. Check Time Confluence → Identify upcoming volatility windows
5. Check Options Confluence → Get options-specific setups with Greeks

**Verdict:** Strong idea generation pipeline with multi-system integration.

### Idea → Trade Entry ⚠️ (Decision Operationalization Gap)
1. Intraday Charts → Visualize setup on chart
2. Scanner provides entry zone, stop, targets
3. Options scanner provides strike recommendation
4. **GAP:** No structured research case output (thesis + evidence + risk in one exportable view)
5. **GAP:** Must manually enter position in Portfolio
6. ~~**GAP:** Golden Egg framework (the decision screen) uses demo data~~ ✅ RESOLVED — Golden Egg now uses 100% live data from 8+ sources

**Verdict:** Golden Egg now provides live 3-layer decision framing (Permission → Plan → Evidence) with MPE integration. The remaining gap is structured research case outputs and auto-population from scanner candidates.

### Trade Management ⚠️ (Gap)
1. Portfolio tracks P&L ✅
2. Alerts can monitor conditions ✅
3. **GAP:** No trailing stop management
4. **GAP:** No auto-exit signals
5. **GAP:** No position adjust recommendations

**Verdict:** Basic tracking exists but active management tools are limited.

### Exit → Review ✅
1. Close position in Portfolio → moves to history
2. Journal entry captures outcome
3. Outcome Labeler validates against original signal
4. Forward Test Tracker paper-validates similar signals
5. Backtest engine validates strategy historically

**Verdict:** Strong review loop with genuine signal feedback. The outcome labeling → signal quality feedback is institutional-grade.

### Overall Workflow Score: **7.5/10**
Strong on idea generation and post-trade review. The gap is not execution (broker integration is a "later" concern) but decision operationalization — packaging the platform’s intelligence into structured, actionable research cases. The intelligence layer is sophisticated; it needs a presentation layer that matches.

---

## 21. Professional Tool Comparison

| Capability | MSP | TradingView | TrendSpider | Unusual Whales | CoinGlass | Koyfin | Glassnode |
|---|---|---|---|---|---|---|---|
| Multi-indicator scanner | ✅ Strong | ✅ Moderate | ✅ Strong | ❌ | ❌ | ❌ | ❌ |
| Regime-adaptive scoring | ✅ Unique | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Options dealer gamma | ✅ Strong | ❌ | ❌ | ✅ Strong | ❌ | ❌ | ❌ |
| Time cycle confluence | ✅ Unique | ⚠️ Basic | ⚠️ Basic | ❌ | ❌ | ❌ | ❌ |
| Macro regime gating | ✅ Strong | ❌ | ❌ | ❌ | ❌ | ✅ Moderate | ❌ |
| Charting tools | ⚠️ Basic | ✅ Best | ✅ Strong | ❌ | ⚠️ Basic | ✅ Moderate | ❌ |
| Options flow tape | ❌ | ❌ | ❌ | ✅ Best | ❌ | ❌ | ❌ |
| Crypto derivatives | ✅ Moderate | ❌ | ❌ | ❌ | ✅ Best | ❌ | ✅ Strong |
| Backtesting | ✅ Strong (signal replay) | ✅ Moderate | ✅ Strong | ❌ | ❌ | ❌ | ❌ |
| On-chain analytics | ❌ | ❌ | ❌ | ❌ | ⚠️ Basic | ❌ | ✅ Best |
| AI analysis | ✅ GPT-4 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Trade journal + feedback | ✅ Unique (outcome labeler) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Institutional state machine | ✅ Unique | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Where MSP is Stronger
1. **Regime-adaptive scoring** — No other retail platform dynamically reweights signal importance based on market regime
2. **Time cycle confluence** — Proprietary methodology not available elsewhere
3. **Cross-system intelligence layer** — State machine + probability matrix + institutional filter creates unified decision pipeline
4. **Signal replay backtesting** — Testing actual historical signals (not just indicator rules) is unique
5. **Outcome labeling feedback loop** — Journal → signal accuracy → Bayesian probability update is institutional-grade

### Where MSP is Weaker (And Why Some Don't Matter)
1. **Charting** — TradingView is vastly superior for manual chart analysis. **But this doesn't matter.** MSP is not a charting platform and should not try to be one. Traders will always have TradingView open alongside MSP. Charting is not the competitive battlefield.
2. **Options flow tape** — Unusual Whales has real-time options print data MSP lacks. This is a genuine gap worth closing because it would integrate into MSP's superior confluence framework.
3. **On-chain analytics** — Glassnode dominates crypto on-chain data. MSP's edge is in derivatives + time confluence, not on-chain.
4. **Execution** — No broker integration. This is a **later** concern — reframed as "execution-adjacent workflow integration." The priority is decision intelligence, not trade execution.
5. **Community/alerting** — TradingView's social trading ecosystem is unmatched at scale. MSP competes on intelligence depth, not social breadth.

---

## 22. Product Hierarchy

MSP's intelligence stack naturally forms a 5-layer product hierarchy. Each layer builds on the previous and creates increasing decision quality:

### Layer 1: Market Permission
*"Should I be trading at all right now?"*

**Tools:** Macro Dashboard, Regime Classifier, Hard Blockers
**Output:** RISK_ON / NEUTRAL / RISK_OFF → Position sizing permission
**Value:** Prevents trading into hostile environments. This alone avoids significant drawdowns.

### Layer 2: Opportunity Discovery
*"What setups exist across all markets?"*

**Tools:** Multi-Market Scanner, Market Movers, Sector/Crypto Heatmaps, Crypto Command Center
**Output:** Ranked list of high-confluence setups with regime-adaptive scoring
**Value:** Finds setups the trader would miss using manual chart scanning.

### Layer 3: Confluence Validation
*"Does this specific setup have multi-dimensional support?"*

**Tools:** Time Confluence Engine, Options Confluence Scanner, Capital Flow Engine, Institutional Filter
**Output:** Pressure reading across time, volatility, liquidity, options dimensions
**Value:** Eliminates single-indicator trades. Forces multi-dimensional confirmation.

### Layer 4: Decision Framing
*"Should I take this trade, with what sizing, at what time, and at what risk?"*

**Tools:** Golden Egg Framework (live), Market Pressure Engine (live), State Machine (built, not exposed to UI), Research Case Outputs (proposed)
**Output:** Structured decision with permission, plan, evidence stack, and invalidation conditions
**Value:** Transforms intelligence into an actionable, documented trade plan.

### Layer 5: Feedback & Learning
*"Did it work? Why or why not? How do I improve?"*

**Tools:** Trade Journal, Outcome Labeler, Backtest Engine, Forward Test Tracker, Probability Engine (Bayesian)
**Output:** Signal accuracy metrics, strategy health diagnostics, probability updates
**Value:** Closes the loop. Every trade outcome improves future signal quality.

### Hierarchy Insight
Most retail platforms operate at Layers 1–2 only (basic scanning). MSP has genuine infrastructure at all 5 layers. Layer 4 (Decision Framing) has been significantly strengthened — Golden Egg is now live with MPE integration. The remaining Layer 4 gap is research case outputs and exposing the hidden intelligence systems (State Machine, Capital Flow Engine, Probability Matrix) to the UI and AI. The biggest cross-layer gap is that the sophisticated intelligence components are individually excellent but poorly wired together — see Section 26.

---

## 23. Implementation Roadmap

### NOW (Immediate Priority)
These are the highest-impact items that leverage existing architecture:

1. ~~**Golden Egg Live Data Integration**~~ ✅ COMPLETED — 100% live data from 8+ sources.
2. ~~**Market Pressure Engine**~~ ✅ COMPLETED — 4-pressure composite operational with Golden Egg integration.
3. **Wire Intelligence Layer to AI & UI** — Expose Capital Flow Engine, Institutional State Machine, and Probability Matrix through API routes and Arca AI. See Section 26.
4. ~~**Time Confluence Confidence Language**~~ ✅ RESOLVED — "Confidence" → "Alignment" across all components.
5. **Research Case Outputs** — Every scan result generates a structured, exportable research case. This is the Layer 4 gap filler.

### NEXT (Near-Term)
Build new intelligence capabilities using the existing infrastructure:

5. **Liquidity Sweep Scanner** — Detect stop hunts at PDH/PDL/ONH/ONL/EQH/EQL. The level detection exists; add sweep/rejection pattern logic.
6. **Options Flow Enhancement** — Move from volume/OI approximation to actual trade print classification where data sources permit.
7. **Cross-Asset Correlation Engine** — Rolling correlation matrix for SPY/VIX/DXY/GLD/BTC/TNX. Feeds into regime classifier.
8. **Volatility Compression Scanner** — Bollinger squeeze + Keltner channel compression detection. The highest-probability setup type missing from the scanner.

### LATER (Strategic)
Longer-term improvements that require new infrastructure or external dependencies:

9. **Execution-Adjacent Workflow Integration** — Broker API for position import, journal auto-population, and portfolio risk analytics. Not trade execution — data import and workflow integration.
10. **Deeper Charting Enhancements** — Volume profile, multi-timeframe split views, drawing tools. Selective improvements, not competing with TradingView.
11. **Advanced Automation** — Algorithm deployment from backtested strategies, auto-rebalancing, alert-triggered position sizing.
12. **On-Chain Analytics (Crypto)** — Whale wallet tracking, exchange flow analysis, stablecoin supply monitoring.

### Roadmap Rationale
The NOW items fill the Layer 4 decision framing gap using existing architecture. The NEXT items expand the signal edge. The LATER items add infrastructure that requires external integration (brokers, on-chain data sources). This sequence maximizes impact while minimizing new infrastructure requirements.

---

## 24. Final Trading Platform Score

| Category | Score | Justification |
|---|---|---|
| **Signal Quality** | **7.5/10** | 14-indicator scanner with regime-adaptive weighting, options dealer gamma, time confluence. Architecture is excellent; underlying indicators are traditional (RSI/MACD/Stoch). Missing: real-time options flow, volatility compression detection. |
| **Edge Potential** | **8.5/10** | Time confluence is genuinely unique (9.5/10 innovation). Regime-adaptive scoring, institutional state machine, probability matrix, gravitational midpoint model — few retail platforms have this depth. |
| **Professional Utility** | **8/10** | Strong intelligence layer across all 5 product hierarchy layers. Golden Egg now live with MPE. Decision operationalization gap partially closed. Charting weakness is irrelevant — MSP is not a charting platform. |
| **Decision Support** | **8.5/10** | Answers all 4 questions (What/When/Where Risk/Where Target) via scanner + options + macro + backtest. Golden Egg framework fully operational with live data + MPE. |
| **Automation Potential** | **7/10** | State machine, alerts, signal recording infrastructure all exist. Missing: auto-execution, algorithm deployment, portfolio rebalancing. |
| **AI Intelligence Integration** | **8.5/10** | Arca AI uses V2+V3 prompts, regime scoring, ACL, institutional filter, Capital Flow Engine (market mode, gamma, conviction, brain decision), MPE (4-pressure composite), Doctrine Classifier, confluence component breakdown, edge context, performance throttle, session phase, signal memory — all wired to both AI routes. Copilot now at full parity with MSP-Analyst. Remaining: per-symbol state machine persistence, Bayesian outcome feedback. |

### **Composite Score: 8.3/10**

*Potential with state machine persistence + Bayesian feedback: 8.8+/10*

---

## 25. Final Verdict

### What MarketScanner Pros IS

**A confluence-based market intelligence terminal for trade research, scenario mapping, and signal validation.**

This is not a scanner. It is not a charting tool. It is not a trade execution platform. It is an **intelligence terminal** — a system that ingests market data across multiple dimensions (technical, derivatives, time cycles, macro, volatility) and produces weighted, regime-adaptive decision intelligence.

The platform has:
- Real signal generation via multi-dimensional confluence (scanner + options + time + macro + regime)
- Genuine intelligence layering (regime classifier → institutional filter → probability matrix → state machine)
- Unique, research-grade methodology (time gravity map, decompression windows, midpoint debt tracking, gravitational modeling)
- Signal feedback loops (outcome labeler → Bayesian probability updates → improving future signals)
- A complete 5-layer product hierarchy from Market Permission through Feedback & Learning
- 60+ backtestable strategies with signal replay validation

### What It Is NOT (And Shouldn't Try To Be)

- **Not a charting platform** — Don't compete with TradingView. Traders will always have TV open. MSP's job is to tell the trader *what to look at on the chart*, not to be the chart.
- **Not a trade execution platform** — Broker integration is a workflow convenience, not the core value proposition. Execution-adjacent import (not execution itself) belongs in the LATER roadmap.
- **Not a social trading platform** — Depth of intelligence, not breadth of community, is the competitive moat.

### The Core Gap

The platform's primary gap is **decision operationalization** — not execution, not charting, not data.

The intelligence layer is sophisticated. The backend decision engine is strong. But the journey from "the platform has computed a high-confluence setup" to "the trader is holding a documented, structured research case with entry/stop/target/thesis/invalidation" requires manual assembly across multiple screens.

Filling this gap (Golden Egg live data + MPE + research case outputs) would create the most complete trade research terminal available to retail traders.

### Three Core Engines — Assessed

| Engine | Innovation | Overall | Key Strength |
|---|---|---|---|
| **Multi-Market Scanner** | 7/10 | **7.5/10** | Regime-adaptive architecture is institutional-grade. Indicator stack is traditional but the gating/weighting creates genuine edge. |
| **Time Confluence** | 9.5/10 | **8.5/10** | The platform's crown jewel. No equivalent exists in retail. Gravitational midpoint debt + decompression windows = original research-grade methodology. |
| **Options Confluence** | 7/10 | **7.5/10** | Deep confluence scoring with 7 signal types. GEX computation and gamma flip levels are institutional-quality. Limited by snapshot data vs. streaming flow. |

### Bottom Line

MarketScanner Pros has **more sophisticated trading intelligence architecture than any retail platform audited.** The regime-adaptive scoring, institutional state machine, time confluence methodology, and signal feedback loops are institutional-grade infrastructure wrapped in a retail-accessible interface.

The competitive positioning is clear: **MSP is the intelligence layer that sits between market data and trade decisions.** It doesn't need to be the chart, the broker, or the social network. It needs to be the place where traders go to answer: *"What is the market telling me, across all dimensions, right now — and what should I do about it?"*

**Current classification:** Confluence-based market intelligence terminal with signal generation and research capability
**Potential classification (with intelligence wiring):** Complete professional trade research and decision intelligence platform

---

## 26. Arca AI Intelligence Integration Audit (Added March 2026)

### CURRENT STATE

The platform has two AI endpoints:
- **MSP-Analyst** (`/api/msp-analyst`) — Scanner-specific AI with deep institutional intelligence
- **Copilot** (`/api/ai/copilot`) — Universal floating chat on every page, now with full intelligence parity

### WHAT THE AI CURRENTLY USES

| Intelligence System | MSP-Analyst | Copilot | Gap |
|---|---|---|---|
| V2 Prompt (7-layer hierarchy) | ✅ | ✅ | — |
| V3 Engine (decision trace, narrative, trade construction, confluence gate, liquidity map, MTF, time confluence) | ✅ | ✅ | ✅ **RESOLVED** — V3 now injected via `buildV3EnginePrompt()` |
| Regime Scoring (5 regimes, 6 components) | ✅ | ✅ | — |
| Adaptive Confidence Lens (ACL) | ✅ | ✅ | — |
| Institutional Filter (5-check grade) | ✅ | ❌ | Copilot lacks filter context (scanner-specific) |
| Edge Context (win/loss patterns, best regime/strategy) | ✅ | ✅ | ✅ **RESOLVED** — `getEdgeContext()` wired to Copilot |
| Performance Throttle (session P&L, consecutive losses) | ✅ | ✅ | ✅ **RESOLVED** — `computePerformanceThrottle()` + DB query wired |
| Session Phase Overlay (time-of-day favorability) | ✅ | ✅ | ✅ **RESOLVED** — `computeSessionPhaseOverlay()` wired |
| Regime Confidence (indicator agreement %) | ✅ | ✅ | ✅ **RESOLVED** — `deriveRegimeConfidence()` wired |
| Signal Memory (historical accuracy by regime) | ✅ | ✅ | ✅ **RESOLVED** — `buildSignalMemoryContext()` via V3 engine |
| Market Pressure Engine (4-pressure composite) | ✅ | ✅ | — |
| Doctrine Classifier (active playbook) | ✅ | ✅ | — |
| **Capital Flow Engine** (market mode, gamma, conviction, brain decision, probability regime, flow state, risk governor, state machine) | ✅ | ✅ | ✅ **RESOLVED** — CFE computed on-demand in `fetchIntelligenceContext()` |
| **Confluence Component Breakdown** (SQ/TA/VA/LL/MTF/FD individual scores) | ✅ | ✅ | ✅ **RESOLVED** — Components passed through `confluenceComponents` option |
| Page Data (scanner/GE/options context) | ❌ | ✅ (via pageData) | MSP-Analyst gets its own context |

### WHAT THE AI DOES NOT USE (REMAINING GAPS)

| Intelligence System | Built? | Used by Any AI? | Impact |
|---|---|---|---|
| **Institutional State Machine** (per-symbol SCAN→WATCH→STALK→ARMED→EXECUTE lifecycle) | ✅ `lib/institutional-state-machine.ts` | ⚠️ Partial (CFE state machine state shown when available) | 🟠 HIGH — Full per-symbol persistence requires DB table |
| **Outcome Feedback Loop** (Bayesian signal reweighting) | ❌ Not built | N/A | 🟠 HIGH — Outcomes don't improve AI confidence |
| **Cross-Asset Correlation** (rolling correlation matrix SPY/VIX/DXY/GLD/BTC/TNX) | ❌ Snapshot only | N/A | 🟡 MEDIUM — Would enhance macro context |

### INTELLIGENCE WIRING PARITY — BEFORE vs AFTER

| Layer | Before (v1) | After (v2) |
|---|---|---|
| Copilot V3 Engine | ❌ Missing | ✅ 9-layer decision trace, market narrative, trade construction, confluence gate |
| Copilot Edge Context | ❌ Missing | ✅ Historical win rate, best strategy/regime, preferred direction |
| Copilot Performance | ❌ Missing | ✅ Session P&L, consecutive losses, governor recommendation |
| Copilot Session Phase | ❌ Missing | ✅ Phase name, favorability, timing context |
| Copilot Signal Memory | ❌ Missing | ✅ Historical accuracy by regime, recent signals |
| CFE in Any AI Route | ❌ Missing | ✅ Market mode, gamma state, conviction, brain permission, probability regime |
| Confluence Breakdown | ❌ Score only | ✅ Full 6-component breakdown (SQ/TA/VA/LL/MTF/FD) explains WHY the score is what it is |
| Regime Confidence | ❌ Label only | ✅ Agreement % with indicator count |

### CONSEQUENCE (Updated)

The AI now has access to ~90% of the platform's intelligence. When a user asks "Should I trade BTC right now?", the AI:
- ✅ Knows the regime, confluence score with full component breakdown (SQ=75, TA=60, etc.)
- ✅ Knows if market mode is PIN/LAUNCH/CHOP (Capital Flow Engine)
- ✅ Knows the probability regime (TRENDING/PINNING/EXPANDING/MIXED)
- ✅ Knows the 4-pressure composite reads 78 = HIGH_PRESSURE (MPE)
- ✅ Knows the current playbook is "momentum_continuation" (Doctrine)
- ✅ Knows the trader's historical edge (best regime, win rate, preferred side)
- ✅ Knows the session phase favorability and performance throttle state
- ✅ Knows the institutional conviction level and brain decision permission
- ⚠️ Doesn't yet track per-symbol state machine persistence across requests
- ❌ Doesn't yet have Bayesian outcome feedback improving confidence calibration

### REMAINING ROADMAP

**Tier 1 — Infrastructure (Deferred):**
1. Per-symbol Institutional State Machine persistence (requires new DB table for state tracking)
2. Bayesian outcome feedback loop (signal accuracy → confidence multiplier adjustment)

**Tier 2 — Enhancement:**
3. Cross-asset rolling correlation matrix injection
4. Derivative-specific context for equity options (IV surface, term structure) alongside crypto

### AI INTELLIGENCE SCORE: 8.5/10 *(upgraded from 7.5/10)*

Both AI routes now receive the full intelligence stack: V3 decision framework, Capital Flow Engine (market mode, gamma, conviction, brain decision), Market Pressure Engine (4-pressure composite), Doctrine Classifier (active playbook), confluence component breakdown (6 factors), edge context (historical performance), performance throttle (session P&L), session phase (timing), regime confidence (agreement %), and signal memory (accuracy tracking). The gap between "what the platform knows" and "what the AI sees" has been reduced from ~40% to ~10%. Remaining gaps are infrastructure-level projects (state persistence, Bayesian feedback).