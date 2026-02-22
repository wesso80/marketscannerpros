# MarketScannerPros — Zero-Shortcut Operational Integrity Audit

**Date:** 2026-02-22  
**Auditors:** Senior QA Architect + Institutional Risk Auditor + Integration Reviewer  
**Scope:** Every page, every interactive element, every enforcement path  
**Method:** Full code trace — nothing assumed, everything verified

---

## 1. Overall Operational Integrity Score

# 4.2 / 10

The **core data pipeline is genuine** — real API calls, real indicator math, real regime classification, real database queries scoped by workspace. The platform is not a toy or a mockup.

But the **enforcement layer is swiss cheese**. Multiple safety-critical features exist only as dead code. UI elements that imply functionality are inert. Risk controls that appear server-enforced are actually client-only or never wired. ~30% of rendered code across major pages is dead weight, and multiple "institutional-grade" features are cosmetic shells.

This platform would give a user a **false sense of safety** in its current state.

---

## 2. CRITICAL Issues (Must Fix Before Scale)

### CRIT-01: `middleware.ts` Does Not Exist — No Active Middleware
**Impact:** Session auto-refresh is dead. Sessions expire after 7 days with no renewal. Edge-level auth checks do not run. Host-based redirects are gone. The entire middleware contract documented in `copilot-instructions.md` and `AUTH_SETUP.md` is non-functional.  
**Risk:** Users will be silently logged out with no automatic session extension.

### CRIT-02: Cluster Correlation Block Is Dead Code
**Files:** `lib/risk-governor-hard.ts` L407-L416, `app/api/risk/governor/evaluate/route.ts`  
**Detail:** `evaluateCandidate()` checks `candidate.open_positions.length > 0` to enforce cluster limits. But the evaluate API route **never populates `open_positions`** from the database. The scanner deploy flow **never sends `open_positions`** in the CandidateIntent. The field is always `undefined`. The cluster concentration check — a headline safety feature — has never executed in production.  
**Risk:** A user can load 5 correlated AI-tech positions with zero resistance.

### CRIT-03: Trade Count Limit Is Dead Code
**Files:** `lib/risk-governor-hard.ts` L302-L308, `lib/risk/runtimeSnapshot.ts`  
**Detail:** `buildPermissionSnapshot()` accepts `tradesToday` and `assetClass` parameters, but neither `permission-snapshot/route.ts` nor `evaluate/route.ts` passes them. `getRuntimeRiskSnapshotInput()` does not query trade count. `tradesToday` defaults to `0`. The `TRADE_COUNT_LIMIT` global block and the `evaluateCandidate` enforcement at L396-L399 are unreachable.  
**Risk:** Daily trade count limits (8 equity / 12 crypto) do not exist in practice.

### CRIT-04: R Budget Halving Is Dead Code
**Files:** `lib/risk-governor-hard.ts` L271, `app/api/risk/governor/permission-snapshot/route.ts`  
**Detail:** When Rule Guard is disabled, `rBudgetHalved` should halve the daily R budget. The preferences GET endpoint computes this correctly, but `permission-snapshot/route.ts` never reads the guard cookie's `parseGuardState()` output. The `rBudgetHalved` flag is never forwarded to `buildPermissionSnapshot()`. The Settings UI shows the warning banner, but the actual halving never takes effect server-side.

### CRIT-05: Guard Disable Cookie Never Transitions to `off`
**Files:** `app/api/risk/governor/preferences/route.ts`  
**Detail:** The PUT handler writes `on` or `pending:<timestamp>` but **never writes `off` or `off:<timestamp>`**. Downstream routes check `!== 'off'` to determine guard state. After cooldown expires, the cookie remains `pending:<ts>`, which passes the `!== 'off'` check — the server still enforces the guard even though the preferences endpoint reports it as disabled.  
**Risk:** Guard disable is a UI-only illusion. The server never actually disables enforcement.

