# ARCA Meta-Brain — Repo Verification

Verified against the repository at HEAD on the date this file was written. No claim below is taken from the prior architecture doc; every line is grounded in a file read.

Verdict summary:

| # | Module | Claimed | Verified |
|---|---|---|---|
| 1 | Doctrine Engine | B | PARTIAL — UI orphaned (not in nav); no test; `todaysDoctrineWarning` uses heuristic, not real review state |
| 2 | Mistake Taxonomy | B | PARTIAL — engine called by cycle (frequency only); never invoked on close; no UI; no labeler runner |
| 3 | Regret Map | S | STUB — table + engine + route; no UI; no writer; no test |
| 4 | Adversarial ARCA | B | LIVE — wired into `simulateCycle`, debate_id stamped on orders; but freshness input is **hardcoded to "fresh" (LIE)** and info-edge is null |
| 5 | Capital Allocation | W | DEAD — engine exists, **never called anywhere** in the cycle or any route (PATCHED below) |
| 6 | Regime-Playbook Matrix | W | PARTIAL — engine + decision wrapper wired into live `simulateCycle.ts`; UI editor + default-seed still missing |
| 7 | Information Edge | B | PARTIAL (live-cycle fixed; UI/report still missing) — engine + route + 4 deriver tests + cycle integration; opportunity board does not consume |
| 8 | No-Trade Alpha | B | PARTIAL — `recordNoTradeRejection` called only for debate rejections; pre-trade risk blocks and decisionEngine gate rejections do not log; no UI; no outcome cron |
| 9 | Self-Critique | S | STUB — table + engine + route; no UI; no scheduled writer; no test |
| 10 | Commander Mode | B | PARTIAL — page exists at `/admin/command`, **not in nav**, panels render but use heuristic evidence values and have no source links |

Failure-mode coverage status:

- ✅ Order without recorded reason → blocked (debate gate live)
- ❌ Data staleness in cycle → bypassed (freshness hardcoded to "fresh" in `simulateCycle.ts`)
- ❌ Uniform sizing across grades → not enforced (Capital Allocation dead)
- ⚠ Wrong-regime playbook firing → blocked by Regime-Playbook Matrix decision wrapper in `simulateCycle.ts` (DISABLED / WAIT_FOR_CONFIRMATION / UNKNOWN_REGIME-strict). Still requires operator to seed `arca_regime_playbook_matrix` rows + supply `currentRegime` to the cycle.
- ✅ Crowded/obvious setup penalty → reaches prosecutor (Information Edge now computed per candidate, P0-B)
- ⚠ Survivorship bias → table exists, nothing writes to it
- ⚠ Improvement amnesia → table exists, nothing writes to it
- ⚠ Silent doctrine drift → append-only enforced at DB, but no auto-promotion writer

---

## 1. Doctrine Engine

- **Claimed status**: B (built + wired)
- **Verified status**: PARTIAL
- **Files inspected**: [lib/admin/arca-brain/doctrineEngine.ts](lib/admin/arca-brain/doctrineEngine.ts), [app/api/admin/doctrine/route.ts](app/api/admin/doctrine/route.ts), [app/api/admin/doctrine/reviews/route.ts](app/api/admin/doctrine/reviews/route.ts), [app/admin/doctrine/page.tsx](app/admin/doctrine/page.tsx)
- **Tables inspected**: `arca_doctrine_rules`, `arca_doctrine_reviews` (migration [migrations/096_arca_meta_brain.sql](migrations/096_arca_meta_brain.sql))
- **Routes inspected**: `/api/admin/doctrine` (GET, POST), `/api/admin/doctrine/reviews` (GET, POST) — both `requireAdmin` ✓
- **UI inspected**: `/admin/doctrine` — fetches both routes, calls approveReview ✓
- **Reports inspected**: `todaysDoctrineWarning(workspaceId)` is consumed by Commander panel 10
- **Tests inspected**: none

