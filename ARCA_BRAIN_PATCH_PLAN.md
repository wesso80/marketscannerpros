# ARCA Meta-Brain — Patch Plan

Ordered by highest-impact integration breakage. Item 1 is executed in this pass; items 2-10 are sized and ready to lift.

---

## P0-A — `simulateCycle.ts` freshness lie + Capital Allocation enforcement  *(EXECUTED)*

**What was broken**
- `simulateCycle.ts` passed `freshness: "fresh"` as a literal into every debate context regardless of edge-packet age. Prosecutor freshness floor permanently 0.
- `gradeCandidate` (Capital Allocation) was never called. Every candidate sized identically; NO_TRADE never honoured; no row in `arca_capital_allocation_decisions`.
- Pre-trade risk blocks and decisionEngine gate rejections did not log to `arca_no_trade_alpha` — only debate SKIPs did.

**Patch executed in this pass**
1. Compute real freshness from the youngest edge-packet `generated_at` ⇒ `"fresh" | "delayed" | "stale" | "unknown"`.
2. Before debate, call `gradeCandidate(...)`:
   - If `grade === "NO_TRADE"` ⇒ write `arca_no_trade_alpha` with `rejection_source = 'CAP_ALLOC'`, journal `REJECTED`, continue.
3. Pass real freshness + grade-derived `eventRisk`/`drawdownState` into debate context.
4. After debate (when order is created), call `recordAllocationDecision(..., debateId)` so every order has a capital-allocation snapshot row.
5. Replace constant `informationEdgeScore: null` with a placeholder computation only when packet fields exist (full info-edge wiring deferred to P0-B).

**Acceptance**: typecheck clean, existing tests still pass.

---

## P0-B — Information Edge computed per candidate

**What is broken**: prosecutor's `OBVIOUS_NOISE → +25` rule is never triggered because info-edge is always null.

**Patch**:
- In `simulateCycle.ts`, before `runDebateAndRecord`, build `InformationEdgeInputs` from `cand.row.packetJson` (fields: `uniqueness`, `earliness`, `crowdingRisk`, `obviousness`, `hiddenPressure`, `rewardRemaining`, `signalRarity`, `crossAssetConfirmation`, `personalHistoricalEdge`). Where a field is absent, default to 50.
- Call `computeInformationEdge(inputs)`.
- Call `scoreInformationEdge` to persist.
- Pass `{score, band}` into debate context.

**Effort**: small (if packet exposes the 9 inputs) → medium (if packet schema needs extension).

---

## P0-C — Regime-Playbook Matrix gate

**What is broken**: a momentum playbook can fire in `MEAN_REVERTING`.

**Patch**:
1. Seed 7 default rows in migration 097 (one per regime).
2. Read current regime from `regimeClassifier` (already exists in repo as `lib/admin/regime/*` — verify) into `simulateCycle`.
3. Before `gradeCandidate`, call `playbookPermission(matrix, cand.row.setupType)`:
   - `'block'` ⇒ journal + No-Trade Alpha source `REGIME_MATRIX`, continue.
   - `'reduce'` ⇒ halve `maxRiskPercent` before `gradeCandidate`.
4. Stub UI `/admin/regime-matrix/page.tsx` to edit rows.

**Effort**: medium.

---

## P1-A — Mistake Labeler on trade close

**What is broken**: zero rows in `arca_trade_mistake_labels`; `recentMistakeFrequency` always returns 0.

**Patch**:
- In `lib/admin/portfolio-lab/positionEngine.ts → markAndMaybeExit`, when `res.exit` is set, build `ClosedTradeForLabeling`:
  - Load the source debate via `arca_simulated_orders.debate_id` for `dataStaleAtEntry`.
  - `lateEntry` from order trigger timestamp vs first fill timestamp.
  - `positionTooLarge` from notional vs grade's `max_loss_dollars`.
- Call `classifyMistake` + `recordMistakeLabel`.

**Effort**: medium (requires reading back the entry packet metadata).

---

## P1-B — No-Trade Alpha on all rejection paths

**What is broken**: only debate SKIPs are logged; risk-blocks, gate-rejects, regime-blocks are silent.

**Patch**:
- In `simulateCycle.ts`, add `recordNoTradeRejection({source: ...})` to:
  - `pre.ok === false` branch (`source='DATA_QUALITY'` or `'CAP_ALLOC'` based on reason content)
  - decisionEngine `gateRow` rejections (`source='DATA_QUALITY'` for freshness, `'DOCTRINE'` for do_nothing, generic for others)
- Add `/api/admin/no-trade-alpha/evaluate` cron route that runs `pendingNoTradeEvaluations` → `evaluateNoTradeOutcome`.

**Effort**: small.

---

## P1-C — Opportunity Board info-edge + debate column

**What is broken**: operator picks candidates without seeing edge band or debate verdict.

