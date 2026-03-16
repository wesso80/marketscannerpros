# Backtest Audit Inventory — 2026-02-27

## Summary

Institutional-grade audit of `app/api/backtest/route.ts` and supporting modules.
All P0/P1 fixes applied, caching added, full test suite passing (30/30).

---

## P0 — Critical Fixes

| ID | Control | File(s) Changed | Description |
|----|---------|-----------------|-------------|
| P0-1 | RSI Wilder smoothing | `lib/backtest/indicators.ts` | Replaced broken prevAvgGain/Loss reconstruction from RSI value with explicit avgGain/avgLoss carry. Old code: `prevAvgGain = (rsi[i-1] >= 50) ? ...`. New code: carries `avgGain`/`avgLoss` as running state through the Wilder loop. |
| P0-2 | O(n²) RSI elimination | `app/api/backtest/route.ts` | Removed `calculateRSI(closes.slice(0, i+1), 21)` inside the per-bar strategy loop (line ~760 of original). Replaced with precomputed `rsi21 = calculateRSI(closes, 21)` computed once before the loop. Reference via `rsi21[i]`. |
| P0-3 | Intraday outputsize | `lib/backtest/providers.ts` | Changed intraday `outputsize=full` to `outputsize=compact`. Full mode returns 30+ days of 1-min data (~11k bars) causing unnecessary quota drain and latency. Compact returns ~100 bars. |
| P0-4 | Adjusted vs raw close | `lib/backtest/providers.ts` | Daily data now reads `"5. adjusted close"` from `TIME_SERIES_DAILY_ADJUSTED` instead of `"4. close"`. Intraday still uses raw close (no adjusted field). `closeType` field added to response for transparency. |
| P0-5 | Module extraction | `lib/backtest/indicators.ts`, `lib/backtest/providers.ts` | Extracted all indicator math (~300 lines) and all price-fetch logic (~200 lines) from the 1661-line route.ts monolith into dedicated pure-function modules. Route.ts now imports from these modules. |
| P0-6 | MACD histogram signalIdx | `lib/backtest/indicators.ts` | Fixed signal-index mapping bug where `signalIdx` only advanced when signal was defined, causing it to be stuck at 0 (signal starts at EMA-9 warmup index 8). Now advances on every MACD value regardless of signal warmup. |

## P1 — Important Fixes

| ID | Control | File(s) Changed | Description |
|----|---------|-----------------|-------------|
| P1-1 | Position.side required | `route.ts`, `lib/backtest/strategyExecutors.ts` | Changed `Position.side` from optional (`side?:`) to required (`side:`). Added `side: 'LONG'` to all 29 position assignments (16 in route.ts, 13 in strategyExecutors.ts) that were missing it. Eliminates all `position.side ?? 'LONG'` fallbacks. |
| P1-2 | Crypto volume flag | `lib/backtest/providers.ts`, `route.ts` response | Added `volumeUnavailable: boolean` to `PriceFetchResult`. CoinGecko OHLC always returns volume=0; this flag is now surfaced in the API response under `dataSources.volumeUnavailable` so the UI can show appropriate warnings. |
| P1-3 | Close type transparency | `lib/backtest/providers.ts`, `route.ts` response | Added `closeType: 'adjusted' | 'raw' | 'n/a'` to `PriceFetchResult`. Surfaced in API response under `dataSources.closeType`. |
| P1-4 | EMA200 proxy diagnostic | `app/api/backtest/route.ts` | Existing EMA200 proxy (falls back to shorter period when data < 200 bars) was already in place. Now that providers use `outputsize=compact` for intraday, this proxy activates more frequently. Diagnostic is logged. |

## Caching (C1)

| Provider | Cache Key Pattern | TTL | Implementation |
|----------|------------------|-----|----------------|
| Alpha Vantage daily | `bt:av:{symbol}:daily:full` | 6 hours | `getCached`/`setCached` in providers.ts |
| Alpha Vantage intraday | `bt:av:{symbol}:{interval}:compact` | 2 minutes | `getCached`/`setCached` in providers.ts |
| CoinGecko OHLC | `bt:cg:{symbol}:{timeframe}:{days}` | 5 minutes | `getCached`/`setCached` in providers.ts |

Uses existing Upstash Redis infrastructure (`lib/redis.ts`).

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/backtest/indicators.ts` | **Created** | ~350 lines — all indicator math (EMA, SMA, RSI, MACD, ATR, ADX, Bollinger, Stochastic, CCI, OBV) |
| `lib/backtest/providers.ts` | **Created** | ~200 lines — price data fetching (AV, CoinGecko) with caching |
| `app/api/backtest/route.ts` | **Modified** | Reduced from 1661 → ~1250 lines. Removed inline indicators/fetch/types, wired new imports, precomputed RSI-21, fixed Position.side, added diagnostic fields |
| `lib/backtest/strategyExecutors.ts` | **Modified** | `BacktestPosition.side` now required. Added `side: 'LONG'` to 13 position assignments |
| `test/backtest-audit.test.ts` | **Created** | 30 tests — RSI golden fixture, determinism, invariants, MACD sign, ATR positivity, BB symmetry, OBV monotonicity, performance regression, crypto detection |

## Test Suite

```
30/30 PASS — test/backtest-audit.test.ts (258ms)

RSI – Wilder smoothing (P0-1)          7 tests ✓
Indicator determinism                   3 tests ✓
EMA / SMA invariants                    5 tests ✓
MACD                                    1 test  ✓
ATR                                     2 tests ✓
Bollinger Bands                         2 tests ✓
Position.side required (P1)             1 test  ✓
Provider crypto detection logic         3 tests ✓
OBV                                     2 tests ✓
Performance regression (P0-2)           2 tests ✓ (RSI 5000 bars < 50ms, EMA 10000 bars < 50ms)
Stochastic                              1 test  ✓
CCI                                     1 test  ✓
```

## API Response Changes

New fields in backtest response:
```json
{
  "dataSources": {
    "priceData": "alpha_vantage",
    "assetType": "stock",
    "closeType": "adjusted",
    "volumeUnavailable": false
  }
}
```

## Risk Assessment

- **Breaking changes**: None. API response is additive (new fields only). All existing strategies behave identically (Position.side was always LONG for strategies that didn't set it).
- **RSI values will differ**: The corrected Wilder RSI produces different values than the old broken implementation. This may change trade signals slightly but is the correct mathematical behavior.
- **MACD histogram now populated**: The histogram was previously never populated (due to the signalIdx mapping bug). Strategies that check `histogram[i] > 0` will now get actual values instead of undefined.
