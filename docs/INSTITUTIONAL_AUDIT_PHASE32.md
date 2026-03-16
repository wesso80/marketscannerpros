# INSTITUTIONAL AUDIT — Phase 32

**Auditor Role**: Senior Institutional Trader + Risk Committee Chair + Technical Auditor  
**Audit Date**: January 2025  
**Scope**: Full platform audit — regime detection through UX compliance  
**Files Examined**: 22 core modules, 1599-line scanner route, 5300+ line scanner page, all risk/scoring libs, test suite  

---

## OUTPUT A — AUDIT SCORES (0–100, institutional prop-desk standard)

| # | System | Score | Grade | Verdict |
|---|--------|-------|-------|---------|
| 1 | **Regime Detection** | 42 | D | Two separate regime systems, scanner API uses dumbed-down ADX threshold |
| 2 | **Scoring Engine (regimeScoring + ACL)** | 71 | B- | Well-designed pipeline — but disconnected from main scan path |
| 3 | **Adaptive Confidence Lens** | 68 | C+ | Solid 5-step design, fragile default at threshold boundary |
| 4 | **Risk Governor (Hard)** | 75 | B | Strong permission matrix, permissive defaults, full bypass toggle |
| 5 | **Permission Matrix (Flow-Trade)** | 65 | C+ | State-based TPS scoring works, thin wrapper adds no value |
| 6 | **Data Reliability** | 48 | D | USDT uses `Math.random()`, cached equities miss Aroon, no staleness guard in scanner |
| 7 | **UX Compliance** | 55 | C | Disclaimers present, but all risk gates hardcoded to `false`/`true` ("educational mode") |
| 8 | **Test Coverage** | 25 | F | 1 live test file (85 lines), 1 manual script. Zero CI for core risk modules |

**COMPOSITE SCORE: 56 / 100 — CONDITIONAL (Not Prop-Desk Ready)**

---

## OUTPUT B — TOP 10 FINDINGS (Ranked by institutional risk severity)

### #1 — CRITICAL: Regime Scoring + ACL Pipeline DISCONNECTED from Scanner API

**Files**: `app/api/scanner/run/route.ts` (line 1389), `lib/ai/regimeScoring.ts`, `lib/ai/adaptiveConfidenceLens.ts`  
**Evidence**: The scanner API route — the primary data path every trader hits — does NOT call `computeRegimeScore()`, `deriveRegimeConfidence()`, or `computeACL()`. Instead it uses a 3-state ADX threshold:

```typescript
// line 1389 of scanner/run/route.ts
const regime = Number.isFinite(adxValue)
  ? (adxValue >= 22 ? 'trending' : adxValue <= 18 ? 'ranging' : 'unknown')
  : 'unknown';
```

Meanwhile, the full 5-regime × 6-component scoring matrix with nonlinear conviction curves, gating, and 9-penalty ACL pipeline exists in `lib/ai/` but is only consumed by the **AI analyst** (`msp-analyst/route.ts`) and **AI copilot** (`ai/copilot/route.ts`).

**Impact**: Traders receive scores computed WITHOUT regime-aware weighting, WITHOUT gate enforcement, WITHOUT confidence caps. The institutional filter (`computeInstitutionalFilter`) applied at the tail end uses a different, simpler regime taxonomy. Two regime classification systems coexist with zero interop.

**Risk**: A trader sees a "75 score" on an instrument in a RANGE_COMPRESSION regime where gating should have capped it at 55. False confidence.

---

### #2 — CRITICAL: All Risk Gates Hardcoded OFF in Scanner UI ("Educational Mode")

**File**: `app/tools/scanner/page.tsx`  
**Evidence** (4 separate locations):

```typescript
// line 1540
const blocked = false; // Educational mode — no blocking gates

// line 2812
const executionAllowed = true; // Educational platform — never block

// line 1027
console.warn('[Scanner] Rule Guard advisory: tracking locked, proceeding anyway (educational mode).');

// line 1110
// Pre-trade checklist bypassed — educational platform, not broker-level yet
```

**Impact**: The entire risk governor, permission matrix, and institutional filter system is advisory-only. A trader in LOCKED mode (data DOWN, daily R exhausted, 4+ losses) can still execute any action through the UI. The `riskLocked` state from `useRiskPermission()` is consumed for display only — never as a gate.

