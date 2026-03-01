# TradingView Session & Candle Boundary Audit (v2)

**Date:** 2025-07-14 (revised 2025-07-14)  
**Sources:** TradingView Pine Script v6 Documentation (Sessions, Time concepts), TradingView Support articles  
**Purpose:** Verify our `sessionCloseEngine.ts` against TradingView's actual candle construction behaviour  
**Status:** v2 — tightened after peer review; corrected over-claims, added implementation-level detail

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

**Important caveat:** `session.extended` is defined by the exchange/instrument properties on TradingView. 04:00-20:00 ET is the common default for most US equities, but some venues/instruments may differ. Our templates use this as a sensible default, not as a universal guarantee for every equity.

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

### 1.7 Quick Visual Test Protocol (5 minutes, removes all doubt)

On TradingView for any US equity (e.g. AAPL):

1. Set Timezone = Exchange
2. Toggle **Extended hours ON** → check 1h bars: closes should be on the hour (10:00, 11:00, 12:00 ...)
3. Toggle **Extended hours OFF** → check 1h bars: closes should be at :30 (10:30, 11:30, 12:30 ...)
4. Check 4h: Extended → 08:00, 12:00, 16:00, 20:00; Regular → 13:30, 16:00
5. If our engine produces the same next-close times for the same "now", the core is correct.

---

## 2. Our Session Close Engine — Architecture & Implementation Detail

### 2.1 Session Templates (`sessionCloseEngine.ts`)

| Mode | Anchor | Session Open | Session Close | Match TradingView? |
|---|---|---|---|---|
| `regular` | 09:30 ET | 09:30 ET | 16:00 ET | ✅ Exact match |
| `extended` | 04:00 ET | 04:00 ET | 20:00 ET | ✅ Match for most US equities (see §1.3 caveat) |
| `full` | 00:00 ET | 00:00 ET | 24:00 ET | ✅ (for testing only) |

### 2.2 Two-Layer Architecture

The engine has a **two-layer** design:

**Layer 1 — `computeNextCloseFromAnchor()` (raw math, no clamping):**
```
nextClose = anchor + ceil(minutesSinceAnchor / tfMinutes) × tfMinutes
```
This is a pure geometric calculation. It can return times past session close (e.g. 17:30 ET for regular 4h at 14:00).

**Layer 2 — `getNextCloseIntraday()` (public API, adds session clamping + weekend stepping):**
```typescript
// Inside session → compute from anchor, then clamp
const result = computeNextCloseFromAnchor(now, anchorToday, tfMinutes);
if (result.nextCloseAt.getTime() >= sessionCloseToday.getTime()) {
  // CLAMP: return session close instead of the raw boundary
  return { nextCloseAt: sessionCloseToday, minsToClose: minsToSessionClose };
}

// Outside session → weekend stepping:
// Friday after close → +3 days (Monday)
// Saturday → +2 days (Monday)
// Sunday → +1 day (Monday)
// Weekday after close → +1 day (tomorrow)
```

**Clamping is implemented** in `getNextCloseIntraday()` (lines 196-199), not in the raw computation function. All public consumers call `getNextCloseIntraday()`, so truncated final bars work correctly.

**Weekend stepping is implemented** in `getNextCloseIntraday()` (lines 206-219). The engine correctly skips Sat/Sun.

### 2.3 What IS NOT Implemented (known gaps)

| Gap | Impact | Risk |
|---|---|---|
| **Exchange holidays** (Christmas, Independence Day, etc.) | Engine will compute a close for a day the market is actually closed | Medium — affects ~9 days/year |
| **Half days / early closes** (day before Thanksgiving, etc.) | Engine uses the standard 16:00/20:00 close, but market closes early | Low — affects ~3 days/year |
| **DST transition edge case** | `zonedTimeToUtc()` uses the offset at `refDate`, but on DST transition days the target HH:MM may fall in the other offset window | Low — affects 2 transitions/year, only during overnight window |
| **Non-standard extended hours** | Some instruments may have different extended session times than 04:00-20:00 | Low — 04:00-20:00 covers the vast majority of US equities |

### 2.4 DST Handling — Detailed Assessment

