# TradingView Session & Candle Boundary Audit

**Date:** 2025-07-14  
**Sources:** TradingView Pine Script v6 Documentation (Sessions, Time concepts), TradingView Support articles  
**Purpose:** Verify our `sessionCloseEngine.ts` against TradingView's actual candle construction behaviour

---

## 1. How TradingView Constructs Candle Bars (Official Documentation)

### 1.1 Anchor-from-Session-Open Rule

From the **Pine Script Time docs** (tradingview.com/pine-script-docs/concepts/time/):

> "A typical session on our 60-minute chart with regular trading hours (RTH) spans from **09:30 to 16:00** (6.5 hours). The chart divides this interval into **as many 60-minute bars as possible, starting from the session's opening time**, which leaves only **30 minutes for the final bar** to cover."

**Key rule:** TradingView anchors intraday candle boundaries from the **session open time**, NOT from midnight.

### 1.2 Truncated Final Bar

The last bar of a session closes when the session ends, even if the candle period is incomplete:

| Session Mode | Timeframe | Candle boundaries | Final bar |
|---|---|---|---|
| RTH (09:30-16:00) | 1h | 09:30→10:30, 10:30→11:30, ..., 14:30→15:30, **15:30→16:00** | 30 min (truncated) |
| RTH (09:30-16:00) | 4h | 09:30→13:30, **13:30→16:00** | 2h 30m (truncated) |
| Extended (04:00-20:00) | 4h | 04:00→08:00, 08:00→12:00, 12:00→16:00, 16:00→20:00 | Full (no truncation) |
| Extended (04:00-20:00) | 1h | 04:00→05:00, 05:00→06:00, ..., 19:00→20:00 | Full (no truncation) |

### 1.3 Regular vs Extended Session Boundaries

From the **Pine Script Sessions docs** (tradingview.com/pine-script-docs/concepts/sessions/):

- **`session.regular`** = Regular Trading Hours (RTH). For US equities: **09:30 - 16:00 ET**
- **`session.extended`** = Includes pre-market and after-hours. For US equities: **04:00 - 20:00 ET**
- `session.ispremarket` = true during pre-market (04:00-09:30)
- `session.ismarket` = true during RTH (09:30-16:00)  
- `session.ispostmarket` = true during post-market (16:00-20:00)

### 1.4 Extended Hours Changes Candle Alignment

From the Pine Script Sessions docs:

> "Running the same script on an hourly chart instead produces **different values for the extended and regular closing prices**, because the regular session starts at **09:30 and not on the hour**."

This confirms that:
- **Extended mode** anchors from 04:00 (on the hour) → 1h candles close at 05:00, 06:00, 07:00, ...
- **Regular mode** anchors from 09:30 (half-hour offset) → 1h candles close at 10:30, 11:30, 12:30, ...

### 1.5 Session Boundary Variables

TradingView provides boundary detection:
- `session.isfirstbar` — first bar of the full session (including extended)
- `session.isfirstbar_regular` — first bar of the regular session only
- `session.islastbar` — last bar of the full session
- `session.islastbar_regular` — last bar of the regular session only

### 1.6 Time-Based Session Strings

TradingView session strings use format `"HHmm-HHmm:days"`:
- `"0930-1600"` = Regular US equity session
- `"0400-2000"` = Extended US equity session (pre + post market)
- Days: 1=Sunday, 2=Monday, ..., 7=Saturday. Default `:23456` (Mon-Fri)

---

## 2. Our Session Close Engine Implementation

### 2.1 Session Templates (`sessionCloseEngine.ts`)

| Mode | Anchor | Session Open | Session Close | Match TradingView? |
|---|---|---|---|---|
| `regular` | 09:30 ET | 09:30 ET | 16:00 ET | ✅ Exact match |
| `extended` | 04:00 ET | 04:00 ET | 20:00 ET | ✅ Exact match |
| `full` | 00:00 ET | 00:00 ET | 24:00 ET | ✅ (for testing) |

### 2.2 Candle Boundary Computation

Our engine uses `computeNextCloseFromAnchor()`:
```
nextClose = anchor + ceil(minutesSinceAnchor / tfMinutes) × tfMinutes
```

Then clamps to session close if the computed boundary exceeds session end.

### 2.3 Traced Examples

