# MSP Admin Private Research Terminal — Roadmap & Progress Tracker

> **Single source of truth for the admin terminal upgrade.** Update this file at the end of every work session so any machine (home/office) can pick up exactly where the last one left off.

**Boundary (do not cross, ever):** Private research, analytics, alerting, and journaling only. **No broker execution. No order placement. No order routing. No client trading authority. No custody.** See [Allowed vs Forbidden Language](#allowed-vs-forbidden-language) at the bottom.

---

## Quick Status

| Phase | Title | Status | Branch / Commit |
|---|---|---|---|
| 1 | Lockdown & Boundary (UX + Test Lock) | ✅ Complete | _pending push_ |
| 1.5 | Internal Type Rename (executionReady, broker* symbols, BLOCK→NO_RESEARCH) | ✅ Complete (partial — see notes) | _pending push_ |
| 2 | Truth Layer | ⬜ Not started | — |
| 3 | Opportunity Research Board | ⬜ Not started | — |
| 4 | Symbol Research Terminal | ⬜ Not started | — |
| 5 | Alerts & Discord | ⬜ Not started | — |
| 6 | ARCA Admin Research | ⬜ Not started | — |
| 7 | Journal Learning | ⬜ Not started | — |
| 8 | Elite UI Polish | ⬜ Not started | — |

Status legend: ⬜ Not started · 🟡 In progress · ✅ Complete · ⚠️ Blocked

**Last session ended at:** Phase 6 shipped — ARCA Admin Research Copilot. Created [lib/admin/arcaTypes.ts](../lib/admin/arcaTypes.ts) (`ArcaAdminMode` 9-mode union, `ArcaAdminContext`, `ArcaAdminResearchOutput`, `validateArcaOutput` with forbidden-phrase scan), [lib/admin/arcaPrompt.ts](../lib/admin/arcaPrompt.ts) (`buildArcaSystemPrompt` with explicit refusal clause + every forbidden verb + JSON contract; `buildArcaUserPrompt` per-mode), [app/api/admin/arca/route.ts](../app/api/admin/arca/route.ts) (POST, OpenAI gpt-4o-mini, JSON response_format, server-side classification override, validator-rejected outputs fall back to a deterministic safe payload), and [components/admin/AdminARCAPanel.tsx](../components/admin/AdminARCAPanel.tsx) (mode select + Ask ARCA button + headline/reasoning/evidence/risks/classification rendering). Mounted on the canonical [/admin/symbol/[symbol]](../app/admin/symbol/[symbol]/page.tsx) page below the Scenario Map. vitest 38 files / 461 tests green (+14 new), build green, boundary guard green.
**Last commit on main:** `c06c93ad` (Phase 5)
**Next action when resuming:** Phase 7 — Journal Learning. Create [lib/engines/journalLearning.ts](../lib/engines/journalLearning.ts) to mine `admin_research_cases` for repeat patterns, [app/admin/journal-learning/page.tsx](../app/admin/journal-learning/page.tsx) cockpit, `<AdminJournalDNAPanel />`, and surface a "Journal Pattern Match" boost inside `internalResearchScore`.

---

## Existing Foundation (already built — do not duplicate)

These already exist and form the backbone we extend, not replace:

- [app/admin/operator-terminal/page.tsx](../app/admin/operator-terminal/page.tsx) — 4-rail cockpit shell (canonical going forward)
- [app/admin/terminal/[symbol]/page.tsx](../app/admin/terminal) — symbol cockpit (will be promoted to `/admin/symbol/[symbol]`)
- [app/admin/commander/page.tsx](../app/admin/commander/page.tsx) — one-pane brief
- [app/admin/morning-brief/page.tsx](../app/admin/morning-brief/page.tsx) — daily brief
- [app/admin/risk/page.tsx](../app/admin/risk/page.tsx) — risk governor (will be neutralized → alert posture)
- [app/admin/discord-bridge/page.tsx](../app/admin/discord-bridge/page.tsx) — Discord alert bridge
- [app/admin/diagnostics](../app/admin/diagnostics) + [app/admin/system](../app/admin/system) — to be merged into `/admin/data-health`
- [app/admin/quant/page.tsx](../app/admin/quant/page.tsx) — promote → `/admin/backtest-lab`
- [app/admin/scalper/page.tsx](../app/admin/scalper/page.tsx) — keep, link from opportunity board
- [app/admin/live-scanner/page.tsx](../app/admin/live-scanner/page.tsx) — feeds opportunity board
- [components/admin/operator/](../components/admin/operator) — full card library: `VerdictHeaderCard`, `IndicatorMatrixCard`, `LiveChartPanel`, `TruthRail`, `LiquidityLevelsCard`, `TargetsInvalidationCard`, `RiskGovernorCard`, `AIExplainCard`, etc.
- [components/admin/terminal/](../components/admin/terminal) — `SymbolHeader`, `ConfidenceCard`, `DVEDetailCard`, `RiskStateCard`, `PositionSizingCard`, `CrossMarketCard`, `TerminalBottomWorkspace`
- [components/admin/shared/](../components/admin/shared) — `AdminCard`, `SectionTitle`, `MiniStat`, `StatusPill`, `Tabs`, `DataRow`
- [lib/admin/](../lib/admin) — `truth-layer.ts`, `signal-recorder.ts`, `scan-context.ts`, `permissions.ts`, `morning-brief.ts`, `expectancy.ts`, `hooks.ts`, `types.ts`, `serializer.ts`
- [lib/adminAuth.ts](../lib/adminAuth.ts) — `requireAdmin()` (will gain `lib/admin/requireAdmin.ts` re-export)

**No actual broker API, OAuth, or order routes exist.** Risk is purely language drift.

---

## Boundary Violations to Fix in Phase 1

These are the only places execution-grade language has crept in. All purely cosmetic — no real broker plumbing — but must be neutralized first so the regex guard test can lock the door behind us.

| # | File | Current | Replacement |
|---|---|---|---|
| 1 | [lib/admin/truth-layer.ts](../lib/admin/truth-layer.ts#L31) | `\| "EXECUTE"` (type union) | `\| "RESEARCH_READY"` |
| 2 | [lib/admin/truth-layer.ts](../lib/admin/truth-layer.ts#L193) | `executionReady` field | `researchReady` |
| 3 | [lib/admin/morning-brief.ts](../lib/admin/morning-brief.ts#L662) | `buildBrokerFillSyncReport` + `MorningBrokerFillSyncReport` + `brokerLinked` + `brokerTaggedTrades` | `buildJournalTagReconciliationReport` + `JournalTagReconciliationReport` + `journalTagged` + `taggedTrades` |
| 4 | [lib/admin/scan-context.ts](../lib/admin/scan-context.ts#L45) | `brokerConnected: false` | _remove field entirely_ |
| 5 | [app/admin/operator-terminal/page.tsx](../app/admin/operator-terminal/page.tsx#L86) | "⛔ Kill Switch Active — All execution paused" | "⏸ Auto-Scan Paused" |
| 6 | [app/admin/risk/page.tsx](../app/admin/risk/page.tsx#L57) | "Kill Switch" pill | "Alert Posture" |
| 7 | [app/admin/page.tsx](../app/admin/page.tsx#L298) | `riskPermission === "KILL"` → "stand down" | "Suppress alerts" |
| 8 | [app/admin/commander/page.tsx](../app/admin/commander/page.tsx#L130) | returns `"BLOCK"` permission | returns `"NO_RESEARCH"` |
| 9 | [app/admin/commander/page.tsx](../app/admin/commander/page.tsx#L348) | "KILL SWITCH ON/OFF" pill | "RESEARCH ALERTS PAUSED/ACTIVE" |
| 10 | [app/admin/morning-brief/page.tsx](../app/admin/morning-brief/page.tsx) | "Broker / Fill Sync", `brokerSync`, "Sync Fills" button, `broker_sync` action | "Journal Tag Reconciliation", `journalTagSync`, "Reconcile Tags" |

---

## Phase 1 — Lockdown & Boundary _(do this first, in one PR)_ ✅ SHIPPED

**Goal:** Remove all execution-grade language and lock the door behind us with a regex test so it can never come back.

- [x] Mount `<AdminBoundaryBanner />` in [app/admin/layout.tsx](../app/admin/layout.tsx) — small persistent strip reading `PRIVATE RESEARCH TERMINAL — NO BROKER EXECUTION`
- [x] Apply UI text renames (rows 5–10 + extra cleanup in `truth-layer.ts`, `morning-brief.ts`, `OperatorTopToolbar.tsx`, `TruthRail.tsx`, `alerts/page.tsx`, `operator-terminal/page.tsx` keyboard hints)
- [ ] **Deferred to Phase 1.5** — internal type renames (rows 1–4, row 8): `executionReady` field, `OperatorAction` `"EXECUTE"` literal, broker* type/symbol names, `brokerConnected` field, commander `"BLOCK"` permission. These have ~30 internal call sites and zero UX impact; safer as a focused follow-up PR now that the regex test prevents new UI drift.
- [x] Create `lib/admin/requireAdmin.ts` as a re-export of `lib/adminAuth.ts`'s `requireAdmin`
- [x] Add [test/admin/boundaryLanguage.test.ts](../test/admin/boundaryLanguage.test.ts) — regex scan asserting these verbs are absent under `/app/admin/**`, `/components/admin/**`, `/lib/admin/**`:
  - `Place Order`, `Submit Order`, `Buy Now`, `Sell Now`, `Execute Trade`, `Execute Now`, `Kill Switch`, `Send to Broker`, `Auto Trade`, `Deploy Capital`, `Order Ticket`, `Bracket Order`
  - Plus asserts `<AdminBoundaryBanner />` is mounted in admin layout and the banner text contains the boundary declaration
- [x] Updated `test/commanderCommandState.test.ts` to assert new `RESEARCH ALERTS PAUSED` pill text
- [x] Run `npx vitest run` (full suite) — green (394/394)
- [x] Run `npm run build` with full env vars — green (also fixed pre-existing `riskLoadLabel === 'Elevated'` TS error in `app/tools/portfolio/page.tsx` in passing)
- [x] Commit + push

**Exit criteria met:** Zero forbidden UI verbs in admin tree; banner visible on every admin route; boundary test green; full suite green; build green.

---

## Phase 1.5 — Internal Type Rename _(zero UX impact, but tighten the lexicon)_ ✅ SHIPPED (partial)

**Goal:** Bring internal type/field names in line with the research-only boundary now that the UX text and regex guard are locked in. Pure refactor — no behavior changes.

- [x] [lib/admin/truth-layer.ts](../lib/admin/truth-layer.ts) — `OperatorAction` union: `"EXECUTE"` → `"RESEARCH_READY"` (admin-internal type, separate from operator engine's `"EXECUTE"` literal which stays)
- [x] [lib/admin/truth-layer.ts](../lib/admin/truth-layer.ts) — `TruthReadiness.executionReady` → `researchReady` (incl. all 5 internal references + `TruthRail.tsx` consumer)
- [x] [lib/admin/morning-brief.ts](../lib/admin/morning-brief.ts) — `MorningBrokerFillSyncReport` → `JournalTagReconciliationReport`; `buildBrokerFillSyncReport` → `buildJournalTagReconciliationReport`; `brokerLinked` → `journalTagged`; `brokerTaggedTrades` → `taggedTrades`; `openBrokerTaggedTrades` → `openTaggedTrades`; `totalBrokerTaggedPl` → `totalTaggedPl`; `brokerSync` field on `MorningDailyReview` → `journalTagSync`
- [x] [app/admin/morning-brief/page.tsx](../app/admin/morning-brief/page.tsx) — client `MorningBrokerFillSync` type → `JournalTagReconciliation`; state `brokerSync` → `journalTagSync`; all field accesses updated
- [x] [app/api/admin/morning-brief/actions/route.ts](../app/api/admin/morning-brief/actions/route.ts) — `MorningBriefAction` `"broker_sync"` → `"journal_tag_sync"`; response key updated
- [ ] **Skipped** [lib/admin/scan-context.ts](../lib/admin/scan-context.ts) `brokerConnected` field — required by shared `ExecutionEnvironment` type in [types/operator.ts](../types/operator.ts) which is used by the operator engine. Out of admin-tree scope.
- [ ] **Skipped** [app/admin/commander/page.tsx](../app/admin/commander/page.tsx) `deriveCommandState` `"BLOCK"` → `"NO_RESEARCH"` — `CommandState` type and `BLOCK` literal flow through tone helpers, command reasons, and assertions. Defer to Phase 8 polish where we can add a proper `NoResearchCommandState` and rewire test expectations cleanly.

**Validation:** vitest 394/394 green; `npm run build` green. Zero behavior change — pure rename refactor.

---

## Algorithm Audit Notes _(Phase 1.5 sweep — captured for future hardening, no fixes applied)_

Findings from a careful read of [lib/admin/truth-layer.ts](../lib/admin/truth-layer.ts) and [lib/admin/morning-brief.ts](../lib/admin/morning-brief.ts) math:

### `truth-layer.ts` — `toConfidenceClass` (L137)
- Thresholds: HIGH ≥ 0.85, MODERATE ≥ 0.70, WEAK ≥ 0.55, else INVALID. Bands are symmetric (15-pt wide MODERATE/WEAK, 15-pt-wide HIGH up to 1.0). **Verdict: clean.**

### `truth-layer.ts` — `resolveReadiness` (L420)
- `researchReady` requires `finalPermission ∈ {ALLOW, ALLOW_REDUCED}` AND `confidenceScore ≥ 0.55`. Coupling readiness to the WEAK confidence floor is consistent with `toConfidenceClass`. **Verdict: clean.**
- `thesisState`: STRONG = conf ≥0.7 AND structureQuality ≥0.6; DEGRADED = conf ≥0.5; else INVALID. Note structureQuality threshold (0.6) doesn't appear elsewhere as a constant — consider extracting to a named constant if it gets reused.

### `truth-layer.ts` — `buildReasonStack` (L211)
- **Penalty impact normalization** (L228): `Math.min(Math.abs(pen.value) * 2, 0.9)` — assumes raw `pen.value` is on a 0..0.45 effective scale. If upstream changes scaling, impacts cluster at 0.9 ceiling silently. **Recommendation:** comment the expected input range, or normalize against a known max.
- **Boost impact normalization** (L256): same `Math.min(boost.value * 2, 0.9)` shape — symmetric with penalties, good.
- **Weak/Strong dimension thresholds** (0.4 / 0.7): Non-overlapping bands so a single dimension can't fire as both NEGATIVE and POSITIVE in the same scan. **Verdict: clean.**
- **Top-5 truncation** (L294): Cockpit-friendly but can hide important secondary reasons in dense scans. Consider exposing the full list via a "show more" disclosure in Phase 4.
- **Dedupe by code, keep highest impact** (L283): Correct but could lose diagnostic context if two pipelines produce the same code with different `direction`. Today only POSITIVE/NEGATIVE map 1:1 with code, so safe.

### `truth-layer.ts` — `resolveOperatorAction` (L188)
- Stale/unavailable/partial data short-circuits to `MANUAL_REVIEW`. Good fail-closed behavior.
- `BLOCK + setupValid` returns `IGNORE`; `BLOCK + !setupValid` returns `NO_ACTION`. Mostly redundant since BLOCK rarely has a valid setup, but harmless.

### `truth-layer.ts` — `resolveFreshness` (L312)
- `dataState`: > 300s STALE, > 60s DELAYED. **Concern:** for daily/weekly timeframes a 60-second-old verdict is still LIVE in any practical sense. Consider scaling thresholds by timeframe (e.g. STALE = max(300s, 0.5×timeframe)) in Phase 2 alongside the broader Truth Layer split.

### `morning-brief.ts` — `buildMorningRiskGovernor` (L1898)
- `baseMaxTrades`: 1 if rule breaks > 0 OR discipline < 60; 4 if execution ≥ 75; else 3. Hard cap to 0 if no live equity OR research alerts paused OR daily drawdown ≥ 4%. **Verdict: defensible** — rule-break gate is the strongest signal and correctly dominates.
- Daily drawdown hard stop at 4% is a magic number; consider making it a `RISK_HARD_STOP_PCT` constant.

### `morning-brief.ts` — `formatUsd` and rounding
- All monetary values use `Intl.NumberFormat` with `maximumFractionDigits: 0`. Consistent across the file.

### `truth-layer.ts` — `effectiveSize` (L490)
- `finalVerdict === "BLOCK" ? 0 : Math.round(v.sizeMultiplier * 100) / 100` — clamps to 2 decimals. **Verdict: clean.**

**Action items captured for future phases (do not fix now without test coverage):**
- Phase 2: extract magic numbers (`STRUCTURE_QUALITY_STRONG = 0.6`, `RISK_HARD_STOP_PCT = 0.04`, `DATA_STALE_SEC = 300`, `DATA_DELAYED_SEC = 60`) into a `lib/admin/constants.ts`
- Phase 2: scale `dataState` thresholds by timeframe so a 1h verdict isn't "DELAYED" 60 seconds after generation
- Phase 4: surface full reason stack (not just top 5) on the symbol research terminal

---

## Phase 2 — Truth Layer ✅ SHIPPED

**Goal:** Single source of truth for "is this data trustworthy?" surfaced on every panel.

- [x] Create [lib/engines/dataTruth.ts](../lib/engines/dataTruth.ts) exporting `computeDataTruth(input): DataTruth` (statuses: `LIVE`, `CACHED`, `DELAYED`, `STALE`, `DEGRADED`, `MISSING`, `ERROR`, `SIMULATED`) with **timeframe-aware staleness scaling** (audit fix)
- [x] Split [lib/admin/truth-layer.ts](../lib/admin/truth-layer.ts) → readiness logic now in [lib/engines/researchReadiness.ts](../lib/engines/researchReadiness.ts) (`classifyConfidence`, `isResearchReady`, `classifyThesis`, `computeReadiness`)
- [x] Extract magic numbers to [lib/admin/constants.ts](../lib/admin/constants.ts) (confidence bands, evidence thresholds, risk governor stops, freshness windows)
- [x] Create [components/admin/shared/DataTruthBadge.tsx](../components/admin/shared/DataTruthBadge.tsx) shared component
- [x] Mount badge in [TruthRail.tsx](../components/admin/operator/TruthRail.tsx) header (further cards adopt in Phase 3+)
- [x] Add [test/engines/dataTruth.test.ts](../test/engines/dataTruth.test.ts) (20 tests covering decision tree, timeframe scaling, UI helpers)
- [x] vitest 414/414 green, build green

---

## Phase 3 — Opportunity Research Board ✅ SHIPPED

**Goal:** One screen ranks every symbol by Research Score × Data Trust.

- [x] Create [lib/admin/adminTypes.ts](../lib/admin/adminTypes.ts) — exports `InternalResearchScore`, `AdminOpportunityRow`, `SetupDefinition`, `AdminResearchAlert` skeleton
- [x] Create [lib/engines/internalResearchScore.ts](../lib/engines/internalResearchScore.ts) — pure `computeInternalResearchScore(input): InternalResearchScore`
  - **Hard floor**: `dataTrustScore < 50` ⇒ `lifecycle = DATA_DEGRADED`, score capped at 35
  - **One-axis cap**: no single axis (of 9) contributes > 25% of composite
  - **Stale data penalty**: -25 (STALE), -15 (DEGRADED/MISSING/ERROR), -8 (DELAYED)
- [x] Create [lib/engines/setupClassifier.ts](../lib/engines/setupClassifier.ts) — 16 setup types (TREND_CONTINUATION, SQUEEZE_EXPANSION, FAILED_BREAKOUT, EXHAUSTION_FADE, MOMENTUM_IGNITION, RECLAIM_AND_HOLD, BREAKDOWN_RETEST, LIQUIDITY_SWEEP, RANGE_REVERSION, RANGE_BREAKOUT, VOLATILITY_CONTRACTION, GAP_FILL, HIGHER_TIMEFRAME_REJECTION, TREND_PULLBACK, MEAN_REVERSION_TRAP, NO_SETUP)
- [x] Create [app/api/admin/opportunities/route.ts](../app/api/admin/opportunities/route.ts) — ranked rows API
- [x] Create [app/admin/opportunity-board/page.tsx](../app/admin/opportunity-board/page.tsx)
- [x] Create [components/admin/AdminOpportunityBoard.tsx](../components/admin/AdminOpportunityBoard.tsx) — columns: Rank, Symbol, Bias, Setup, Score, Lifecycle, Dominant Axis, Data Trust badge, Penalties, Boosts, Review CTA (no "Trade"/"Execute"/"Order"/"Enter")
- [x] Filters: Market, Timeframe, Min Score, Min Data Trust, Show Suppressed toggle
- [x] Suppress rows where lifecycle ∈ {EXHAUSTED, TRAPPED, INVALIDATED, NO_EDGE, DATA_DEGRADED} unless toggled
- [x] Tests: [test/engines/internalResearchScore.test.ts](../test/engines/internalResearchScore.test.ts) (17 tests) — score engine + classifier (axis cap, hard floor, penalties, boosts, lifecycle)
- [x] Mounted in admin nav under Markets section
- [x] vitest 35 files / 431 tests green, build green

---

## Phase 4 — Symbol Research Terminal ✅ SHIPPED

**Goal:** One-symbol research cockpit that consumes the centralized score.

- [x] Canonical `/admin/symbol/[symbol]` page (legacy `/admin/terminal/[symbol]` kept + relabeled in nav)
- [x] `<AdminResearchVerdictPanel />` — top-of-page summary (symbol/setup/score/lifecycle/dominant axis + DataTruthBadge)
- [x] `<AdminEvidenceStack />` — 9-axis horizontal bars with dominant marker
- [x] `<AdminResearchScoreBreakdown />` — raw / penalties / boosts / final math + per-row lists
- [x] `<AdminScenarioMap />` — Bullish / Bearish / Neutral / Invalidation cards from levels + targets
- [x] Symbol API extended with `research: { dataTruth, score, setup }`
- [x] Save Research Case → POST `/api/admin/research-cases` (auto-creates `admin_research_cases` table)
- [x] Opportunity Board Review CTA repointed to `/admin/symbol/...`
- [x] `Symbol Research (SR)` nav entry added
- [x] Tests: `test/admin/symbolResearchArtifact.test.ts` (artifact composition + JSON round-trip + DATA_DEGRADED path)
- [x] vitest 36 / 434 green · build green · boundary guard green
- [ ] (Deferred) Refactor legacy ConfidenceCard / VerdictHeaderCard / RiskGovernorCard / IndicatorMatrixCard to consume `InternalResearchScore` (legacy cockpit kept as-is; canonical page is the new surface)

---

## Phase 5 — Alerts & Discord ✅ SHIPPED

**Goal:** Threshold-fired research alerts with cooldown + duplicate suppression.

- [x] Create [lib/engines/researchAlertEngine.ts](../lib/engines/researchAlertEngine.ts)
- [x] Create [lib/alerts/discord.ts](../lib/alerts/discord.ts) — payload header: `PRIVATE RESEARCH ALERT — NOT BROKER EXECUTION`
- [x] Create [lib/alerts/email.ts](../lib/alerts/email.ts)
- [x] Create [lib/alerts/alertSuppression.ts](../lib/alerts/alertSuppression.ts) — cooldown, duplicate, evidence threshold, DATA_DEGRADED block
- [x] New [app/api/admin/research-alerts/route.ts](../app/api/admin/research-alerts/route.ts) — POST evaluate+log; GET log (auto-creates `admin_research_alerts` table)
- [x] Upgrade [app/admin/alerts/page.tsx](../app/admin/alerts/page.tsx) — Research Alerts (Internal) panel; FIRED/SUPPRESSED rows link to `/admin/symbol/...`
- [x] Tests: payload header verbatim, embed classification, email subject prefix, suppression duplicate-in-cooldown, lifecycle blocks, threshold blocks, engine FIRED + SUPPRESSED outcomes
- [x] vitest 37 / 447 green · build green · boundary guard green

---

## Phase 6 — ARCA Admin Research ✅ SHIPPED

**Goal:** Private research copilot bound to score + evidence + truth.

- [x] `<AdminARCAPanel />` with 9 modes: Explain Rank, Challenge Setup, Find Missing Evidence, Summarize Watchlist, Detect Contradictions, Prepare Research Alert, Review Journal Mistake, Compare Two Symbols, What Changed Since Last Scan
- [x] Server system prompt explicitly forbids execution verbs (`buy`, `sell`, `execute`, `place order`, `position size`, `deploy`) + carries `ARCA_REFUSAL_CLAUSE`
- [x] Output enforced to `ArcaAdminResearchOutput` shape via `validateArcaOutput` (rejects forbidden phrases in any text field)
- [x] Server-side override force-stamps `mode`, `symbol`, and `classification` so the model can never break the contract
- [x] Validation failures fall back to a deterministic safe payload (no broken UI, no risky text)
- [x] Auto-binds `InternalResearchScore` + `EvidenceStack` + `DataTruth` via the cockpit page
- [x] Tests: refusal clause present, every forbidden verb in prompt, validator accepts canonical, validator rejects each forbidden phrase across headline + reasoning + evidence + risks, mode catalog locked at 9
- [x] vitest 38 / 461 green · build green · boundary guard green

---

## Phase 7 — Journal Learning

**Goal:** Pattern detection from past saved research cases.

- [ ] Create [lib/engines/journalLearning.ts](../lib/engines/journalLearning.ts)
- [ ] Create [app/admin/journal-learning/page.tsx](../app/admin/journal-learning/page.tsx)
- [ ] Create `<AdminJournalDNAPanel />`
- [ ] Surface "Journal Pattern Match" boost in `internalResearchScore`
- [ ] Build + commit

---

## Phase 8 — Elite UI Polish

**Goal:** Command palette, shortcuts, missing pages, consolidated diagnostics.

- [ ] Create `<AdminCommandPalette />` — bind Cmd-K
- [ ] Keyboard shortcuts in `<AdminTerminalShell />`:
  - `/` palette · `S` symbol search · `O` opportunity board · `G` Golden Egg · `T` time confluence · `V` DVE · `A` alerts · `D` data health · `J` journal learning · `Esc` close · `Enter` open selected
- [ ] Create `<AdminProviderHealthGrid />`
- [ ] Create `<AdminWebhookStatusPanel />`
- [ ] Consolidate `/admin/diagnostics` + `/admin/system` → [/admin/data-health](../app/admin/data-health)
- [ ] Create [/admin/model-diagnostics](../app/admin/model-diagnostics)
- [ ] Create [/admin/backtest-lab](../app/admin/backtest-lab) (or rename `/admin/quant`)
- [ ] Build + commit

---

## File Inventory — Create

```
app/admin/opportunity-board/page.tsx
app/admin/symbol/[symbol]/page.tsx          # canonical (deprecate /admin/terminal/[symbol])
app/admin/data-health/page.tsx
app/admin/model-diagnostics/page.tsx
app/admin/journal-learning/page.tsx
app/admin/backtest-lab/page.tsx

app/api/admin/opportunities/route.ts
app/api/admin/data-health/route.ts
app/api/admin/model-diagnostics/route.ts
app/api/admin/journal-learning/route.ts
app/api/admin/backtest-lab/route.ts
app/api/admin/time-confluence/route.ts

components/admin/AdminBoundaryBanner.tsx
components/admin/AdminTerminalShell.tsx
components/admin/AdminTopCommandStrip.tsx
components/admin/AdminOpportunityBoard.tsx
components/admin/AdminResearchVerdictPanel.tsx
components/admin/AdminEvidenceStack.tsx
components/admin/AdminResearchScoreBreakdown.tsx
components/admin/AdminDataTruthGrid.tsx
components/admin/AdminAlertRail.tsx
components/admin/AdminARCAPanel.tsx
components/admin/AdminProviderHealthGrid.tsx
components/admin/AdminWebhookStatusPanel.tsx
components/admin/AdminJournalDNAPanel.tsx
components/admin/AdminCommandPalette.tsx
components/admin/AdminAlertPostureCard.tsx

lib/admin/requireAdmin.ts                   # re-export of lib/adminAuth.ts:requireAdmin
lib/admin/adminRoutes.ts
lib/admin/adminTypes.ts                     # InternalResearchScore, AdminResearchAlert, etc.

lib/engines/internalResearchScore.ts
lib/engines/setupClassifier.ts
lib/engines/dataTruth.ts
lib/engines/researchReadiness.ts            # split from truth-layer
lib/engines/researchAlertEngine.ts
lib/engines/liquiditySweep.ts
lib/engines/modelDiagnostics.ts
lib/engines/journalLearning.ts

lib/alerts/discord.ts
lib/alerts/email.ts
lib/alerts/alertSuppression.ts

test/admin/requireAdmin.test.ts
test/admin/boundaryLanguage.test.ts
test/engines/internalResearchScore.test.ts
test/engines/setupClassifier.test.ts
test/engines/dataTruth.test.ts
test/engines/alertSuppression.test.ts
```

## File Inventory — Modify

```
app/admin/layout.tsx                        # mount <AdminBoundaryBanner />
app/admin/operator-terminal/page.tsx        # remove "Kill Switch" copy
app/admin/risk/page.tsx                     # convert to AdminAlertPostureCard
app/admin/page.tsx                          # remove "stand down" copy
app/admin/commander/page.tsx                # remove BLOCK/KILL SWITCH labels
app/admin/morning-brief/page.tsx            # rename Broker → Journal Tag
lib/admin/truth-layer.ts                    # remove "EXECUTE", split engine
lib/admin/morning-brief.ts                  # rename buildBrokerFillSyncReport → journal tag
lib/admin/scan-context.ts                   # drop brokerConnected
lib/admin/permissions.ts                    # convert to alert posture
lib/admin/hooks.ts                          # add useResearchScore, useOpportunityBoard
components/admin/operator/OperatorRightRail.tsx  # split into AlertRail + ARCAPanel
components/admin/operator/RiskGovernorCard.tsx   # convert/rename
test/layoutFlowAudit.test.ts                # add admin language guards
```

---

## Reference Type Shapes (from brief)

### `InternalResearchScore` _(brief Section 10)_

```ts
type InternalResearchScore = {
  symbol: string;
  assetClass: "equity" | "crypto" | "forex" | "commodity" | "index";
  timestamp: string;

  totalResearchScore: number; // 0-100, never exceeds 100
  evidenceScore: number;
  cleanlinessScore: number;
  timingScore: number;
  volatilityScore: number;
  trendScore: number;
  liquidityScore: number;
  optionsScore?: number;
  macroScore: number;
  dataTrustScore: number;
  journalFitScore?: number;

  penalties: {
    staleData: number;
    missingEvidence: number;
    lowLiquidity: number;
    conflictingSignals: number;
    lateMove: number;
    overextended: number;
    badSpread: number;
  };

  boosts: {
    timeConfluence: number;
    volatilityCompression: number;
    gammaLevelProximity: number;
    liquiditySweep: number;
    regimeAlignment: number;
    journalPatternMatch: number;
  };

  lifecycle:
    | "EARLY"
    | "DEVELOPING"
    | "RESEARCH_READY"
    | "ACTIVE_RESEARCH"
    | "LATE"
    | "EXHAUSTED"
    | "TRAPPED"
    | "INVALIDATED"
    | "NO_EDGE"
    | "DATA_DEGRADED";

  bias: "BULLISH_RESEARCH" | "BEARISH_RESEARCH" | "NEUTRAL" | "MIXED";
  setupType: string;
  explanation: string;
  missingEvidence: string[];
  contradictionFlags: string[];
  invalidationConditions: string[];
  nextResearchChecks: string[];
};
```

### `AdminResearchAlert` _(brief Section 16)_

```ts
type AdminResearchAlert = {
  id: string;
  symbol: string;
  assetClass: string;
  alertType: string;
  severity: "INFO" | "WATCH" | "HIGH" | "CRITICAL";
  lifecycle: string;
  researchScore: number;
  reason: string;
  evidence: string[];
  missingEvidence: string[];
  invalidationConditions: string[];
  contradictionFlags: string[];
  dataTrust: string;
  createdAt: string;
  sentToDiscord: boolean;
  discordStatus?: number;
  sentToEmail: boolean;
  suppressed: boolean;
  suppressionReason?: string;
};
```

### `DataTruth` _(brief Section 18)_

```ts
type DataTruth = {
  source: string;
  status: "LIVE" | "CACHED" | "STALE" | "DEGRADED" | "MISSING" | "ERROR" | "SIMULATED";
  fetchedAt: string;
  cacheAgeSeconds: number;
  coverage: number; // 0-1
  warnings: string[];
};
```

---

## Allowed vs Forbidden Language

### Allowed research labels
`READY` · `ACTIVE` · `LATE` · `EXHAUSTED` · `TRAPPED` · `INVALIDATED` · `HIGH PRIORITY` · `WATCH` · `NO EDGE` · `DATA DEGRADED`

### Forbidden execution language _(boundary test will fail the build)_
`Execute Trade` · `Place Order` · `Submit Order` · `Buy Now` · `Sell Now` · `Close Trade` · `Increase Position` · `Reduce Position` · `Auto Trade` · `Deploy Capital` · `Send to Broker` · `Order Ticket` · `Bracket Order` · `Market Order` · `Limit Order` · `Take Profit Order` · `Stop Loss Order` · `Exercise Option` · `Kill Switch`

### Safe replacement vocabulary

| Avoid | Use |
|---|---|
| Execute trade | Save research case |
| Place order | Create scenario note |
| Buy | Bullish research bias |
| Sell | Bearish research bias |
| Entry | Reference zone |
| Stop loss | Invalidation area |
| Take profit | Reaction zone |
| Target | Key reaction level |
| Trade signal | Research alert |
| Trading bot | Research automation |
| Auto trade | Auto-scan / auto-alert |
| Position sizing | Risk model / scenario sizing |
| Order ticket | Scenario ticket |
| Trade ready | Research-ready |
| Execute | Open research terminal |
| Deploy | Save / monitor / review |
| Kill switch | Pause auto-scan / Alert posture |

---

## Resume Checklist (use at start of every new session)

1. `git pull origin main`
2. Open this file — find current Phase, find first unchecked box
3. Verify environment: `npm install` if `package.json` changed
4. Run baseline tests: `npx vitest run test/layoutFlowAudit.test.ts --reporter=dot`
5. Pick up at the first unchecked box in the active Phase
6. Update Quick Status table + check boxes as you go
7. End-of-session: update **Last session ended at** + **Next action when resuming** lines at top