- **What is real**: schema, append-only review trigger, engine functions, two routes, one page consuming both routes
- **What is missing**: navigation entry (page exists but is orphaned — no link in `app/admin/layout.tsx`); review-on-close writer; auto-promotion writer from self-critique
- **What is dead/orphaned**: `/admin/doctrine` is reachable only by direct URL
- **What is unsafe**: `todaysDoctrineWarning` returns the most recent rule with `proposed_change` set OR `status='UNDER_REVIEW'` — it is heuristic, not tied to actual evidence
- **What is untested**: every function
- **Mock data**: none
- **What breaks if this runs live**: rules can be created but never reviewed automatically; operator must manually run reviews; no warning loop closes
- **Exact patch required**: (a) add nav link in `app/admin/layout.tsx`; (b) test `proposeDoctrineReview` → `approveDoctrineReview` flips rule status and stamps `approved_at`; (c) writer that emits a `DAILY` review row when a `BROKE_RULE` or `STALE_DATA_DECISION` mistake-label arrives
- **Estimated effort**: low
- **Priority**: P2 (operator can still drive manually)

---

## 2. Mistake Taxonomy

- **Claimed status**: B
- **Verified status**: PARTIAL
- **Files inspected**: [lib/admin/arca-brain/mistakeLabeler.ts](lib/admin/arca-brain/mistakeLabeler.ts), [app/api/admin/mistakes/route.ts](app/api/admin/mistakes/route.ts)
- **Tables inspected**: `arca_trade_mistake_labels` (FK to `arca_trades`, `arca_portfolios`, `arca_doctrine_rules`)
- **Routes inspected**: `/api/admin/mistakes` — `requireAdmin` ✓ — accepts `tradeId` POST
- **UI inspected**: **none** (no `app/admin/mistakes/*` page exists)
- **Reports inspected**: `recentMistakeFrequency(workspaceId, 7)` is called in `simulateCycle.ts:170` and flows to debate context
- **Tests inspected**: [test/admin/arcaBrainCore.test.ts](test/admin/arcaBrainCore.test.ts) — covers `BROKE_RULE` and `POSITION_TOO_LARGE` branches only

- **What is real**: deterministic `classifyMistake` (pure), persist via `recordMistakeLabel`, frequency rollup
- **What is missing**: no caller invokes `classifyMistake` + `recordMistakeLabel` on trade close anywhere — `markAndMaybeExit` and `positionEngine.ts` do not call the labeler; UI page; tests for 19 of 21 branches
- **What is dead/orphaned**: `classifyMistake` for `GOOD_TRADE_BAD_OUTCOME`, `LATE_ENTRY`, `EARLY_ENTRY`, `CHASING`, `LOW_QUALITY_SETUP`, `BAD_REGIME`, `BAD_STOP_PLACEMENT`, `TARGET_TOO_AMBITIOUS`, `EXIT_TOO_EARLY`, `HELD_TOO_LONG`, `IGNORED_BEAR_CASE`, `STALE_DATA_DECISION`, `OVERLAPPED_EXPOSURE`, `NEWS_EVENT_RISK`, `OPTIONS_FLOW_MISREAD`, `VOLATILITY_TRAP`, `LIQUIDITY_SWEEP_FAILED`, `PLAYBOOK_INVALID`, `NO_MISTAKE_SYSTEM_VALID` are unreachable in the live flow
- **What is unsafe**: `recentMistakeFrequency` returns 0 on every cycle today (no rows are written), so the debate's `elevated_recent_mistake_rate` block can never fire
- **What is untested**: classifier branches beyond two
- **Mock data**: none
- **What breaks if this runs live**: zero learning loop on closed trades — every closed trade is forgotten
- **Exact patch required**: hook into `positionEngine.markAndMaybeExit` on close: build `ClosedTradeForLabeling` from the trade row + entry packet + freshness snapshot, call `classifyMistake` + `recordMistakeLabel`
- **Estimated effort**: medium (requires reading entry packet metadata back from `arca_simulated_orders.source_edge_packet_id`)
- **Priority**: P1 — the learning loop is the whole point