### CRIT-06: Client-Supplied Fallback Bypasses Risk Governor
**File:** `app/api/risk/governor/evaluate/route.ts` L73-L82  
**Detail:** If `getRuntimeRiskSnapshotInput()` fails (database error → caught → `null`), every risk parameter falls through to `body.snapshot_input` — a client-supplied JSON object. A malicious caller can POST `{ snapshot_input: { regime: "TREND_UP", realizedDailyR: 0, openRiskR: 0, consecutiveLosses: 0 } }` to force NORMAL mode with full permissions.  
**Risk:** Database outage + API knowledge = complete governor bypass.

### CRIT-07: 5 Dead Buttons in Scanner V2 Decision Cockpit  
**File:** `app/tools/scanner/page.tsx` ~L3195-L3201  
**Detail:** "Enter Trade", "Set Alert", "Add to Watchlist", "Pin for Review", and "Wait Signal" buttons render in the active V2 decision cockpit with **zero `onClick` handlers**. These are the terminal action buttons of the Discover → Rank → Decide workflow. The user completes a full analysis flow and hits a wall of inert buttons.

### CRIT-08: Sector Filter and Scan Intent Mode Are No-Ops
**File:** `app/tools/scanner/page.tsx` ~L1427, ~L1556  
**Detail:** The Sector Filter dropdown sets state but is never consumed by any API call or filtering logic. The Scan Intent Mode toggle (Observe/Decide) sets state but is never read anywhere. Both render as functional controls but change nothing.

### CRIT-09: Hardcoded `avgTradesPerSession = 4.5`
**File:** `app/tools/scanner/page.tsx` ~L1140  
**Detail:** The behavioral overtrading screen compares today's trade count against a hardcoded constant, not the user's actual 30-day average. The `// TODO: fetch from journal KPI endpoint` comment confirms this was never implemented.  
**Risk:** Tilt protection is miscalibrated for every user.

### CRIT-10: Non-Transactional Full-Table Wipe on Portfolio Sync
**File:** `app/api/portfolio/route.ts` L205-L207  
**Detail:** Every debounced save (any state change) runs `DELETE FROM portfolio_positions WHERE workspace_id = $1` then `DELETE FROM portfolio_closed ...` then `DELETE FROM portfolio_performance ...` then re-inserts. No transaction wrapper. If the process crashes or network drops between DELETE and INSERT, **all portfolio data is irreversibly lost**.

### CRIT-11: 6 Dead Buttons/Features in Journal
**File:** `components/journal/JournalPage.tsx`, `components/journal/drawer/tabs/`  
**Detail:** "Import" button → empty `() => {}` handler. "Add Note" button → no `onClick`. Notes textarea → write-only (no persistence). Intelligence textarea → write-only. "New Trade" button → opens empty drawer with no create form. `closeTrade()` → no error handling, no response status check.

### CRIT-12: Operator Page — ~40% Dead Code
**File:** `app/operator/page.tsx`  
**Detail:** `workflowTodaySection`, `learningLoopSection`, `operatorKpisSection` are computed (~200 lines of JSX) but **never referenced in the return statement**. 4 imported components (`CommandCenterStateBar`, `DecisionCockpit`, `FocusStrip`, `OperatorProposalRail`) are never rendered. 3 handler functions (`handleTaskDecision`, `submitLoopFeedback`, `handleFocusAction`) call real APIs but are unreachable from any UI. `operatorMode` is locked to `'OBSERVE'` permanently (setter exists, never called). Proposals are fetched on every page load, processed, but never displayed.

### CRIT-13: Strategy Performance Table Is 100% Hardcoded
**File:** `app/operator/page.tsx` L1935-L1950  
**Detail:** The "Strategy Performance By Regime" table renders static arrays `['Breakout', 'Strong', 'Weak', 'Blocked']` etc. These are presented as live performance metrics broken down by regime — they are pure fiction.