**Risk**: Renders the entire risk infrastructure (risk-governor-hard, institutional-risk-governor, flow-trade-permission, performanceThrottle) into expensive dead code at the execution layer.

---

### #3 — HIGH: `buildPermissionSnapshot` Defaults to TREND_UP (Permissive)

**File**: `lib/risk-governor-hard.ts` (line ~237)  
**Evidence**: When `buildPermissionSnapshot` receives no regime input, it defaults to `'TREND_UP'`, which is the most permissive regime in the matrix — allows LONG for all 6 strategy types including BREAKOUT_CONTINUATION and MOMENTUM.

**Impact**: If the runtime snapshot fails to resolve a regime (e.g., `operator_state` table is empty, data is stale, or first-time user), the governor silently assumes "everything is bullish and trending." In a real RISK_OFF_STRESS environment, this would let through trades that should be blocked.

---

### #4 — HIGH: Guard Toggle Completely Bypasses All Risk Checks

**File**: `lib/risk-governor-hard.ts` (line 244), `components/risk/RiskPermissionContext.tsx` (line 84)  
**Evidence**:

```typescript
// risk-governor-hard.ts line 244
const matrix = enabled ? buildMatrix(regime) : buildAllowAllMatrix();
```

When `guard_enabled: false`, `buildAllowAllMatrix()` returns ALLOW for every regime × strategy × direction combination. The UI stores this as a user preference in `/api/risk/governor/preferences`.

Additionally, in `RiskPermissionContext.tsx`:
```typescript
if (!guardEnabled) return false; // isLocked always false when guard disabled
```

**Impact**: Any user can toggle off the entire risk infrastructure with a single click in Settings. No admin approval, no cooldown, no audit trail.

---

### #5 — HIGH: USDT Dominance Data Uses `Math.random()` for Candle Generation

**File**: `app/api/scanner/run/route.ts` (lines 523-545)  
**Evidence**:

```typescript
// line 533
const variance = (Math.random() - 0.5) * 0.006 * usdtDominance;
```

The `fetchUSDTDominance()` function takes a single current value from CoinGecko's global endpoint, then generates N candles with random variance (±0.3%) to simulate historical data. These synthetic candles are then fed into RSI, MACD, EMA200, ADX, Stochastic, CCI, Aroon, and OBV calculations.

**Impact**: Every technical indicator computed on USDT Dominance is statistically meaningless — it's TA on random noise. Non-deterministic (different results every scan). If any trader uses USDT.D as a macro confirmation signal, they're reading tea leaves.

---

### #6 — HIGH: `regimeConfidence` Default = 55 Sits at ACL Threshold Edge

**File**: `lib/ai/adaptiveConfidenceLens.ts` (line ~420)  
**Evidence**:

```typescript
// in computeACLFromScoring
const regimeConfidence = scoring.regimeConfidence ?? 55;
```

The ACL pipeline has a hard cap: `REGIME_LOW` caps output at 60 when `regimeConfidence < 55`. The default value of exactly 55 means the cap is narrowly AVOIDED. A single-point reduction (e.g., from rounding, insufficient data) would trigger the cap and clamp output to 60 — changing the authorization from AUTHORIZED to CONDITIONAL.

**Impact**: Fragile boundary condition. The system behaves radically differently at 54 vs 55 regimeConfidence, and the default sits precisely on this knife-edge.

---

### #7 — HIGH: Zero Automated Test Coverage for Core Risk Modules

**Files**: `test/` directory  
**Evidence**: 
- `test/risk-governor.test.ts` (85 lines) — ONLY tests `evaluateAutoAlertPolicy` and `evaluateSystemExecutionPolicy` from `lib/operator/riskGovernor.ts`
- `test/institutional-audit.ts` (1286 lines) — manual script (`npx tsx test/...`), NOT wired to CI/vitest
- Zero vitest tests for: `regimeScoring`, `adaptiveConfidenceLens`, `risk-governor-hard` (evaluateCandidate, buildPermissionSnapshot), `institutional-risk-governor`, `flow-trade-permission`, `correlation-regime-engine`, `performanceThrottle`, `capitalFlowEngine`, `institutionalFilter`