---

## 3. Regret Map

- **Claimed status**: S
- **Verified status**: STUB
- **Files inspected**: [lib/admin/arca-brain/regretMap.ts](lib/admin/arca-brain/regretMap.ts), [app/api/admin/regret-map/route.ts](app/api/admin/regret-map/route.ts)
- **Tables inspected**: `arca_regret_map_entries`
- **Routes inspected**: GET/POST, `requireAdmin` ✓
- **UI inspected**: none
- **Reports inspected**: none — no report consumes
- **Tests inspected**: none

- **What is real**: schema, two functions
- **What is missing**: nothing writes rows ever; no UI; no scheduled comparator
- **What is dead/orphaned**: entire module
- **What is unsafe**: nothing because nothing runs
- **What is untested**: everything
- **Mock data**: none
- **What breaks if this runs live**: nothing — silent
- **Exact patch required**: nightly comparator job that joins `arca_simulated_orders`, `arca_trades`, and `journal_entries` to emit one regret row per overlap window
- **Estimated effort**: medium
- **Priority**: P3

---

## 4. Adversarial ARCA

- **Claimed status**: B
- **Verified status**: LIVE (with one bug)
- **Files inspected**: [lib/admin/arca-brain/adversarialDebate.ts](lib/admin/arca-brain/adversarialDebate.ts), [lib/admin/portfolio-lab/simulateCycle.ts](lib/admin/portfolio-lab/simulateCycle.ts), [app/api/admin/debates/route.ts](app/api/admin/debates/route.ts)
- **Tables inspected**: `arca_trade_debates` (mode CHECK enforced in app layer), `arca_simulated_orders.debate_id`
- **Routes inspected**: `/api/admin/debates` GET only — `requireAdmin` ✓
- **UI inspected**: surfaced indirectly via Commander Mode panels 1-4 and 8
- **Reports inspected**: every Commander panel that names a candidate carries the debate id internally
- **Tests inspected**: none specific to the debate engine

- **What is real**: full role builders, deterministic `decide()`, persistence, `linkDebateToOrder`, cycle integration; `arca_simulated_orders.debate_id` is populated for every order that the cycle creates after the patch (legacy rows are NULL by design)
- **What is missing**: dedicated `/admin/debates` UI; per-symbol debate trail page; debate-engine test
- **What is dead/orphaned**: `listRecentDebates` (engine fn) is only used internally by `commanderMode`; the GET route returns it but no page consumes
- **What is unsafe**: **`simulateCycle` passes `freshness: "fresh"` as a literal regardless of actual edge-packet age**, which means the prosecutor's freshness floor is permanently 0. This silently neutralises one of the three prosecutor weighting inputs. **Also passes `informationEdgeScore: null` and `informationEdgeBand: null`** — the second prosecutor weighting input is also dead. **PATCHED below.**
- **What is untested**: debate decision matrix (TAKE/SKIP/SIZE_DOWN/WAIT)
- **Mock data**: none, but constant `regimeQuality: 60`, `correlationExposure: 0`, `eventRisk: 'none'`, `repeatedLossSamePlaybook: false`, `doctrineConflictRuleId: null` are all hardcoded placeholders that disable the corresponding prosecutor weights
- **What breaks if this runs live**: the debate is real, but ~half of its inputs are stubbed, so it under-rejects in stale or crowded markets
- **Exact patch required**: compute real freshness from edge-packet age (PATCHED); compute info-edge per candidate (`computeInformationEdge` over packet snapshot fields) and feed into context; lift `regimeQuality` from regime classifier output; lift `correlationExposure` from open-position correlation; check `eventRisk` from earnings calendar
- **Estimated effort**: medium-high
- **Priority**: P0 — partially patched in this pass

---

## 5. Capital Allocation Brain

