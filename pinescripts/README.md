# MSP TradingView Pine Script Suite

Complete collection of MarketScanner Pros trading indicators and strategies for TradingView, reverse-engineered from the full MSP platform codebase.

All scripts are **Pine Script v6** and ready to paste into TradingView's Pine Editor.

---

## 📊 Indicators (4)

### 1. [MSP DVE Complete](MSP_DVE_Complete.pine)
**Dynamic Volatility Engine** — The core volatility analysis system.

Full 5-layer pipeline:
- **Layer 1: BBWP** — Bollinger Band Width Percentile (BB=13, Lookback=252)
- **Layer 1b: Squeeze** — BB inside Keltner Channel detection
- **Layer 2: Directional Bias** — Stochastic + trend + volume scoring (-100 to +100)
- **Layer 3: Phase Persistence** — Compression/expansion duration tracking
- **Layer 4: Signal Triggering** — Compression release + expansion continuation signals
- **Layer 5: State Prediction** — Transition probability from current regime

Supporting engines: Breakout Readiness (0-100), Exhaustion Risk (0-100), Trap Detection (0-100)

| Feature | Details |
|---------|---------|
| Regime zones | Compression (<15), Neutral, Expansion (>70), Climax (≥90), Transition |
| VHM histogram | Rate of BBWP change + acceleration (2nd derivative) |
| Signal types | Compression Release ↑↓, Expansion Continue ↑↓, Armed |
| Dashboard | Live BBWP, regime, bias, signal strength, breakout readiness, exhaustion |
| Alerts | 9 alert conditions |

---

### 2. [MSP Scanner Score](MSP_Scanner_Score.pine)
**5-Layer Scanner Score** — Replicates the MSP scanner engine scoring.

| Layer | Weight | Components |
|-------|--------|------------|
| Trend Structure | 45% | EMA200, ADX×DI, Aroon — all ADX-multiplied |
| Volume & Participation | 20% | MFI, OBV trend, volume expansion |
| Oscillators | 25% | RSI, MACD, Stochastic, CCI |
| DVE Boost | ±15% | BBWP compression bonus / climax penalty |
| Directional Pressure | ±8% | BOP, Williams %R, ROC(12) |

Includes 18-step setup label classification (Squeeze Breakout → Neutral) and trade parameters (Stop=1.5×ATR, Target=3×ATR, R:R=2.0).

---

### 3. [MSP Golden Egg](MSP_Golden_Egg.pine)
**4-Pillar Quality Scoring** — Rates how "golden" any setup is.

| Pillar | Weight | Measures |
|--------|--------|----------|
| Structure | 30% | EMA ribbon alignment, ADX strength, DI separation, HH/LL |
| Flow | 25% | Volume ratio, OBV vs SMA, MFI, volume trends |
| Momentum | 20% | RSI sweet zone, MACD histogram trend, stochastic, ROC |
| Risk | 25% | BBWP (lower=better), squeeze bonus, NATR, R:R, exhaustion |

Grades: 🥚 **Golden** (≥75), 🪙 **Silver** (≥60), 🥉 **Bronze** (≥45)

---

### 4. [MSP Regime Classifier](MSP_Regime_Classifier.pine)
**Multi-Asset Regime Detection** — Cross-market correlation analysis.

Uses `request.security()` for VIX, DXY, SPY, BTC, Gold, XLK, XLU, XLF.

| Output | Details |
|--------|---------|
| Market Regime | RISK ON, RISK OFF, STRESS, DIVERGENT, DECORRELATED |
| VIX Regime | LOW (≤14), NORMAL (14-20), ELEVATED (20-30), EXTREME (>30) |
| Sector Rotation | GROWTH, DEFENSIVE, VALUE, MIXED |
| DXY Trend | Strengthening, Weakening, Neutral |
| Risk Score | 0-100 composite |
| Size Multiplier | 0.25x (STRESS) → 1.0x (RISK ON) with VIX cap overlay |
| Warnings | All-correlations-to-1, reduce sizes, $ headwind, flight to safety |

---

## 📈 Strategies (3)

### 5. [MSP Day Trader](MSP_Day_Trader_Strategy.pine)
**7-Component Entry Scoring** — The flagship MSP day trading strategy.