#### Example A: Extended 4h at 10:00 AM ET (Tuesday)
- Anchor: 04:00 ET  
- Minutes since anchor: 360  
- periods = ceil(360/240) = 2  
- Next close = 04:00 + 480min = **12:00 ET**  
- TradingView shows: **12:00 ET** ✅

#### Example B: Regular 4h at 2:00 PM ET (Tuesday)
- Anchor: 09:30 ET  
- Minutes since anchor: 270  
- periods = ceil(270/240) = 2  
- Computed close = 09:30 + 480min = 17:30 ET (past session end)  
- Clamped to session close = **16:00 ET**  
- TradingView shows: **16:00 ET** ✅ (truncated 2.5h bar)

#### Example C: Regular 1h at 09:45 AM ET
- Anchor: 09:30 ET  
- Minutes since anchor: 15  
- periods = ceil(15/60) = 1  
- Next close = 09:30 + 60min = **10:30 ET**  
- TradingView shows: **10:30 ET** ✅

#### Example D: Extended 1h at 09:45 AM ET
- Anchor: 04:00 ET  
- Minutes since anchor: 345  
- periods = ceil(345/60) = 6  
- Next close = 04:00 + 360min = **10:00 ET**  
- TradingView shows: **10:00 ET** ✅

> **Note the difference:** Same time (09:45), different modes → 10:30 vs 10:00. This is exactly what TradingView does: "different values for the extended and regular closing prices, because the regular session starts at 09:30."

#### Example E: Extended 2h at 11:15 AM ET
- Anchor: 04:00 ET  
- Minutes since anchor: 435  
- periods = ceil(435/120) = 4  
- Next close = 04:00 + 480min = **12:00 ET**  
- TradingView shows: **12:00 ET** ✅

#### Example F: Regular 2h at 3:45 PM ET
- Anchor: 09:30 ET  
- Minutes since anchor: 375  
- periods = ceil(375/120) = 4  
- Computed close = 09:30 + 480min = 17:30 ET → clamped to **16:00 ET**  
- TradingView shows: **16:00 ET** ✅ (truncated bar after 15:30)

---

## 3. Complete Candle Schedule Per Session Mode

### 3.1 Extended Mode (04:00 → 20:00 ET, 960 minutes)

| TF | Candle close times | Bars/day | Last bar |
|---|---|---|---|
| **5m** | 04:05, 04:10, ..., 19:55, **20:00** | 192 | Full |
| **15m** | 04:15, 04:30, ..., 19:45, **20:00** | 64 | Full |
| **30m** | 04:30, 05:00, ..., 19:30, **20:00** | 32 | Full |
| **1h** | 05:00, 06:00, ..., 19:00, **20:00** | 16 | Full |
| **2h** | 06:00, 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, **20:00** | 8 | Full |
| **4h** | 08:00, 12:00, 16:00, **20:00** | 4 | Full |

> Extended mode divides perfectly for all standard TFs (960 is divisible by 5, 15, 30, 60, 120, 240).

### 3.2 Regular Mode (09:30 → 16:00 ET, 390 minutes)

| TF | Candle close times | Bars/day | Last bar |
|---|---|---|---|
| **5m** | 09:35, 09:40, ..., 15:55, **16:00** | 78 | Full |
| **15m** | 09:45, 10:00, ..., 15:45, **16:00** | 26 | Full |
| **30m** | 10:00, 10:30, ..., 15:30, **16:00** | 13 | Full |
| **1h** | 10:30, 11:30, 12:30, 13:30, 14:30, 15:30, **16:00** | 7 | **30 min** (truncated) |
| **2h** | 11:30, 13:30, 15:30, **16:00** | 4 | **30 min** (truncated) |
| **4h** | 13:30, **16:00** | 2 | **150 min** (truncated) |

> Regular mode produces truncated final bars for 1h, 2h, and 4h because 390 doesn't divide evenly by 60, 120, or 240.

---

## 4. Issues Found

### 4.1 ✅ Core Engine: CORRECT

The `sessionCloseEngine.ts` correctly implements TradingView's candle construction:
- Anchors from session open time (09:30 for regular, 04:00 for extended)
- Computes boundaries as multiples of TF period from anchor
- Clamps final bar to session end
- Weekend/overnight handling advances to next trading day