- **Claimed status**: W
- **Verified status**: DEAD (before patch) → PARTIAL (after patch)
- **Files inspected**: [lib/admin/arca-brain/capitalAllocation.ts](lib/admin/arca-brain/capitalAllocation.ts)
- **Tables inspected**: `arca_capital_allocation_decisions`
- **Routes inspected**: **none** — no API route exists
- **UI inspected**: none
- **Reports inspected**: none
- **Tests inspected**: none

- **What is real**: `gradeCandidate` returns A/B/C/EXPERIMENTAL/NO_TRADE with explicit gates (drawdown halted, data stale, major event, recent-mistake floor) and a composite score
- **What is missing**: API route; UI; **call site in `simulateCycle`** (before patch); test
- **What is dead/orphaned**: entire module before this pass; after patch the grade gates the order and a row is persisted via `recordAllocationDecision`
- **What is unsafe**: a NO_TRADE grade would not be honoured before patch; after patch it short-circuits the cycle and writes a No-Trade Alpha row
- **What is untested**: grade boundaries
- **Mock data**: none
- **What breaks if this runs live**: before patch — every candidate is sized identically by `positionSizing.ts` regardless of grade. After patch — grade scales `maxRiskPercent` directly and persists the decision row
- **Exact patch required**: call `gradeCandidate` between the pre-trade risk check and the debate, skip on NO_TRADE, scale `sizing.notional`/`sizing.quantity` by the grade's `riskPercent` ratio, persist via `recordAllocationDecision(..., debateId)` after the debate (PATCHED)
- **Estimated effort**: small — DONE in this pass
- **Priority**: P0 — PATCHED

---

## 6. Regime-Playbook Matrix

- **Claimed status**: W
- **Verified status**: PARTIAL (live-cycle wired; UI editor + default-seed still missing)
- **Files inspected**: [lib/admin/arca-brain/regimePlaybookMatrix.ts](lib/admin/arca-brain/regimePlaybookMatrix.ts), [lib/admin/arca-brain/regimePlaybookDecision.ts](lib/admin/arca-brain/regimePlaybookDecision.ts), [lib/admin/portfolio-lab/simulateCycle.ts](lib/admin/portfolio-lab/simulateCycle.ts), [lib/admin/arca-brain/capitalAllocation.ts](lib/admin/arca-brain/capitalAllocation.ts), [app/api/admin/regime-matrix/route.ts](app/api/admin/regime-matrix/route.ts)
- **Tables inspected**: `arca_regime_playbook_matrix`, `arca_no_trade_alpha` (`rejection_source='REGIME_MATRIX'`), `arca_capital_allocation_decisions` (`size_adjustment_reason`, `regime_quality`)
- **Routes inspected**: GET/POST, `requireAdmin` ✓
- **UI inspected**: none — admin editor for the matrix is still not built
- **Reports inspected**: none
- **Tests inspected**: [test/admin/regimePlaybookDecision.test.ts](test/admin/regimePlaybookDecision.test.ts) (11 tests, all passing)

