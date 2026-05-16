# ARCA Meta-Brain — Implementation Architecture

Status of every module: built, wired, or stub. No abstract strategy below — every row resolves to a file, a table, a function, a route, a UI, a report field, a test, and a failure mode it prevents.

Hard constraints (enforced):
- Admin-only. No public exposure.
- SIMULATED only. `arca_trade_debates.mode` CHECK + no broker calls anywhere in `lib/admin/arca-brain/*`.
- Every row carries `workspace_id UUID`. Every query filters by it.
- Append-only enforced at DB-trigger level on: `arca_doctrine_reviews`, `arca_self_critiques`, `arca_information_edge_scores`.
- Every admin output carries: Opportunity Score, Evidence Quality Score, Personal Exposure, Confidence, What confirms, What invalidates, Main risk.

Legend:
- **B** = built and wired
- **W** = built, awaiting downstream wiring
- **S** = stub (table + engine + route exist; UI deferred)

---

## 1. Doctrine Engine  — **B**

| Connection | Concrete |
|---|---|
| 1. Repo files | [lib/admin/arca-brain/doctrineEngine.ts](lib/admin/arca-brain/doctrineEngine.ts), [lib/admin/arca-brain/types.ts](lib/admin/arca-brain/types.ts), [lib/admin/arca-brain/rowMappers.ts](lib/admin/arca-brain/rowMappers.ts) |
| 2. Database table | `arca_doctrine_rules`, `arca_doctrine_reviews` (migration [migrations/096_arca_meta_brain.sql](migrations/096_arca_meta_brain.sql#L29-L106)) |
| 3. Engine fns | `createDoctrineRule`, `listDoctrineRules`, `getDoctrineRule`, `proposeDoctrineReview`, `approveDoctrineReview`, `listDoctrineReviews`, `todaysDoctrineWarning` |
| 4. API route | [app/api/admin/doctrine/route.ts](app/api/admin/doctrine/route.ts), [app/api/admin/doctrine/reviews/route.ts](app/api/admin/doctrine/reviews/route.ts) |
| 5. Admin UI | [app/admin/doctrine/page.tsx](app/admin/doctrine/page.tsx) — list rules, propose review, approve review |
| 6. Report output | `CommanderModeSnapshot.doctrineWarningToday` rendered as panel 10 in [app/admin/command/page.tsx](app/admin/command/page.tsx); fed by `todaysDoctrineWarning(workspaceId)` |
| 7. Test | (needed) `test/admin/arcaBrain/doctrineEngine.test.ts` — assert review approval flips rule status + records timestamp |
| 8. Failure mode prevented | **Silent doctrine drift.** Rules cannot mutate without an audited review row. Append-only trigger on `arca_doctrine_reviews` makes the audit log non-erasable. |

---

## 2. Mistake Taxonomy  — **B**

| Connection | Concrete |
|---|---|
| 1. Repo files | [lib/admin/arca-brain/mistakeLabeler.ts](lib/admin/arca-brain/mistakeLabeler.ts) |
| 2. Database table | `arca_trade_mistake_labels` (21-value `mistake_type` CHECK, references `arca_trades(id)` + `arca_doctrine_rules(id)`) |
| 3. Engine fns | `classifyMistake(t: ClosedTradeForLabeling)` (pure deterministic), `recordMistakeLabel`, `listMistakeLabels`, `recentMistakeFrequency(workspaceId, days)` |
| 4. API route | [app/api/admin/mistakes/route.ts](app/api/admin/mistakes/route.ts) — GET by type/sinceDays, POST label-a-trade |
| 5. Admin UI | (stub needed) `app/admin/mistakes/page.tsx` — list labels by type with frequency rollup |
| 6. Report output | `recentMistakeFrequency` feeds `DebateContext.recentMistakeFrequency` in [lib/admin/portfolio-lab/simulateCycle.ts](lib/admin/portfolio-lab/simulateCycle.ts) → triggers `elevated_recent_mistake_rate` risk block when ≥ 5 in 7 days |
| 7. Test | [test/admin/arcaBrainCore.test.ts](test/admin/arcaBrainCore.test.ts) — `classifyMistake` returns BROKE_RULE/critical and POSITION_TOO_LARGE/high ✓ |
| 8. Failure mode prevented | **Conflating bad luck with bad process.** `NO_MISTAKE_SYSTEM_VALID` is a first-class label, so losing trades that followed the system cannot be misclassified as errors and trigger spurious doctrine reviews. |

---

## 3. Adversarial Debate  — **B**

| Connection | Concrete |
|---|---|
| 1. Repo files | [lib/admin/arca-brain/adversarialDebate.ts](lib/admin/arca-brain/adversarialDebate.ts) |
| 2. Database table | `arca_trade_debates` (trader/risk/prosecutor JSON + score + final_decision CHECK in `TAKE/SKIP/SIZE_DOWN/WAIT_FOR_CONFIRMATION`); `arca_simulated_orders.debate_id UUID` (ALTER in migration 096) |
| 3. Engine fns | `runDebateAndRecord(candidate, ctx) → {record, shouldCreateOrder, sizeMultiplier}`, internal `buildTraderCase`, `buildRiskCase`, `buildProsecutorCase`, `decide`, plus `linkDebateToOrder`, `listRecentDebates` |
| 4. API route | [app/api/admin/debates/route.ts](app/api/admin/debates/route.ts) — GET recent |
| 5. Admin UI | Surfaces in Commander panels 1-4 and 8 (`bestTradeNow`, `bestLongNow`, `bestShortNow`, `strongestNoTradeWarning`, `arcaWillNotTouch`) in [app/admin/command/page.tsx](app/admin/command/page.tsx) |
| 6. Report output | Every order created from [lib/admin/portfolio-lab/simulateCycle.ts](lib/admin/portfolio-lab/simulateCycle.ts) is stamped with `debate_id`; SKIP debates feed Commander panel 4 + No-Trade Alpha |
| 7. Test | (needed) `test/admin/arcaBrain/adversarialDebate.test.ts` — happy-path TAKE with no risk blocks + low prosecutor; SKIP when prosecutor ≥ 70 |
| 8. Failure mode prevented | **"Silent execution."** No simulated order can be created in `simulateCycle` without `runDebateAndRecord` returning `shouldCreateOrder=true`. The debate row is the only audit trail of *why* the system entered. |

---

## 4. Capital Allocation Engine  — **W**

| Connection | Concrete |
|---|---|
| 1. Repo files | [lib/admin/arca-brain/capitalAllocation.ts](lib/admin/arca-brain/capitalAllocation.ts) |
| 2. Database table | `arca_capital_allocation_decisions` (snapshots all inputs: expectancy, regime quality, freshness, confidence, info edge, fit, drawdown, correlation, event risk, mistake frequency) |
| 3. Engine fns | `gradeCandidate(i): A_GRADE | B_GRADE | C_GRADE | EXPERIMENTAL | NO_TRADE`, `recordAllocationDecision` |
| 4. API route | (needed) `app/api/admin/capital-allocation/route.ts` — POST grade + record; currently engine-only |
| 5. Admin UI | (stub needed) `app/admin/capital-allocation/page.tsx` — grade ledger |
| 6. Report output | Grade feeds size at next wiring step; intended to scale `sizing.notional` in [simulateCycle.ts](lib/admin/portfolio-lab/simulateCycle.ts) before the debate gate (currently `positionSizing.ts` is the only sizer; allocation engine will gate it) |
| 7. Test | (needed) `test/admin/arcaBrain/capitalAllocation.test.ts` — bottom inputs → NO_TRADE; top inputs → A_GRADE |
| 8. Failure mode prevented | **Uniform sizing across asymmetric setups.** A C_GRADE never gets the risk budget of an A_GRADE. Snapshotted inputs make every grade re-derivable for later calibration. |

---

## 5. Regime-Playbook Matrix  — **W**

| Connection | Concrete |
|---|---|
| 1. Repo files | [lib/admin/arca-brain/regimePlaybookMatrix.ts](lib/admin/arca-brain/regimePlaybookMatrix.ts) |
| 2. Database table | `arca_regime_playbook_matrix` (unique on `workspace_id + regime`; arrays for enabled/reduced/disabled playbooks) |
| 3. Engine fns | `upsertRegimeMatrix`, `listRegimeMatrix`, `getRegimeMatrix`, `playbookPermission(matrix, playbookId) → 'allow' | 'reduce' | 'block'` |
| 4. API route | [app/api/admin/regime-matrix/route.ts](app/api/admin/regime-matrix/route.ts) — GET, POST upsert |
| 5. Admin UI | (stub needed) `app/admin/regime-matrix/page.tsx` — matrix editor by regime |
| 6. Report output | Intended next wiring: gate decisionEngine candidates by `playbookPermission` before they reach the debate; `reduce` halves the allocation grade's base size |
| 7. Test | (needed) `test/admin/arcaBrain/regimePlaybookMatrix.test.ts` — playbook in `disabled` returns `block` |
| 8. Failure mode prevented | **Right setup, wrong regime.** A mean-reversion playbook cannot fire in `VOL_EXPANSION`; a momentum playbook cannot fire in `MEAN_REVERTING`. |

---

## 6. Information Edge Score  — **B**

| Connection | Concrete |
|---|---|
| 1. Repo files | [lib/admin/arca-brain/informationEdge.ts](lib/admin/arca-brain/informationEdge.ts) |
| 2. Database table | `arca_information_edge_scores` (9 input columns 0..100 + score + band + reasoning + `weights_version`); **append-only trigger** `trg_arca_information_edge_block_ud` |
| 3. Engine fns | `computeInformationEdge(inputs) → {score, band}` (pure, `WEIGHTS_V1` constant), `scoreInformationEdge` (persist), `latestInfoEdgeForPacket` |
| 4. API route | [app/api/admin/info-edge/route.ts](app/api/admin/info-edge/route.ts) — POST score-and-persist |
| 5. Admin UI | Score band shown in Commander panel 1 (`bestTradeNow.informationEdgeBand`); intended dedicated page for distribution histograms |
| 6. Report output | `informationEdgeBand` consumed by `buildProsecutorCase` in adversarialDebate: `OBVIOUS_NOISE` adds +25 to prosecutor score, `RARE_ASYMMETRIC` subtracts 15 |
| 7. Test | [test/admin/arcaBrainCore.test.ts](test/admin/arcaBrainCore.test.ts) — all-low → OBVIOUS_NOISE; all-high → STRONG/RARE_ASYMMETRIC; clamp 0..100 ✓ |
| 8. Failure mode prevented | **Confusing confidence with edge.** A high-confidence read on a crowded, obvious setup will score `OBVIOUS_NOISE` and lose to the prosecutor, even if the trader case is loud. |

---

## 7. Regret Map  — **S**

| Connection | Concrete |
|---|---|
| 1. Repo files | [lib/admin/arca-brain/regretMap.ts](lib/admin/arca-brain/regretMap.ts) |
| 2. Database table | `arca_regret_map_entries` (9-value `classification` CHECK covering all ARCA-vs-Brad-vs-benchmark outcomes; `missed_r`, `avoided_r_loss`, `regret_cost_dollars`) |
| 3. Engine fns | `recordRegret`, `listRegretEntries` |
| 4. API route | [app/api/admin/regret-map/route.ts](app/api/admin/regret-map/route.ts) — GET by classification, POST |
| 5. Admin UI | (stub needed) `app/admin/regret-map/page.tsx` — ledger grouped by classification |
| 6. Report output | Intended Self-Critique input: `BRAD_DISCRETION_BEAT_ARCA` rows aggregate into `behavioural_warning`; `ARCA_REJECTED_CORRECTLY` rows feed into `arca_no_trade_alpha.outcome_class = CORRECT_REJECTION` |
| 7. Test | (needed) `test/admin/arcaBrain/regretMap.test.ts` — classification round-trip + missed_r aggregation |
| 8. Failure mode prevented | **Survivorship bias.** Without a regret ledger, the system only learns from trades it took. Regret rows force learning from trades it rejected and trades the operator overrode. |

---

## 8. No-Trade Alpha  — **B**

| Connection | Concrete |
|---|---|
| 1. Repo files | [lib/admin/arca-brain/noTradeAlpha.ts](lib/admin/arca-brain/noTradeAlpha.ts) |
| 2. Database table | `arca_no_trade_alpha` (rejection_source CHECK + nullable `outcome_class` for later evaluation; partial index `arca_no_trade_pending_idx` on `outcome_class IS NULL`) |
| 3. Engine fns | `recordNoTradeRejection`, `evaluateNoTradeOutcome`, `pendingNoTradeEvaluations` |
| 4. API route | [app/api/admin/no-trade-alpha/route.ts](app/api/admin/no-trade-alpha/route.ts) — GET pending, POST `{action:'evaluate'}` OR record |
| 5. Admin UI | (stub needed) `app/admin/no-trade-alpha/page.tsx` — pending vs evaluated; running PnL of inaction |
| 6. Report output | Every SKIP from the debate gate in [simulateCycle.ts](lib/admin/portfolio-lab/simulateCycle.ts) writes a row via `recordNoTradeRejection(..., debateId)`. Outcome later fills `realised_r_if_taken`. |
| 7. Test | (needed) `test/admin/arcaBrain/noTradeAlpha.test.ts` — record then evaluate populates `outcome_class` |
| 8. Failure mode prevented | **Treating "no trade" as no information.** Every rejection becomes a learnable event. A pattern of MISSED_WIN rejections triggers doctrine review on the rule that blocked them. |

---

## 9. System Self-Critique  — **S**

| Connection | Concrete |
|---|---|
| 1. Repo files | [lib/admin/arca-brain/selfCritique.ts](lib/admin/arca-brain/selfCritique.ts) |
| 2. Database table | `arca_self_critiques` (kind CHECK in DAILY/EVENING/WEEKLY/POST_MORTEM/MANUAL + structured JSON fields for overconfident-bad-call, best-rejected, worst-accepted, rule-to-promote/downgrade ids); **append-only trigger** |
| 3. Engine fns | `recordSelfCritique`, `listSelfCritiques` |
| 4. API route | [app/api/admin/self-critique/route.ts](app/api/admin/self-critique/route.ts) — GET by kind, POST |
| 5. Admin UI | (stub needed) `app/admin/self-critique/page.tsx` — most recent reports per kind |
| 6. Report output | The EVENING kind is the canonical end-of-day brief. `rule_to_promote_id`/`rule_to_downgrade_id` feed proposed `arca_doctrine_reviews` rows the next morning. |
| 7. Test | (needed) `test/admin/arcaBrain/selfCritique.test.ts` — record + list by kind |
| 8. Failure mode prevented | **Improvement amnesia.** Without a written self-critique, the system repeats the same errors silently across days. Append-only trigger blocks post-hoc rewriting of yesterday's assessment. |

---

## 10. Commander Mode  — **B**

| Connection | Concrete |
|---|---|
| 1. Repo files | [lib/admin/arca-brain/commanderMode.ts](lib/admin/arca-brain/commanderMode.ts) |
| 2. Database table | None of its own — aggregates from `arca_trade_debates`, `arca_positions`, `arca_risk_events`, `arca_simulated_orders`, `admin_edge_packets`, `arca_doctrine_rules` |
| 3. Engine fns | `buildCommanderSnapshot({workspaceId}) → CommanderModeSnapshot` (10 panels + AI-output-standards block) |
| 4. API route | [app/api/admin/commander-mode/route.ts](app/api/admin/commander-mode/route.ts) — GET snapshot |
| 5. Admin UI | [app/admin/command/page.tsx](app/admin/command/page.tsx) — 10-panel decision screen, 60 s refresh, no charts |
| 6. Report output | The snapshot itself: `bestTradeNow`, `bestLongNow`, `bestShortNow`, `strongestNoTradeWarning`, `highestRiskOpenPosition`, `biggestChange`, `arcaIsWaitingFor`, `arcaWillNotTouch`, `freshness`, `doctrineWarningToday` + `evidenceQualityScore`, `personalExposureFlag`, `confidence`, `whatConfirms`, `whatInvalidates`, `mainRisk` |
| 7. Test | (needed) `test/admin/arcaBrain/commanderMode.test.ts` — snapshot shape and freshness banding |
| 8. Failure mode prevented | **Decision paralysis from data overload.** Commander Mode is the only screen the operator looks at to decide what to do *right now*. Anything not in those 10 panels is by definition not actionable in this moment. |

---

## Cycle insertion point (the brain's actual entry)

[lib/admin/portfolio-lab/simulateCycle.ts](lib/admin/portfolio-lab/simulateCycle.ts) — step 4 of the cycle:

```
for each candidate from decisionEngine:
  pre-trade risk check  ← already existed
  ───────────────────────────────────────────
  recentMistakeFrequency(workspaceId, 7)              ← #2 Mistake Taxonomy
  runDebateAndRecord(candidate, ctx)                  ← #3 Adversarial Debate
    if shouldCreateOrder = false:
      recordNoTradeRejection(...debateId)             ← #8 No-Trade Alpha
      writeJournal('REJECTED'); continue
  scale quantity, notional by sizeMultiplier          ← #3 SIZE_DOWN
  createSimulatedOrder(...)
  UPDATE arca_simulated_orders SET debate_id = ...    ← audit binding
  linkDebateToOrder(workspaceId, debateId, orderId)
```

This is the only gate. Every simulated order in production goes through it.

---

## Failure-mode coverage matrix

| Failure mode | Module that prevents it | Where it would otherwise leak |
|---|---|---|
| Silent doctrine drift | Doctrine Engine + append-only reviews | Anywhere a rule mutates without audit |
| Bad-luck mislabelled as error | Mistake Taxonomy (`NO_MISTAKE_SYSTEM_VALID`) | Post-mortems, doctrine reviews |
| Order without a recorded reason | Adversarial Debate + `debate_id` on order | `simulateCycle` step 4 |
| Uniform sizing across grades | Capital Allocation Engine | `positionSizing.ts` alone |
| Right setup, wrong regime | Regime-Playbook Matrix | `decisionEngine` candidate flow |
| High confidence on crowded setup | Information Edge Score (prosecutor weighting) | Trader case dominating debate |
| Survivorship bias | Regret Map | Self-critique inputs |
| "No trade" treated as no signal | No-Trade Alpha | Every SKIP debate |
| Improvement amnesia | Self-Critique (append-only) | Daily routine |
| Decision paralysis | Commander Mode | All other admin screens combined |

---

## Open implementation items (tracked)

1. Stub admin pages: regime-matrix, regret-map, no-trade-alpha, self-critique, mistakes, capital-allocation.
2. Module-specific tests under `test/admin/arcaBrain/` (one per module beyond the 2 already covered).
3. Wire `playbookPermission(...)` into `decisionEngine` so the regime matrix gates candidate selection upstream of the debate.
4. Wire `gradeCandidate(...)` into `simulateCycle` so capital grade scales `sizing` before the debate's `sizeMultiplier` further adjusts it.
5. EOD cron: build EVENING `arca_self_critiques` and emit proposed `arca_doctrine_reviews` rows for operator approval.
6. EOD cron: `evaluateNoTradeOutcome` over `pendingNoTradeEvaluations` after window-close.

Every item above terminates at a file already in this repo. No new abstraction layer is required.