### CRIT-14: Dual Auth `secret()` Functions With Different Key Sources
**File:** `lib/auth.ts` L11 vs L38  
**Detail:** `verify()` uses `process.env.APP_SIGNING_SECRET` directly. `verifyToken()` uses `secret()` which falls back to `process.env.NEXTAUTH_SECRET || ""`. If only `NEXTAUTH_SECRET` is set, `verifyToken` validates against a different key than `signToken`/`verify`. This creates a signature validation mismatch.

### CRIT-15: SessionStartBriefing Does Not Actually Block Access
**File:** `components/operator/SessionStartBriefing.tsx` L21  
**Detail:** `useState(true)` — the initial state is `acknowledged = true` to "avoid flash". Children render immediately. The `useEffect` sets it to `false` asynchronously, creating a render frame where all tools are accessible. The entire gate is `sessionStorage`-based — trivially bypassable via DevTools. NO-GO assessment is purely informational: the user can still click "Begin Session" even when risk is locked or data is down.

---

## 3. HIGH Issues (Fix Next Sprint)

| # | Issue | File | Detail |
|---|-------|------|--------|
| H-01 | Hardcoded $100K portfolio in position sizing | `risk-governor-hard.ts` L372 | `Math.floor((100000 * riskPerTrade) / rPerUnit)` — not the user's actual equity. $10K account gets 10× oversized recommendations. |
| H-02 | Fabricated stop prices everywhere | `operator/page.tsx` L1920 | `currentPrice * 0.98/1.02` used for ALL stop calculations, Open R display, and RiskApplicationOverlay. Presented as real stop levels. |
| H-03 | Fabricated ATR fallback | `operator/page.tsx` L1048 | When ATR is missing, `currentPrice * 0.02` is used for entry zones, stop loss, targets — then emitted as workflow events. |
| H-04 | Hardcoded $100K portfolio fallback | `operator/page.tsx` L1719/L1726 | `portfolioValue \|\| 100000` in R-dollar conversions. Empty portfolio → wrong risk metrics. |
| H-05 | No `catch` on Operator page initial load | `operator/page.tsx` L547-L604 | 10 parallel API fetches in `try { } finally { }` with NO `catch`. Network errors silently swallowed. Zero user-facing error state variable. |
| H-06 | `closePosition()` has no confirmation dialog | `portfolio/page.tsx` L1107 | One click permanently closes a position. No "are you sure?". No undo. |
| H-07 | `reducePositionHalf()` doesn't book realized P&L | `portfolio/page.tsx` L1169 | Halves quantity without creating a closed trade record for the sold portion. P&L evaporates from the record. |
| H-08 | Stop prices never persisted (portfolio) | `portfolio/page.tsx` L556 | `positionStopMap` is local state only. "Move Stop to Breakeven" looks functional but data is lost on page refresh. |
| H-09 | Optimistic-only portfolio sync | `portfolio/page.tsx` L886-L910 | All mutations update local state immediately. Sync fires 1s later with no confirmation. If sync fails, frontend/backend diverge silently. |
| H-10 | 9 `alert()` calls as error handling (portfolio) | `portfolio/page.tsx` | Blocking browser `alert()` for validation errors, limit exceeded, CSV gate, empty data. Not institutional-grade UX. |
| H-11 | Emergency Lock button is a no-op | `RiskManagerMode.tsx` L39-L42 | Only enables the guard (which may already be on). Cannot force LOCKED mode. The comment says "system will enforce LOCK through the governor" but no API call triggers lock. |
| H-12 | All RiskPermissionContext catches are empty | `RiskPermissionContext.tsx` | 5 functions (`loadPreference`, `refresh`, `setGuardEnabled`, `cancelGuardDisable`, `evaluate`) have `catch {}` — silent error swallowing everywhere. No toast, no retry, no error state. |
| H-13 | Guard state is cookie-only, no cross-device sync | `preferences/route.ts` | Guard state lives in `msp_risk_guard` cookie. Not in database. Phone and desktop can have different guard states. Violates the project's own cross-device sync architecture. |
| H-14 | CapitalControlStrip guard toggle lacks cooldown UX | `CapitalControlStrip.tsx` L72-L78 | Second guard toggle outside Settings page. No cooldown countdown, no "CANCEL DISABLE" button, no pending state awareness. Undermines the behavioral safety design. |
| H-15 | `closeTrade()` in journal — no response check | `useJournalActions.ts` L42-L58 | No `.ok` check, no `try/catch`. API failure silently calls `onRefresh()`. Close modal closes regardless. |
| H-16 | Journal POST destructive replace pattern | `journal/route.ts` L589-L600 | `DELETE FROM journal_entries WHERE workspace_id = $1` then re-insert. The 20% safety threshold can be bypassed with `forceReplace=true`. |
| H-17 | Snapshot submit has unhandled throw | `JournalPage.tsx` L148-L151 | `captureSnapshot` throws on failure; caller has no `try/catch`. Unhandled rejection. |
| H-18 | NavBar/CapitalControl render outside SessionStartBriefing | `ToolsLayoutClient.tsx` L57-L67 | Navigation, command strip, capital controls are in the DOM and potentially interactive underneath the briefing overlay. |
| H-19 | `permission-snapshot` query params allow override | `permission-snapshot/route.ts` L54-L60 | If runtime data is null (DB down), query params `?openRiskR=0&consecutiveLosses=0` produce a permissive display snapshot. |