- **What is real**: 6-state decision wrapper `evaluateRegimePlaybook(matrix, playbookId, {assetClass, strict})` returns `RegimePlaybookDecision { status, sizeMultiplier, reason, requiredConfirmations, disqualifiers, sourceRuleId }`. Per-candidate gate runs in `simulateCycle.ts` **before** Information Edge and Capital Allocation. DISABLED / WAIT_FOR_CONFIRMATION / strict UNKNOWN_REGIME → `recordNoTradeRejection({rejectionSource:'REGIME_MATRIX', ...})` + REJECTED journal entry + `continue` (no order). REDUCE_SIZE / non-strict UNKNOWN_REGIME / UNKNOWN_PLAYBOOK → trade continues with `regimeMult` multiplied into the combined sizing alongside debate and allocation multipliers; the decision's `sizeAdjustmentReason` is persisted into `arca_capital_allocation_decisions.size_adjustment_reason`; `regimeQualityScore` (75/50/45/40 depending on status) replaces the hardcoded `regimeQuality: 60` in both `gradeCandidate` and the debate context.
- **What is missing**: admin UI editor for matrix rows; default-seed for the 7 documented regimes; an automatic source for `currentRegime` (today the cycle accepts `opts.currentRegime` from the caller — when omitted every candidate resolves to UNKNOWN_REGIME and the strict default blocks).
- **What is dead/orphaned**: none — old `playbookPermission` is still used internally by the wrapper for consistency.
- **What is unsafe**: only the seeding gap. With an empty matrix table the cycle now **blocks** by default (strict UNKNOWN_REGIME), which is the safe failure mode.
- **What is untested**: end-to-end seeded-matrix → simulated-cycle integration (covered manually only).
- **Mock data**: none.
- **What breaks if this runs live**: nothing — failure mode is conservative.
- **Exact patch remaining**: (a) seed default rows for the 7 regimes; (b) build an admin UI editor at `/admin/regime-matrix`; (c) wire a current-regime detector (e.g. from `lib/quant/regimeEngine.ts`) into the cron caller so `currentRegime` is supplied automatically.
- **Estimated effort**: small (UI + seed)
- **Priority**: P1

---

## 7. Information Edge Score

- **Claimed status**: B
- **Verified status**: PARTIAL (live-cycle fixed; UI/report still missing)
- **Files inspected**: [lib/admin/arca-brain/informationEdge.ts](lib/admin/arca-brain/informationEdge.ts), [lib/admin/arca-brain/deriveInformationEdge.ts](lib/admin/arca-brain/deriveInformationEdge.ts), [app/api/admin/info-edge/route.ts](app/api/admin/info-edge/route.ts), [lib/admin/portfolio-lab/simulateCycle.ts](lib/admin/portfolio-lab/simulateCycle.ts)
- **Tables inspected**: `arca_information_edge_scores` (append-only trigger active)
- **Routes inspected**: POST only, `requireAdmin` ✓
- **UI inspected**: none — score band is rendered in Commander panel 1 IF present; cycle now writes real values per candidate
- **Reports inspected**: opportunity board, scanner, decision engine — none consume
- **Tests inspected**: [test/admin/arcaBrainCore.test.ts](test/admin/arcaBrainCore.test.ts) — band thresholds + clamp; [test/admin/deriveInformationEdge.test.ts](test/admin/deriveInformationEdge.test.ts) — 4 deriver tests (null packet, clean packet, asymmetric, OBVIOUS_NOISE)

- **What is real**: `computeInformationEdge` (pure), `scoreInformationEdge` persists, band classification, `deriveInformationEdge` adapter, per-candidate compute in `simulateCycle` before Capital Allocation and Debate, OBVIOUS_NOISE override → No-Trade Alpha + journal with band/score/missingInputs, score persisted via `recordAllocationDecision`, band carried into debate context (prosecutor +25 on OBVIOUS_NOISE active)
- **What is missing**: opportunity board UI does not render score band; daily/evening packet reports do not include band distribution; per-packet ingestion-time scoring (currently only at cycle time)
- **What is dead/orphaned**: route still has no UI caller
- **What is unsafe**: nothing critical — derivation confidence is reported in journal/no-trade rows; missingInputs are surfaced honestly
- **What is untested**: persistence path (only pure compute + deriver are unit-tested)
- **Mock data**: none — derived from `AdminEdgePacket` fields; missing fields default to 50 AND are recorded
- **What breaks if this runs live**: nothing new; previously crowded setups slipped through, now they are caught by OBVIOUS_NOISE override or prosecutor penalty
- **Exact patch required to reach LIVE**: render `information_edge_score`/`information_edge_band` in opportunity board UI; include band distribution in daily/evening packets; add a packet-ingest-time writer so every packet has a score before the next cycle
- **Estimated effort**: low-medium (UI render + report aggregation; engine and writer are done)
- **Priority**: P1 (the gate function is now live; UI/report are operator-facing polish)