The engine uses `Intl.DateTimeFormat` for timezone resolution, which correctly handles DST for the vast majority of cases. The specific concern:

`zonedTimeToUtc(refDate, tz, hh, mm)` computes `getTzOffsetMinutes(refDate, tz)` using the offset at `refDate`. If `refDate` is 1:30 AM ET on a spring-forward day and the target time is 09:30 AM ET, the offset may have changed between those two times (-5h → -4h). This would produce a 1-hour error.

**Practical impact:** Very low. The engine is called during active market hours (4:00-20:00 ET) when DST has already taken effect. Spring-forward happens at 2:00 AM, well before any session opens. The edge case can only bite if the engine is called overnight on a DST transition night.

**Verdict:** ✅ Mostly correct. If rock-solid overnight correctness is needed, migrate to Temporal API or `date-fns-tz`.

---

## 3. Traced Examples

### Example A: Extended 4h at 10:00 AM ET (Tuesday)
- Anchor: 04:00 ET
- Minutes since anchor: 360
- periods = ceil(360/240) = 2
- Raw boundary = 04:00 + 480min = 12:00 ET (within session → no clamp)
- Next close = **12:00 ET**
- TradingView shows: **12:00 ET** ✅

### Example B: Regular 4h at 2:00 PM ET (Tuesday)
- Anchor: 09:30 ET
- Minutes since anchor: 270
- periods = ceil(270/240) = 2
- Raw boundary = 09:30 + 480min = **17:30 ET** (past session close!)
- **Clamped by `getNextCloseIntraday()`** → **16:00 ET**
- TradingView shows: **16:00 ET** ✅ (truncated 2.5h bar: 13:30→16:00)

### Example C: Regular 1h at 09:45 AM ET
- Anchor: 09:30 ET
- Minutes since anchor: 15
- periods = ceil(15/60) = 1
- Next close = 09:30 + 60min = **10:30 ET** (within session → no clamp)
- TradingView shows: **10:30 ET** ✅

### Example D: Extended 1h at 09:45 AM ET
- Anchor: 04:00 ET
- Minutes since anchor: 345
- periods = ceil(345/60) = 6
- Next close = 04:00 + 360min = **10:00 ET** (within session → no clamp)
- TradingView shows: **10:00 ET** ✅

> **Key difference:** Same wall-clock time (09:45), different session modes → 10:30 (regular) vs 10:00 (extended). This is exactly what TradingView produces.

### Example E: Extended 2h at 11:15 AM ET
- Anchor: 04:00 ET
- Minutes since anchor: 435
- periods = ceil(435/120) = 4
- Next close = 04:00 + 480min = **12:00 ET** (within session → no clamp)
- TradingView shows: **12:00 ET** ✅

### Example F: Regular 2h at 3:45 PM ET
- Anchor: 09:30 ET
- Minutes since anchor: 375
- periods = ceil(375/120) = 4
- Raw boundary = 09:30 + 480min = **17:30 ET** (past session close!)
- **Clamped** → **16:00 ET**
- TradingView shows: **16:00 ET** ✅

### Example G: Saturday 2:00 PM ET (weekend skip)
- `z.dayOfWeek === 6` → `daysAhead = 2` (Monday)
- Next anchor = Monday 04:00 ET (extended) or 09:30 ET (regular)
- First close = anchor + tfMinutes
- ✅ Correctly skips to Monday

### Example H: Friday 5:00 PM ET, extended mode (after session close)
- `z.dayOfWeek === 5`, nowMs >= sessionClose (20:00)
- `daysAhead = 3` → Monday
- ✅ Correctly skips to Monday

---

## 4. Complete Candle Schedule Per Session Mode

### 4.1 Extended Mode (04:00 → 20:00 ET, 960 minutes)

| TF | Candle close times | Bars/day | Last bar |
|---|---|---|---|
| **5m** | 04:05, 04:10, ..., 19:55, **20:00** | 192 | Full |
| **15m** | 04:15, 04:30, ..., 19:45, **20:00** | 64 | Full |
| **30m** | 04:30, 05:00, ..., 19:30, **20:00** | 32 | Full |
| **1h** | 05:00, 06:00, ..., 19:00, **20:00** | 16 | Full |
| **2h** | 06:00, 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, **20:00** | 8 | Full |
| **4h** | 08:00, 12:00, 16:00, **20:00** | 4 | Full |