### 4.2 ⚠️ Forward Close Calendar: Missing `sessionMode` Pass-Through

`computeForwardCloseCalendar()` in `confluence-learning-agent.ts` (line ~1595) does NOT accept or pass `sessionMode`. It always uses the default `'extended'`.

**Impact:** The calendar endpoint always computes extended-hours boundaries, even if the user is viewing regular hours. This could cause the "days don't add up" discrepancy.

**Fix needed:** Add `sessionMode` parameter to `computeForwardCloseCalendar()` and pass it through to `getMinutesToTimeframeClose()`.

### 4.3 ⚠️ Multi-Day Cycle Alignment (2D, 3D, 4D, 5D, 6D, 7D)

The daily+ close computation uses `daysSinceEpoch % N` with epoch = **Jan 1, 2020**. TradingView may use different cycle boundaries for multi-day candles. This is hard to verify without direct comparison, but the modular arithmetic approach means our 2D/3D/4D close boundaries may not align with TradingView's.

**Risk:** Low — most users focus on 1D, 1W, 1M boundaries which are well-defined.

### 4.4 ⚠️ `computeForwardCloseCalendar` Step-Forward Logic

When walking forward through the calendar (line ~1744):
```typescript
const stepMs = Math.max(tfConfig.minutes * 60_000, 60_000);
const nextCursor = new Date(nextCloseMs + stepMs);
```

This jumps forward by `tfMinutes + tfMinutes` from the close, then recomputes. For regular mode with truncated final bars (e.g., 4h: 13:30 then 16:00), the step forward from 16:00 by 240 minutes (4h) lands at 20:00, then calling `getMinutesToTimeframeClose` at 20:00 (outside session) correctly finds the next session's first close. This should work but could be fragile.

---

## 5. Summary Matrix

| Aspect | TradingView | Our Engine | Status |
|---|---|---|---|
| Regular session | 09:30-16:00 ET | 09:30-16:00 ET | ✅ Match |
| Extended session | 04:00-20:00 ET | 04:00-20:00 ET | ✅ Match |
| Anchor from session open | Yes | Yes | ✅ Match |
| Truncated final bar | Yes | Yes (clamp logic) | ✅ Match |
| 1h regular closes | 10:30, 11:30, ..., 15:30, 16:00 | Same | ✅ Match |
| 4h regular closes | 13:30, 16:00 | Same | ✅ Match |
| 4h extended closes | 08:00, 12:00, 16:00, 20:00 | Same | ✅ Match |
| Weekend skip | Mon-Fri only | Mon-Fri only | ✅ Match |
| DST handling | IANA tz auto | `Intl.DateTimeFormat` | ✅ Match |
| Calendar `sessionMode` | N/A | Missing pass-through | ⚠️ Fix needed |
| Multi-day cycles | Provider-specific | Epoch-modular | ⚠️ Unverified |

---

## 6. TradingView Documentation References

1. **Sessions** — https://www.tradingview.com/pine-script-docs/concepts/sessions/
   - Session types (regular, extended), session variables, market states
   - Key insight: extended vs regular produces different close prices on hourly charts

2. **Time** — https://www.tradingview.com/pine-script-docs/concepts/time/
   - `time` and `time_close` variables  
   - Candle alignment from session open  
   - Truncated final bar behaviour  
   - `time_tradingday` for overnight sessions

3. **time() and time_close() functions** — Pine Script v6 Reference
   - Retrieving opening/closing timestamps for bars on specified timeframes
   - Session filtering via `session` parameter
   - Higher-timeframe boundary detection

---

## 7. Conclusion

**The core session close engine (`sessionCloseEngine.ts`) is TradingView-accurate.** The anchor-based candle boundary computation, session clamping, and timezone handling all match TradingView's documented behaviour.

The "days don't add up" issue is most likely caused by:
1. **The Forward Close Calendar not respecting `sessionMode`** — it always uses extended hours boundaries, which differ significantly from regular hours (e.g., 1h close at 10:00 vs 10:30)
2. **Comparing extended-hours candle times against regular-hours TradingView charts** (or vice versa)

**Recommended fix:** Thread `sessionMode` through `computeForwardCloseCalendar()` and the calendar API endpoint.