---

## 8. No-Trade Alpha

- **Claimed status**: B
- **Verified status**: PARTIAL
- **Files inspected**: [lib/admin/arca-brain/noTradeAlpha.ts](lib/admin/arca-brain/noTradeAlpha.ts), [app/api/admin/no-trade-alpha/route.ts](app/api/admin/no-trade-alpha/route.ts)
- **Tables inspected**: `arca_no_trade_alpha` (partial index on `outcome_class IS NULL`)
- **Routes inspected**: GET pending, POST evaluate / record, `requireAdmin` ✓
- **UI inspected**: none
- **Reports inspected**: none
- **Tests inspected**: none

- **What is real**: `recordNoTradeRejection`, `evaluateNoTradeOutcome`, `pendingNoTradeEvaluations`; called by `simulateCycle` when the debate returns SKIP
- **What is missing**: logging on pre-trade risk-block rejections; logging on `decisionEngine` gate rejections (only debate rejections are logged today); outcome evaluator cron; UI
- **What is dead/orphaned**: `evaluateNoTradeOutcome` is never called from any route or cron
- **What is unsafe**: every gate-rejected and risk-blocked candidate is silently dropped from the learning loop
- **What is untested**: insert + evaluate round trip
- **Mock data**: none
- **What breaks if this runs live**: only debate SKIPs accumulate evidence; doctrine / risk / decision-gate rejections do not, so half the rejection learning is lost
- **Exact patch required**: (a) in `simulateCycle`, add `recordNoTradeRejection(source='CAP_ALLOC' | 'DATA_QUALITY' | 'DOCTRINE' | ...)` to every existing `rejections++` path; (b) cron route that evaluates pending rows older than the planned hold window
- **Estimated effort**: small
- **Priority**: P1

---

## 9. System Self-Critique

- **Claimed status**: S
- **Verified status**: STUB
- **Files inspected**: [lib/admin/arca-brain/selfCritique.ts](lib/admin/arca-brain/selfCritique.ts), [app/api/admin/self-critique/route.ts](app/api/admin/self-critique/route.ts)
- **Tables inspected**: `arca_self_critiques` (append-only trigger active)
- **Routes inspected**: GET/POST, `requireAdmin` ✓
- **UI inspected**: none
- **Reports inspected**: none
- **Tests inspected**: none

- **What is real**: schema, two functions
- **What is missing**: report builder (no engine writes the JSON fields automatically); EOD scheduler; UI; tests
- **What is dead/orphaned**: entire module
- **What is unsafe**: nothing because nothing runs
- **What is untested**: everything
- **Mock data**: none
- **What breaks if this runs live**: silent — no critique is produced
- **Exact patch required**: an EVENING builder that scans the day's debates + mistakes + no-trade outcomes and constructs the structured fields
- **Estimated effort**: medium-high
- **Priority**: P2

---

## 10. Commander Mode

- **Claimed status**: B
- **Verified status**: PARTIAL
- **Files inspected**: [lib/admin/arca-brain/commanderMode.ts](lib/admin/arca-brain/commanderMode.ts), [app/api/admin/commander-mode/route.ts](app/api/admin/commander-mode/route.ts), [app/admin/command/page.tsx](app/admin/command/page.tsx)
- **Tables inspected**: aggregates from `arca_trade_debates`, `arca_positions`, `arca_risk_events`, `arca_simulated_orders`, `admin_edge_packets`, `arca_doctrine_rules`
- **Routes inspected**: GET only, `requireAdmin` ✓
- **UI inspected**: 10-panel `/admin/command` page, 60 s auto-refresh
- **Reports inspected**: the snapshot itself — `bestTradeNow`, `bestLongNow`, `bestShortNow`, `strongestNoTradeWarning`, `highestRiskOpenPosition`, `biggestChange`, `arcaIsWaitingFor`, `arcaWillNotTouch`, `freshness`, `doctrineWarningToday` + `evidenceQualityScore`, `personalExposureFlag`, `confidence`, `whatConfirms`, `whatInvalidates`, `mainRisk`
- **Tests inspected**: none