> Extended mode divides perfectly for all standard TFs (960 is divisible by 5, 15, 30, 60, 120, 240).

### 4.2 Regular Mode (09:30 → 16:00 ET, 390 minutes)

| TF | Candle close times | Bars/day | Last bar |
|---|---|---|---|
| **5m** | 09:35, 09:40, ..., 15:55, **16:00** | 78 | Full |
| **15m** | 09:45, 10:00, ..., 15:45, **16:00** | 26 | Full |
| **30m** | 10:00, 10:30, ..., 15:30, **16:00** | 13 | Full |
| **1h** | 10:30, 11:30, 12:30, 13:30, 14:30, 15:30, **16:00** | 7 | **30 min** (truncated) |
| **2h** | 11:30, 13:30, 15:30, **16:00** | 4 | **30 min** (truncated) |
| **4h** | 13:30, **16:00** | 2 | **150 min** (truncated) |

> Regular mode produces truncated final bars for 1h, 2h, and 4h because 390 doesn't divide evenly by 60, 120, or 240. Clamping in `getNextCloseIntraday()` handles this.

---

## 5. Issues Found & Status

### 5.1 ✅ Core Intraday Engine: CORRECT (for normal trading days)

`getNextCloseIntraday()` correctly implements TradingView's candle construction:
- **Anchor from session open:** `computeNextCloseFromAnchor()` uses session-specific anchor (09:30/04:00/00:00)
- **Truncated final bar:** `getNextCloseIntraday()` clamps at session close (lines 196-199)
- **Weekend skip:** `getNextCloseIntraday()` advances Fri-after-close→Mon, Sat→Mon, Sun→Mon (lines 206-219)

Architecture note: clamping and weekend logic live in the public `getNextCloseIntraday()` wrapper, not in the raw `computeNextCloseFromAnchor()`. All external consumers call the public function, so this is correct.

Caveat: correctness applies to normal trading days only. Holidays and early closes are not handled (see §5.3).

### 5.2 ✅ Fixed: Forward Close Calendar `sessionMode` Pass-Through

Previously `computeForwardCloseCalendar()` hardcoded `'extended'`. Now accepts and threads `sessionMode` through to `getMinutesToTimeframeClose()`. Calendar API endpoint also reads `sessionMode` from request body.

**This was the primary cause of "days don't add up"** — comparing extended-hours engine output against regular-hours TradingView charts.

### 5.3 ❌ NOT IMPLEMENTED: Exchange Holidays & Half Days

The engine does not know about exchange holidays (Christmas, MLK Day, etc.) or early close days (day before Thanksgiving at 13:00 ET). On these days:
- **Holiday:** engine will compute a close for a day the market is actually closed
- **Half day:** engine will use standard session close (16:00/20:00) when market actually closes early

**Impact:** ~9 holidays + ~3 half days per year.

**TODO:** Add a market calendar module (static holiday list or API-sourced) that `getNextCloseIntraday()` checks before computing boundaries.

### 5.4 ⚠️ MOSTLY OK: DST Transition Edge Case

`zonedTimeToUtc()` uses the UTC offset at `refDate` to convert a target local time to UTC. On DST transition days, the target time may fall in a different offset window.

**Practical impact:** Very low. US DST transitions occur at 2:00 AM ET, well before any session opens (04:00 extended, 09:30 regular). The engine would only be affected if called overnight during the transition window, which is outside all session modes.

**Verdict:** ✅ for active-market use (when users actually run scans). If rock-solid overnight correctness is needed, migrate to `Temporal` API or `date-fns-tz`.

### 5.5 ⚠️ UNVERIFIED: Multi-Day Candle Cycle Alignment (2D, 3D, 4D, 5D, 6D, 7D)

The daily+ close computation in `getMinutesToTimeframeClose()` uses `daysSinceEpoch % N` with epoch = Jan 1, 2020. TradingView's multi-day candle alignment is not well-documented and may use different cycle boundaries.

**Status:** Unverified. Requires direct TradingView A/B tests per symbol/timezone/session.