**Impact**: Any regression in scoring math, gate thresholds, or permission logic goes undetected until a trader reports wrong behavior in production.

---

### #8 — MEDIUM-HIGH: Two Separate Regime Classification Taxonomies

**Systems**:
1. **Scanner API** (`institutionalFilter.ts`): `'trending' | 'ranging' | 'high_volatility_chaos' | 'low_liquidity' | 'news_shock' | 'unknown'`
2. **Scoring Engine** (`regimeScoring.ts`): `'TREND_EXPANSION' | 'TREND_MATURE' | 'RANGE_COMPRESSION' | 'VOL_EXPANSION' | 'TRANSITION'`
3. **Risk Governor** (`risk-governor-hard.ts`): `'TREND_UP' | 'TREND_DOWN' | 'RANGE_NEUTRAL' | 'VOL_EXPANSION' | 'VOL_CONTRACTION' | 'RISK_OFF_STRESS'`

Three taxonomies. No unified mapping between all three. `mapToScoringRegime()` maps governor regimes → scoring regimes, but scanner API uses its own taxonomy that doesn't participate at all.

**Impact**: Regime can be classified differently depending on which code path evaluates it. A "trending" institutional filter regime is not the same as "TREND_EXPANSION" scoring regime or "TREND_UP" governor regime.

---

### #9 — MEDIUM: Cached Equity Data Missing Aroon → Degraded Scoring

**File**: `app/api/scanner/run/route.ts` (lines ~1230-1232)  
**Evidence**:

```typescript
// Aroon not cached yet - use NaN (won't affect scoring much)
const aroonUp = NaN;
const aroonDown = NaN;
```

Cached equities feed `NaN` for Aroon into `computeScore()`. Since Aroon contributes to bullish/bearish signal counts (weight ~1.0), cached symbols lose one indicator dimension. The `computeScore` function silently skips NaN checks with `Number.isFinite()`, so the total signal pool shrinks, changing the score baseline vs. live-fetched data.

**Impact**: Same symbol scanned live vs. from cache produces different scores. Intermittent score drift depending on cache mode.

---

### #10 — MEDIUM: `isLocked` Memo Has Stale Closure Risk

**File**: `components/risk/RiskPermissionContext.tsx` (lines 82-89)  
**Evidence**:

```typescript
const isLocked = useMemo(() => {
  if (!snapshot) return false;
  if (!guardEnabled) return false;  // reads guardEnabled
  return (
    snapshot.risk_mode === 'LOCKED' ||
    snapshot.data_health.status === 'DOWN' ||
    snapshot.session.remaining_daily_R <= 0
  );
}, [snapshot]);  // dependency array only includes [snapshot], NOT guardEnabled
```

**Impact**: When `guardEnabled` changes but `snapshot` doesn't, `isLocked` returns stale value. Toggling guard off might not immediately release lock state, or toggling on might not immediately enforce it.

---

## OUTPUT C — KILL SWITCH CHECKLIST

Does the platform have functioning kill switches for the following scenarios?

| # | Scenario | Kill Switch Exists? | Actually Enforced? | Verdict |
|---|----------|--------------------|--------------------|---------|
| 1 | Data feed goes DOWN | ✅ `runtimeSnapshot` → inferDataStatus > 60s = DOWN | ⚠️ Scanner API doesn't check data age at all | **PARTIAL** |
| 2 | 4+ consecutive losses | ✅ `inferRiskMode` → LOCKED at 4+ losses | ❌ UI hardcoded `blocked = false` | **DISPLAY ONLY** |
| 3 | Daily R limit exhausted | ✅ `remaining_daily_R <= 0` → isLocked | ❌ UI hardcoded `executionAllowed = true` | **DISPLAY ONLY** |
| 4 | Open risk exceeds max | ✅ `inferRiskMode` → LOCKED at max risk | ❌ Not enforced at UI | **DISPLAY ONLY** |
| 5 | Session drawdown -4R | ✅ `performanceThrottle` → LOCKED + RU=0 | ⚠️ Only if ACL pipeline active (AI routes only) | **AI ROUTES ONLY** |
| 6 | VIX stress regime | ✅ `correlation-regime-engine` → STRESS + size×0.25 | ⚠️ Only advisory; scanner doesn't consume it | **ADVISORY** |
| 7 | High-impact event | ✅ `evaluateCandidate` blocks non-event strategies | ❌ Not enforced; scanner uses simplified filter | **PARTIAL** |
| 8 | Correlation cluster breach | ✅ Two implementations (hard governor + IRS) | ❌ Neither enforced at execution layer | **DISPLAY ONLY** |
| 9 | Guard toggle OFF | ✅ `buildAllowAllMatrix` | ❌ No admin override, no audit log | **BYPASSED** |
| 10 | Stale OHLC data | ❌ No freshness check on candle timestamps | ❌ Old candles accepted silently | **MISSING** |