- **What is real**: 10 panels render real database aggregations; AI-output-standards block is computed and rendered
- **What is missing**: navigation entry (`/admin/command` not linked in admin sidebar — only `/admin/commander` is); per-panel evidence links (the panels render text but never link to the source debate / position / packet); behavioural-warning panel and portfolio-heat-warning panel from the spec; "next decision window" panel
- **What is dead/orphaned**: nothing — every panel binds to a query
- **What is unsafe**: `evidenceQualityScore` is computed as a heuristic of `confidence + info-edge − prosecutor*0.3` and clamped — but info-edge is always null today (see #7), so EQS over-counts confidence; `personalExposureFlag` is hardcoded `"ok"`; `biggestChange` is the most recent risk event regardless of magnitude; `whatConfirms`/`whatInvalidates`/`mainRisk` for non-best-trade panels fall back to the first risk block
- **What is untested**: snapshot shape and band thresholds
- **Mock data**: `personalExposureFlag: "ok"` is a constant, not derived
- **What breaks if this runs live**: the operator may read evidence values that are partially synthetic
- **Exact patch required**: (a) add nav link; (b) derive `personalExposureFlag` from open-position cluster; (c) add evidence anchor links (`debateId` → `/admin/debates/:id`, position → `/admin/portfolio-lab/positions/:id`); (d) add behavioural-warning panel (sourced from `operatorBiasCheck`)
- **Estimated effort**: medium
- **Priority**: P1

---

## Cross-cutting findings

### `simulateCycle.ts` (the actual brain entry point)

| Check | Result |
|---|---|
| Calls Adversarial Debate | ✅ line 171 `runDebateAndRecord` |
| Calls Capital Allocation | ❌ before patch → ✅ after patch |
| Calls No-Trade Alpha on rejection | ⚠ only debate SKIPs; not for risk-blocks or gate-rejects |
| Writes journal entries | ✅ `writeJournal` on REJECTED, RISK_BLOCK, DEBATE SKIP |
| Respects `do_nothing` | ✅ enforced upstream in `decisionEngine.gateRow` |
| Rejects stale/missing data | ✅ upstream in `gateRow`; but cycle then **lies to debate context as `freshness:'fresh'`** |
| Respects risk caps | ✅ `checkPreTrade` + `emitRiskEventIfBreached` |
| Calls Information Edge | ✅ `deriveInformationEdge` + `computeInformationEdge` per candidate (P0-B) |
| Calls Regime-Playbook Matrix | ✅ `simulateCycle.ts` → `getRegimeMatrix` + `evaluateRegimePlaybook` per candidate |
| Labels closed trades | ❌ no caller to `classifyMistake` |
| `notifyAdmin` on failure | ❌ no calls anywhere in the brain |

### Opportunity Queue / Board

- Does it consume Information Edge Score? **No.** `app/admin/opportunity-board/**` has zero references.
- Does it respect Regime-Playbook Matrix? **Yes — per-candidate `evaluateRegimePlaybook` gate runs before Info Edge; DISABLED / WAIT_FOR_CONFIRMATION / strict UNKNOWN_REGIME → no-trade row + REJECTED journal; REDUCE_SIZE → `regimeMult` folded into combined sizing.**
- Does it show debate result? **No.**
- Does it show no-trade reasons? **No.**
- Does it show data trust? Pre-existing UI shows freshness, but does not bind to `arca_trade_debates.data_freshness_status`.

### Commander Mode reality check

- Is it a real cockpit or a dashboard? **Real cockpit-shaped, but several panel inputs are stubbed.**
- Best trade / best short / best no-trade / highest-risk position / biggest change / data trust / doctrine warning: **all present** but with caveats above.
- Behavioural-warning, portfolio-heat-warning, next-decision-window panels: **MISSING.**
- Per-panel evidence links: **MISSING.**

### Reports

| Report | No-trade alpha | Regret map | Mistake labels | Doctrine changes | Calibration | Self-critique | Data trust | Scenario stress | Capital alloc | Debate summary |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Daily Operator Packet (`app/api/admin/daily-packet`) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | partial | ❌ | ❌ | ❌ |
| Evening Reconciliation (`app/api/admin/evening-packet`) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | partial | ❌ | ❌ | ❌ |
| Morning Brief (`app/api/admin/morning-brief`) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | partial | ❌ | ❌ | ❌ |

None of the three reports queries any meta-brain table.

### Tests

- Only [test/admin/arcaBrainCore.test.ts](test/admin/arcaBrainCore.test.ts) exists — 5 assertions across 2 modules.
- Tests check **band thresholds** (Information Edge) and **two classifier branches** (Mistake Taxonomy hard violations).
- Tests **do not** assert the debate decision matrix, capital allocation grade boundaries, no-trade alpha round-trip, regret classification, regime permission resolver, doctrine review approval, self-critique persistence, or Commander snapshot shape.
- Tests are **shallow**: they confirm the function exists and returns the right shape, but do not assert failure modes are prevented in integration.

### Orphan pages

- `/admin/command` → not linked from `app/admin/layout.tsx` nav
- `/admin/doctrine` → not linked from `app/admin/layout.tsx` nav

Both are reachable by URL only.

### Dead / orphan engines

- `gradeCandidate`, `recordAllocationDecision` (Capital Allocation) — dead before patch
- `playbookPermission` (Regime Matrix) — dead
- `evaluateNoTradeOutcome` (No-Trade Alpha) — dead (only `record` is called)
- `recordSelfCritique` (Self-Critique) — dead
- `recordRegret`, `listRegretEntries` (Regret Map) — dead

### Mock / demo data

- `simulateCycle.ts` debate context: `freshness: 'fresh'` (literal), `regimeQuality: 60`, `correlationExposure: 0`, `eventRisk: 'none'`, `repeatedLossSamePlaybook: false`, `doctrineConflictRuleId: null`, `informationEdgeScore/Band: null` — all stubs
- `commanderMode.ts`: `personalExposureFlag: 'ok'` — literal
- `commanderMode.ts`: `evidenceQualityScore` derived from heuristic that includes a null info-edge term

### Stale-data handling

- Upstream `decisionEngine.gateRow` rejects `freshness === 'stale' | 'unknown'` ✓
- Downstream `simulateCycle` then **overrides** to `freshness: 'fresh'` in the debate input — bug fixed in patch
- `capitalAllocation.gradeCandidate` returns NO_TRADE on `dataFreshness === 'stale'` — only useful once the real freshness is passed (patched)

### `notifyAdmin`

- Zero calls in `lib/admin/arca-brain/*`
- Zero calls in `simulateCycle.ts`
- Silent failures via `.catch(() => undefined)` in the debate path

---

## Final classification

| # | Module | Final status |
|---|---|---|
| 1 | Doctrine Engine | PARTIAL |
| 2 | Mistake Taxonomy | PARTIAL (frequency-read only; no writer) |
| 3 | Regret Map | STUB |
| 4 | Adversarial ARCA | LIVE (patched freshness + capital-allocation context) |
| 5 | Capital Allocation | PARTIAL (now wired, no UI, no test) |
| 6 | Regime-Playbook Matrix | PARTIAL (live; UI + seed pending) |
| 7 | Information Edge | PARTIAL (engine alive, not yet computed per packet in cycle) |
| 8 | No-Trade Alpha | PARTIAL (logs debate SKIPs + cap-alloc NO_TRADE; not other rejections) |
| 9 | Self-Critique | STUB |
| 10 | Commander Mode | PARTIAL |

No module is **MISSING**. No module is fully **LIVE** without caveats except Adversarial ARCA after this patch.