**Recommendation:**
- For equities: ideally align to "every N trading days" using a trading calendar
- For crypto: UTC boundaries (simpler, already correct)
- 1D, 1W, 1M boundaries are well-defined and correct

### 5.6 ⚠️ NOTE: Extended Session Timing Is a Sensible Default, Not Universal

04:00-20:00 ET covers the vast majority of US equities on TradingView, but `session.extended` is exchange/instrument-specific. Some venues or instruments may have different extended-hours windows.

Our templates are a correct default for NASDAQ/NYSE-listed stocks, which is our primary use case.

---

## 6. Summary Matrix

| Aspect | TradingView | Our Engine | Where Implemented | Status |
|---|---|---|---|---|
| Regular session | 09:30-16:00 ET | 09:30-16:00 ET | `US_EQUITY_SESSIONS.regular` | ✅ Match |
| Extended session | 04:00-20:00 ET (most) | 04:00-20:00 ET | `US_EQUITY_SESSIONS.extended` | ✅ Match (default) |
| Anchor from session open | Yes | Yes | `computeNextCloseFromAnchor()` | ✅ Match |
| Truncated final bar | Yes | Yes | `getNextCloseIntraday()` clamp (L196-199) | ✅ Match |
| 1h regular closes | 10:30, 11:30, ..., 15:30, 16:00 | Same | Anchor + clamp | ✅ Match |
| 4h regular closes | 13:30, 16:00 | Same | Anchor + clamp | ✅ Match |
| 4h extended closes | 08:00, 12:00, 16:00, 20:00 | Same | Anchor (no clamp needed) | ✅ Match |
| Weekend skip | Mon-Fri only | Mon-Fri only | `getNextCloseIntraday()` (L206-219) | ✅ Match |
| Exchange holidays | Closed | Not skipped | Not implemented | ❌ TODO |
| Half days / early closes | Early session end | Not handled | Not implemented | ❌ TODO |
| DST handling | IANA tz auto | `Intl.DateTimeFormat` | `getZonedParts()` + `zonedTimeToUtc()` | ✅ Mostly (2AM edge) |
| Calendar `sessionMode` | N/A | Now threaded | `computeForwardCloseCalendar()` + API | ✅ Fixed |
| Multi-day cycles (2D-7D) | Provider-specific | Epoch-modular | `getMinutesToTimeframeClose()` | ⚠️ Unverified |
| Extended hours universality | Exchange-specific | Hardcoded 04:00-20:00 | `US_EQUITY_SESSIONS` | ⚠️ Default only |

---

## 7. TradingView Documentation References

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

## 8. Conclusion

**The core intraday session close engine is TradingView-accurate for normal trading days.** The anchor-based candle boundary computation, session-end clamping, weekend stepping, and timezone handling all match TradingView's documented behaviour.

**Where it's correct:**
- Intraday candle boundaries (5m through 4h) for both regular and extended modes
- Truncated final bars (clamped in `getNextCloseIntraday()`)
- Weekday/weekend scheduling (Sat/Sun → Monday)
- DST handling (correct during active market hours)

**Where it has known gaps:**
- Exchange holidays (~9/year) — engine computes a close for days the market is closed
- Half/early close days (~3/year) — engine uses standard session end
- Multi-day candle alignment — unverified against TradingView
- Extended hours timing — hardcoded to 04:00-20:00, which is a default not universal

**Root cause of "days don't add up":**
The Forward Close Calendar was always using `'extended'` session boundaries regardless of what the user had selected. This has been fixed — `sessionMode` is now threaded through the calendar function and API endpoint.

---

## 9. TODO Backlog (from this audit)

- [ ] **Market holiday calendar** — static list of NYSE/NASDAQ closures; skip in `getNextCloseIntraday()`
- [ ] **Early close days** — partial day list (13:00 ET close); override session end
- [ ] **DST stress test** — run engine at 1:00 AM, 2:30 AM, 3:00 AM on March/November transition days
- [ ] **Multi-day TradingView A/B test** — compare 2D/3D candle boundaries on AAPL with our output
- [ ] **Per-instrument session lookup** — future: read extended session times from data source instead of hardcoding