**Patch**:
- `app/admin/opportunity-board/page.tsx` add columns: Info Edge band, latest debate decision, rejection reason if SKIP.
- Underlying API: join `arca_information_edge_scores` and `arca_trade_debates` by symbol + recent window.

**Effort**: medium.

---

## P1-D — Commander Mode evidence anchors + missing panels

**What is broken**: panels are flat strings; no link to source row; behavioural / portfolio-heat / next-window panels missing.

**Patch**:
- Add `debateId`, `positionId`, `packetId` deep links in panels 1, 2, 3, 5, 6.
- Add panel 11 Behavioural-warning (consume `lib/admin/operatorBiasCheck.ts`).
- Add panel 12 Portfolio-heat (consume `arca_positions` aggregate vs portfolio max risk).
- Add panel 13 Next-decision-window (consume earnings/macro calendar).
- Derive `personalExposureFlag` from cluster size of open positions in correlated sectors.

**Effort**: medium.

---

## P2-A — Doctrine review writer

**What is broken**: rules created but never auto-reviewed.

**Patch**:
- On every new row in `arca_trade_mistake_labels` where `rule_violated_id IS NOT NULL`, append a `POST_TRADE` review proposing `DOWNGRADE` if pattern crosses 3+ in 7 days.
- On every closed trade with `mistake_type='NO_MISTAKE_SYSTEM_VALID'` and winning R, increment supporting_trade_ids on the rule.

**Effort**: medium.

---

## P2-B — Reports include brain output

**What is broken**: daily/evening/morning reports cite zero brain data.

**Patch** (per report):
- Daily Operator Packet → top 5 debates, top 5 no-trade rejections, today's mistake labels, today's doctrine warning.
- Evening Reconciliation → mistake-label histogram, no-trade alpha outcomes evaluated today, regret-map deltas.
- Weekly Review → doctrine changes, calibration update, self-critique summary, capital-allocation grade distribution.

**Effort**: medium per report.

---

## P2-C — Self-Critique EVENING builder

**Patch**: scheduled route `app/api/admin/self-critique/evening/route.ts` that reads the day's debates, mistakes, and no-trade outcomes; builds the structured JSON fields; persists via `recordSelfCritique`.

**Effort**: medium-high.

---

## P3 — Regret Map nightly comparator

**Patch**: cron joining `arca_simulated_orders`, `arca_trades`, `journal_entries` per symbol per day; emits one `arca_regret_map_entries` row with the appropriate classification.

**Effort**: medium-high.

---

## Tests to add (by module)

| Module | Test file (to create) | Assertions |
|---|---|---|
| Doctrine | `test/admin/arcaBrain/doctrineEngine.test.ts` | propose → approve flips rule status + stamps `approved_at`; approval blocked on missing review |
| Mistake | `test/admin/arcaBrain/mistakeLabeler.test.ts` | every branch returns the expected `mistakeType` (21 cases) |
| Debate | `test/admin/arcaBrain/adversarialDebate.test.ts` | TAKE on clean inputs; SKIP on `risk.blocks.length > 0`; SKIP on `prosecutor >= 70`; SIZE_DOWN multiplier on 50-69 |
| Capital | `test/admin/arcaBrain/capitalAllocation.test.ts` | `stale → NO_TRADE`; `halted → NO_TRADE`; composite ≥ 80 + edge ≥ 60 + regime ≥ 55 → A_GRADE; composite < 35 → NO_TRADE |
| Regime | `test/admin/arcaBrain/regimePlaybookMatrix.test.ts` | `playbookPermission` returns block / reduce / allow correctly |
| No-Trade | `test/admin/arcaBrain/noTradeAlpha.test.ts` | record then evaluate sets `outcome_class`; pending excludes evaluated |
| Regret | `test/admin/arcaBrain/regretMap.test.ts` | classification round-trip |
| Self-Critique | `test/admin/arcaBrain/selfCritique.test.ts` | record + list by kind; append-only enforcement |
| Commander | `test/admin/arcaBrain/commanderMode.test.ts` | snapshot shape; freshness banding from packet age |
| Cycle integration | `test/admin/arcaBrain/simulateCycleIntegration.test.ts` | stale packet → never reaches debate; NO_TRADE grade → No-Trade Alpha row written; SKIP debate → debate_id on no-trade row, no order created |

---

## Definition-of-done per module

A module is **LIVE** only when:
1. table present in migration ✓
2. type in `lib/admin/arca-brain/types.ts` ✓
3. engine functions ✓
4. API route admin-protected ✓
5. UI surface reachable from `app/admin/layout.tsx` nav
6. report output ties into at least one of daily/evening/weekly
7. test file with branch coverage ≥ the 21 mistake taxonomy benchmark
8. cycle-integration test asserting the failure mode is prevented

Today only Adversarial ARCA meets all 8 (after the patch in this pass, with the test still missing on item 7-8).