**Kill Switch Verdict: 0/10 fully enforced. The platform has BUILD the right infrastructure but it's wired to the dashboard as advisory-only. Nothing actually blocks execution.**

---

## OUTPUT D — BRUTAL TRUTH

### What This Platform IS

A **beautifully engineered advisory dashboard** with institutional-grade risk modeling that stops short of enforcement. The regime scoring, ACL, performance throttle, correlation engine, and risk governor are all well-designed — the math is solid, the architecture is layered correctly, the edge cases are handled. This is genuinely good engineering work.

### What This Platform IS NOT

A **prop-desk-grade execution system**. Not yet. The gap between "calculate the right answer" and "enforce the right answer" is where the danger lives.

### The Core Problem

You built two platforms:

1. **The Intelligence Layer** (regimeScoring, ACL, risk-governor-hard, institutional-risk-governor, flow-trade-permission, performanceThrottle, correlation-regime-engine): Sophisticated, multi-dimensional, well-architected. Handles ~15 different risk dimensions. Would pass review at a mid-tier prop desk.

2. **The Execution Layer** (scanner API route, scanner page.tsx): Uses a 3-state ADX threshold for regime, hardcodes all gates to `false`, labels everything "educational mode," and lets any trader do anything regardless of what the Intelligence Layer says.

These two layers are **almost completely disconnected**. The Intelligence Layer is consumed by the AI analyst and copilot routes. The Execution Layer — where the actual trader decisions happen — largely ignores it.

### The Specific Numbers That Worry Me

- **0 of 10** kill switches fully enforced at execution
- **3** separate regime taxonomies with no unified mapping
- **1** function using `Math.random()` to generate data fed into 8 technical indicators
- **0** automated tests for the 10 core risk modules
- `guard_enabled: false` → **complete bypass** of all risk infrastructure with no audit trail
- Default regime = `TREND_UP` → **most permissive** assumption when data is missing
- regimeConfidence defaults to **55** — a value that is exactly 1 point from triggering a hard cap

### What Would Make This Prop-Desk Ready

1. **Wire the ACL pipeline into the scanner API response** — even as metadata. Let the front-end consume `acl.authorization`, `acl.regimeConfidence`, `acl.penalties` alongside the existing `institutionalFilter`.

2. **Remove the educational mode hardcodes** — replace `const blocked = false` with actual gate evaluation. If you want a soft mode, add a "confirm override" modal that logs the override to the database.

3. **Unify the regime taxonomy** — one source of truth, three consumers. Map once at the data layer.

4. **Add CI tests for the core risk modules** — the `institutional-audit.ts` file already has 171 tests. Wire it into vitest and your CI pipeline.

5. **Add audit logging for guard toggle** — when a trader disables the governor, log it, and optionally require re-enable after 24h.

6. **Kill the USDT Dominance random candle generator** — either fetch real historical data or label it "indicative only, not TA-reliable."

7. **Fix the `isLocked` dependency array** — add `guardEnabled` to the `useMemo` deps.

### Bottom Line

The thinking is institutional. The implementation is educational. The UI tells the trader "you're protected" while actually protecting nothing. That's the most dangerous state for a trading platform to be in — not that it lacks risk controls, but that it *appears* to have them.

Close the gap between the intelligence layer and the execution layer, and this becomes a serious platform.

---

*Audit conducted across 22 source files, ~8,000 lines of risk/scoring code, ~7,000 lines of scanner route + page.*