---

## 4. MEDIUM Issues

| # | Issue | File |
|---|-------|------|
| M-01 | `emitWorkflowEvents` fire-and-forget — zero error handling | `scanner/page.tsx` L666 |
| M-02 | Capital flow fetch fails silently | `scanner/page.tsx` L710-L746 |
| M-03 | `console.log` debug statements in production | `scanner/page.tsx` L827-L829 |
| M-04 | Watchlist add uses `alert()` + no loading state + double-click possible | `scanner/page.tsx` L1162-L1203 |
| M-05 | Journal auto-log status invisible in V2 flow | `scanner/page.tsx` L852-L878 |
| M-06 | `operatorTransition`, `presenceUpdates`, `personalityMode` — computed but never rendered in V2 | `scanner/page.tsx` |
| M-07 | `dailyPicks` state declared but permanently disabled | `scanner/page.tsx` L543-L551 |
| M-08 | ~1,500 lines of dead code behind `false &&` flags | `scanner/page.tsx` L235-L238 |
| M-09 | No client-side timeout on main scan fetch | `scanner/page.tsx` L830 |
| M-10 | Operator heartbeat polls failing endpoints indefinitely | `operator/page.tsx` L937-L943 |
| M-11 | 7 unnecessary state variables for non-rendered features (operator) | `operator/page.tsx` |
| M-12 | Coach Insight is hardcoded heuristic labeled as if from AI | `operator/page.tsx` L1078 |
| M-13 | Heartbeat monologue pads fake lines | `operator/page.tsx` L481-L493 |
| M-14 | Portfolio risk framework/settings not persisted | `portfolio/page.tsx` L549-L551 |
| M-15 | Position ID is `Date.now()` — collision risk | `portfolio/page.tsx` L983 |
| M-16 | No rate limiting on portfolio POST | `portfolio/route.ts` L173 |
| M-17 | No input validation/schema on portfolio POST body | `portfolio/route.ts` L180 |
| M-18 | Journal "Add Note", "Quick Assign" labels are non-interactive | Journal drawer tabs |
| M-19 | Risk blocker text hardcoded regardless of state | `mapPayload.ts` L80 |
| M-20 | Oversize flag threshold hardcoded at qty > 100 | `mapPayload.ts` L79 |
| M-21 | KPI row shows all zeros with no loading state | `JournalKpiRow.tsx` L27-L35 |
| M-22 | CorrelationMatrix overlapping regex misclassifies 6+ symbols | `CorrelationMatrix.tsx` L36-L41 |
| M-23 | CorrelationMatrix misclassifies short stock tickers as crypto | `CorrelationMatrix.tsx` L43 |
| M-24 | CorrelationMatrix division by zero when all riskR = 0 | `CorrelationMatrix.tsx` L131 |
| M-25 | SessionStartBriefing dynamic Tailwind classes will be purged in prod | `SessionStartBriefing.tsx` L77 |
| M-26 | SessionPhaseStrip `toLocaleString` midnight edge case | `SessionPhaseStrip.tsx` L50 |
| M-27 | HMAC comparison uses string equality, not timing-safe | `auth.ts` L14/L43 |
| M-28 | Portfolio sync advisory risk check — LOCKED doesn't block writes | `portfolio/route.ts` L196-L206 |
| M-29 | Liquidity context chip always "NORMAL" for crypto/forex | `scanner/page.tsx` L1290 |
| M-30 | ToolIdentityHeader chips always gray regardless of state | `ToolIdentityHeader.tsx` L24-L26 |
| M-31 | ACL confidence (data-quality-adjusted) computed but never displayed | `scanner/page.tsx` |