| Component | Description |
|-----------|-------------|
| 1. EMA Ribbon | EMA9 > EMA21 > EMA55, price above ribbon |
| 2. HTF Trend | Price > EMA200 AND EMA9 > EMA200 |
| 3. ADX Trend | DI+ > DI- AND ADX ≥ 25 |
| 4. Momentum | RSI 55-75, MACD > signal, histogram rising |
| 5. Liquidity Sweep | Wick > 1.5× body, sweep of prior low/high |
| 6. Fair Value Gap | Price in recent FVG zone |
| 7. Volume Spike | Volume > 1.3× SMA(20) |

- **Normal mode**: Entry at 5/7 + HTF + ADX
- **Strict mode**: Entry at 6/7 + HTF + ADX
- **Exits**: SL (1.0×ATR), TP (3.5×ATR), trend flip, timeout (20 bars near entry)

---

### 6. [MSP Squeeze Breakout](MSP_Squeeze_Breakout_Strategy.pine)
**DVE Compression Release Strategy** — Trades the volatility expansion.

Entry requires ALL of:
- Was in BBWP compression (recent bars ≤ 15)
- BBWP crossed above compression threshold
- BBWP confirmed (> SMA or accelerating)
- Stochastic aligned with direction
- Directional bias exceeds ±15 threshold
- Optional: BB squeeze was active, volume spike

Features trailing stop (activates after 1.5×ATR profit), BBWP invalidation exit, signal strength filter (min 40/100).

---

### 7. [MSP Multi-Confluence](MSP_Multi_Confluence_Strategy.pine)
**5-Indicator Confluence + Quality Gate** — The highest-conviction strategy.

5 confluence indicators:
1. EMA trend (9/21/55 alignment)
2. RSI in trend zone (50-70 bull, 30-50 bear)
3. MACD histogram direction
4. Price vs BB midline
5. ADX > 25 + DI alignment

Plus:
- **DVE filter**: blocks entry if BBWP > 85 (climax risk), bonus if compressed
- **Quality gate**: Golden Egg lite scoring must exceed threshold (default 60/100)
- **EMA200 filter**: longs only above, shorts only below
- **Exit**: confluence drops to ≤ 2 indicators, or SL/TP/timeout

---

## ⚙️ Quick Start

1. Open TradingView → Pine Editor
2. Copy/paste any `.pine` file
3. Click "Add to chart"
4. Adjust inputs in the Settings panel

### Recommended Combinations

| Use Case | Indicators | Strategy |
|----------|-----------|----------|
| **Volatility Trading** | DVE Complete | Squeeze Breakout |
| **Day Trading** | Scanner Score + Golden Egg | Day Trader |
| **Swing Trading** | Golden Egg + Regime | Multi-Confluence |
| **Full Stack** | All 4 indicators | Choose by market |

### Parameter Defaults
All default values match the production MSP platform exactly:
- BBWP: BB=13, Lookback=252, SMA=5
- ADX: 14-period
- RSI: 14-period
- MACD: 12/26/9
- Stochastic: 14/3/3
- ATR: 14-period
- Stop Loss: 1.5× ATR (scanner) / 1.0× ATR (day trader)
- Take Profit: 3.0× ATR (scanner) / 3.5× ATR (day trader)
- Slippage: 5 bps (0.05%)
- Position sizing: 95% of equity

---

## 🔔 Alert Conditions

Every script includes TradingView alert conditions. Total: **30+ unique alerts** across all scripts including:
- Compression release up/down
- Squeeze fired / armed
- Exhaustion extreme
- Trap detected
- Scanner bull/bear signals
- Golden Egg grade-A setups
- Regime changes (risk on/off/stress)
- Flight to safety
- Day trader entry signals
- Liquidity sweep detection
- Confluence alignment/dissolution

---

## 📋 Source

All scripts are derived from the MarketScanner Pros platform codebase:
- Scanner engine: `app/api/scanner/run/route.ts`
- Bulk scanner: `app/api/scanner/bulk/route.ts`
- DVE engine: `lib/directionalVolatilityEngine.ts` (~1460 lines)
- Golden Egg: `lib/goldenEggFetchers.ts`
- Correlation regime: `lib/correlation-regime-engine.ts`
- Backtest engine: `lib/backtest/runStrategy.ts` (~1133 lines)
- Time confluence: `lib/time/equityTimeConfluence.ts`, `lib/time/cryptoTimeConfluence.ts`
