# MSP Institutional Day Trading Workflow — Gap Analysis

**Date:** 2026-02-22  
**Scope:** Full audit of codebase against the Institutional Day Trading Operating Manual

---

## Executive Summary

**16 systems audited** across Operator, Scanner, Journal, Risk Governor, and supporting infrastructure.

| Category | Count |
|----------|-------|
| ✅ Fully Implemented | 12 |
| ⚠️ Partially Implemented | 3 |
| ❌ Not Implemented | 9 |

---

## ✅ FULLY IMPLEMENTED (No Action Required)

### 1. Unified Regime Classifier (3 Taxonomies)
- **Files:** `lib/regime-classifier.ts`, `lib/ai/regimeScoring.ts`
- Governor (6 types), Scoring (5 types), Institutional (6 types) — all produced by single `classifyRegime()` call
- `deriveRegimeConfidence()` with multi-signal agreement scoring (ADX/RSI/Aroon/MTF)

### 2. Permission Matrix (Strategy × Direction Grid)
- **File:** `lib/risk-governor-hard.ts` (467 lines)
- 6 regimes × 6 strategies × 2 directions with 4 permission levels (ALLOW/ALLOW_REDUCED/ALLOW_TIGHTENED/BLOCK)
- Rendered as 4-row table with `PermissionChip` on operator page

### 3. Capital Control Strip
- **File:** `components/risk/CapitalControlStrip.tsx`
- Sticky bar: Risk Mode, Remaining Daily R (+ $), Open Risk R, Data Health, Rule Guard toggle, Locked banner

### 4. Risk Governor (Hard + Institutional + Operator)
- **Files:** `lib/risk-governor-hard.ts`, `lib/institutional-risk-governor.ts`, `lib/operator/riskGovernor.ts`
- Full sizing chain: Base × Mode × Flow × Governor × Performance = Final
- Stop validation, correlation enforcement, cognitive load gates

### 5. Crypto Morning Decision Card
- **File:** `components/CryptoMorningDecisionCard.tsx` (255 lines)
- Binary deployment gate (YES/CONDITIONAL/NO) with sub-cluster permissions (Large Caps, Mid/Alts, Meme, DeFi)
- Hard blocks for longs/shorts, adaptive confidence scoring

### 6. Adaptive Personality System
- **Files:** `components/AdaptivePersonalityCard.tsx`, `components/AdaptiveTraderPersonalityBar.tsx`, `lib/operator/adaptiveReality.ts`
- Profile fetch, institutional filter results, 5 experience modes with full directive sets

### 7. Daily AI Market Focus
- **File:** `components/DailyAIMarketFocus.tsx` (285 lines)
- AI-curated picks with score badges (Trend-Favored/Neutral/Risk-Off), staleness detection

### 8. Pre-Trade Checklist Modal
- **File:** `components/scanner/PreTradeChecklistModal.tsx`
- 3 mandatory checks: thesis documented, risk defined, event window reviewed. Button disabled until all checked.

### 9. Auto-Journal Logging with Cooldown
- **Location:** Scanner page (lines 862–915) + `/api/journal/auto-log`
- Configurable threshold (default 72), per-symbol cooldown, deduplication key

### 10. Journal Close Flow (All 5 Fields)
- **File:** `components/journal/modals/CloseTradeModal.tsx`
- Close reason (7 options), Outcome (4), Setup quality (A-D), Followed plan (bool), Error type (11 options)

### 11. Journal KPI Bar (All 7 Metrics)
- **File:** `components/journal/layer1/JournalKpiRow.tsx`
- Realized P&L, Win Rate, Profit Factor, Max Drawdown, Avg MFE, Avg MAE, Avg R-multiple

### 12. Risk Application Overlay
- **File:** `components/risk/RiskApplicationOverlay.tsx` (259 lines)
- Normalized vs live R-curves, distribution histogram, throttle breakdown, risk efficiency ratio

---

## ⚠️ PARTIALLY IMPLEMENTED (Needs Enhancement)

### 13. evaluateRiskIntent() — Advisory Only
- **Current:** Called on Deploy from Rank, but BLOCK result is logged as warning, not enforced
- **Spec requires:** Hard enforcement — entry button should be removed/disabled when BLOCK is returned
- **Impact:** HIGH — A trader can override the governor by proceeding past the warning
- **Fix:** Make BLOCK permission result abort the deploy flow; remove the trade entry action when governor returns BLOCK

### 14. Pre-Trade Behavioral Screen — Backend Only
- **Current:** `overtradingBlocked` computed in `lib/institutional-risk-governor.ts` when `tradesThisSession > 6 && expectancyR < 0`
- **Spec requires:** User-facing modal: "You have taken X trades in the last 60 minutes. Your 30-day average is Y trades per session. Proceeding?"
- **Fix:** Add a `BehavioralScreenModal` component shown before deploy when trade frequency exceeds rolling average