---

## 5. Cosmetic Elements Pretending to Be Functional

| Element | Location | Truth |
|---------|----------|-------|
| **"Enter Trade" button** | Scanner V2 cockpit | Dead — no handler |
| **"Set Alert" button** | Scanner V2 cockpit | Dead — no handler |
| **"Add to Watchlist" button** | Scanner V2 cockpit | Dead — no handler |
| **"Pin for Review" button** | Scanner V2 cockpit | Dead — no handler |
| **"Wait Signal" button** | Scanner legacy cockpit | Dead — no handler |
| **Sector Filter dropdown** | Scanner discovery panel | Sets state consumed by nothing |
| **Scan Intent Mode toggle** | Scanner discovery panel | Sets state consumed by nothing |
| **"Import" button** | Journal command bar | Empty function handler |
| **"Add Note" button** | Journal trade drawer | No onClick handler |
| **"New Trade" button** | Journal command bar | Opens empty form with no API |
| **Notes textarea** | Journal trade drawer | Write-only, no persistence |
| **Intelligence textarea** | Journal trade drawer | Write-only, no persistence |
| **Strategy Performance table** | Operator page | 100% hardcoded static data |
| **Emergency Lock button** | RiskManagerMode | Only toggles guard ON; cannot force LOCKED |
| **Session Start Briefing gate** | Tools layout | Client-only, default `true`, bypassable |
| **R Budget Halved warning** | Settings page | Warning displays but halving never enforced |
| **Trade Count Limit display** | Session P&L strip | Shows `trades_today: 0` always |
| **Liquidity chip** | Scanner context panel | Always "NORMAL" for crypto/forex |

---

## 6. Redundant Logic & Dead Code

| Item | Lines | Location |
|------|-------|----------|
| `workflowTodaySection` variable | ~80 lines | `operator/page.tsx` — computed, never rendered |
| `learningLoopSection` variable | ~30 lines | `operator/page.tsx` — computed, never rendered |
| `operatorKpisSection` variable | ~60 lines | `operator/page.tsx` — computed, never rendered |
| 4 unused imports | 4 lines | `operator/page.tsx` — CommandCenterStateBar, DecisionCockpit, FocusStrip, OperatorProposalRail |
| 3 unreachable handlers | ~120 lines | `operator/page.tsx` — handleTaskDecision, submitLoopFeedback, handleFocusAction |
| `refreshProposals` + proposal state | ~50 lines | `operator/page.tsx` — fetched, processed, never displayed |
| `operatorMode` + setter | 10+ lines | `operator/page.tsx` — locked to OBSERVE, setter never called |
| `{false && ( <> ~1700 lines </> )}` | ~1700 lines | `portfolio/page.tsx` — entire legacy UI, never renders |
| `dailyPicks` state + loading | 10 lines | `scanner/page.tsx` — intentionally disabled |
| `showDeskPreludePanels`, `showAdvancedEngineeringPanels`, `showLegacyTopAnalysis` | ~1500 lines guarded | `scanner/page.tsx` — permanently `false` |
| `operatorTransition` render | ~50 lines | `scanner/page.tsx` — only in `!useScannerFlowV2` path |
| `presenceUpdates` render | ~30 lines | `scanner/page.tsx` — only in non-V2 path |
| `personalityMode` full calculation + render | ~80 lines | `scanner/page.tsx` — mostly invisible in V2 |
| `aiText`/`aiError`/`aiLoading`/`aiExpanded`/`explainScan` | ~60 lines | `scanner/page.tsx` — unreachable in V2 flow |
| Unused `secret()` function | 4 lines | `auth.ts` — creates key mismatch risk |

**Estimated total dead code: ~3,800 lines across 4 major files.**

---

## 7. Final Verdict: Would This Survive Real Capital?

# No.

**What works:**
- The data pipeline is real. Alpha Vantage / CoinGecko → indicators → scoring → regime classification is genuine computation, not fabricated.
- Tenant isolation is correct across all audited API routes. Every query is scoped by `workspace_id`.
- The permission matrix is computed server-side from real regime data.
- LOCKED mode enforcement in `evaluateCandidate` is a hard server-side BLOCK when reached.
- Session/auth cookie security (httpOnly, HMAC-signed) is sound for the base flow.

**What would fail under real capital:**

1. **Cluster correlation is not enforced.** A user can build unlimited concentrated exposure in correlated assets with zero warning. This is the #1 portfolio risk failure mode and the guardrail is dead code.

2. **Trade count limits don't exist.** The 8/12 daily trade cap is cosmetic. An over-trader can fire 30 trades in a session.

3. **Position sizing assumes everyone has $100K.** A $5K account gets a 20× oversized position recommendation from the governor. A $500K account gets 5× undersized.

4. **Portfolio sync can lose all data.** A network hiccup during the DELETE-then-INSERT cycle destroys the entire portfolio with no recovery.

5. **Half the decision cockpit buttons do nothing.** A user completes a full institutional-grade analysis pipeline and hits dead buttons at the terminal action step.

6. **The risk governor can be bypassed when the database is down.** Client-supplied fallback values replace server authority. The exact moment when enforcement matters most (system degradation) is when it's weakest.

7. **Stop prices across the operator page and risk overlay are fabricated.** Every "Open R" and "Stop Px" value is a ±2% guess, not a real stop level. Risk exposure calculations built on this are meaningless.

8. **The Session Start Briefing — the institutional "sign-on" gate — defaults to `acknowledged: true` and is client-side only.** It's a speed bump, not a gate.

The platform has genuine analytical capability underneath a layer of unfinished enforcement and cosmetic placeholders. The gap between what the UI implies and what the backend enforces would create a false sense of safety that is **more dangerous than having no safety controls at all**, because the user believes they are protected when they are not.

**Required before real-capital readiness:**
1. Wire `open_positions` into the evaluate endpoint from the database
2. Wire `tradesToday` into the snapshot from journal entries
3. Fix the guard cookie state machine (`pending:` → `off:` transition)
4. Remove client fallback from the evaluate endpoint (return 503 on DB failure)
5. Wrap portfolio sync in a database transaction
6. Replace $100K hardcoded portfolio with actual user equity
7. Wire the 5 dead scanner cockpit buttons or remove them
8. Replace fabricated stop prices with real position data
9. Restore `middleware.ts` for session auto-refresh
10. Delete ~3,800 lines of dead code

---

*Report generated from full code trace. Every finding includes verified file paths and line numbers. No assumptions made.*