### 15. Session Phase Overlay — Engine Only, No UI
- **Current:** `lib/ai/sessionPhase.ts` fully computes phases and multipliers, but no visual widget on operator or scanner
- **Spec requires:** Visible session phase indicator showing current phase, strategy multiplier adjustments, and favorable/unfavorable status
- **Fix:** Add `SessionPhaseStrip` component to operator page and scanner page

---

## ❌ NOT IMPLEMENTED (Must Build)

### 16. Rule Guard Cooldown on Disable
- **Current:** Rule Guard toggles instantly via Settings page → PUT API
- **Spec requires:**
  1. 10-minute delay before disable takes effect
  2. Halve the daily R budget while guard is disabled
  3. Audit trail of disable events
  4. 24-hour auto-re-enable (exists) should compound with these new constraints
- **Severity:** HIGH — The 24-hour window is "enough to destroy a month's P&L"

### 17. Daily Trade Count Hard Limit
- **Current:** Only R-based limits exist (remaining daily R, dampener)
- **Spec requires:** Configurable max trades per day (default: 8 equities, 12 crypto) with hard gate after limit
- **Severity:** MEDIUM — Prevents overtrading in low-risk increments that slip under R budget

### 18. Bulk Scan — Show Top 3-5 by Default
- **Current:** Bulk scan renders all results (up to 10) immediately
- **Spec requires:** Show only top 3-5 by default, require explicit "Show More" to see rest
- **Rationale:** Reduces dopamine-driven FOMO from seeing 20 ranked candidates with color-coded badges

### 19. Session P&L Visible on Scanner Page
- **Current:** Session P&L exists in governor internals but not surfaced on the scanner page
- **Spec requires:** Visible P&L strip on scanner so trader sees their -3R status while making deploy decisions
- **Severity:** MEDIUM-HIGH — Trader can scan and deploy without awareness of drawdown state

### 20. Go/No-Go Summary Before First Trade
- **Current:** No component exists
- **Spec requires:** Single-screen synthesis of Operator + Crypto Gate + Permission Matrix + Capital Strip before first trade of session
- **Severity:** HIGH — Currently requires mental synthesis across multiple scroll sections

### 21. Session Start Briefing Screen
- **Current:** Operator page loads silently
- **Spec requires:** Forced briefing screen at session start (30 seconds minimum): regime + limits + overnight changes
- **Institutional standard:** Desks require "sign on" confirming review of limits, positions, overnight events

### 22. Risk Manager Mode
- **Current:** No separate risk-only view
- **Spec requires:** Toggle mode that strips signal generation and shows only: exposure, P&L, regime, kill switches
- **Rationale:** Separates trader role from risk manager role — institutional desks have distinct seats

### 23. Correlation Matrix Display
- **Current:** Governor computes correlation clusters internally (AI_TECH, CRYPTO_BETA, etc.) but no visual display
- **Spec requires:** Visual correlation matrix for open positions showing portfolio-level directional clustering
- **Rationale:** Institutional book managers see correlation at a glance

### 24. Intraday Equity Curve on Scanner Page
- **Current:** Equity curves exist in journal (historical) and portfolio (closed trades) only
- **Spec requires:** Real-time intraday P&L curve next to execution tools on scanner page
- **Rationale:** Institutional traders see P&L curve in real time alongside execution tools

---

## Additional Gaps Noted in Friction Analysis

| Friction | Status | Severity |
|----------|--------|----------|
| Operator requires multiple scrolls for full picture | Existing | Medium |
| Regime reclassification per-scan, not real-time | Existing | High |
| No push notification on regime change | ❌ Missing | Medium |
| AI Analyst confidence score not prominent in thesis | ⚠️ Partial | Medium |

---

## Implementation Priority (Recommended Order)

### Phase 1 — Safety Critical
1. **Enforce BLOCK permission** (advisory → hard block)
2. **Rule Guard cooldown** (10-min delay + R budget halving)
3. **Daily trade count limit** (configurable hard gate)

### Phase 2 — Situational Awareness  
4. **Session P&L on Scanner** (P&L strip)
5. **Go/No-Go summary** (pre-first-trade screen)
6. **Session Start Briefing** (forced sign-on)
7. **Session Phase UI** (phase strip)

### Phase 3 — Discipline & UX
8. **Pre-trade behavioral screen** (overtrading modal)
9. **Bulk scan top-5 default** (collapse/expand)
10. **Risk Manager Mode** (risk-only view)

### Phase 4 — Institutional Polish
11. **Correlation matrix display** (visual portfolio clustering)
12. **Intraday equity curve** (real-time P&L on scanner)
