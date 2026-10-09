# Combined admin stack review

9 October 2026. No merges, deployments, production queries or production mutations performed during this review.

## Reviewed state

Fetched main `2f3cf8dc` and admin-integration `8e2d402e`. Reviewed stack head `dc80a551` (#614). `git merge-tree --write-tree origin/admin-integration HEAD` produced conflict-free combined tree `f5ca270d41a83abe69874205cae033e3395abe80`. That exact tree was exported into an isolated checkout for testing, using locked existing dependencies. No integration branch or commit was created by the merge check.

| PR | Observed GitHub status | Release meaning |
|---|---|---|
| #604 | Merged into admin-integration (`56e8250f`) | Outcome writer ownership and migration 133 prerequisite |
| #606 | Merged (`2f8a0897`) | Edge Check/Diagnostics cohorts |
| #609 | Merged (`af0015cb`) | Scoped 24h outcome panels |
| #611 | Open; base still codex/admin-outcome-cohort-panels | Horizon denominators and audit |
| #612 | Open; stacked on #611 | Journal expectancy correction |
| #614 | Open; stacked on #612 | Read-only expectancy comparison |

These merges were performed by another builder before/during this review. #604's head is also an ancestor of current main. Git history does NOT confirm deployed code, runtime flags or production schema state.

Review/retarget #611 against current admin-integration, then #612, then #614 as predecessors land. Do not merge the entire old branch chain again merely because an old base remains named on the PR. The combined tree is clean, but GitHub base updates and current-head rechecks are still release steps.

## Findings and release gates

### P1 — Default discovery-only policy pauses these analytics

`lib/admin/discoveryOnly.ts` defaults ADMIN_DISCOVERY_ONLY to true. The middleware invokes its policy before these pages/routes are served. A review probe on the exact combined tree confirmed pause_page for Edge Check, Signal Outcomes, Scorecard, Backtest Lab, Morning Brief and expectancy comparison, and pause_api for Edge Check, cohort, comparison and Diagnostics reads. Existing direct handler tests do not exercise that middleware policy.

This is an existing intentional pause, not a regression to remove automatically. Shipping code alone will not make these surfaces reachable under the default configuration. Acceptance: owner decides whether to preserve the pause or introduce narrowly scoped read-only access; test middleware and actual authenticated navigation at the intended setting. Do not globally unpause jobs just to expose analytics. No runtime flag was read or changed here.

### P1 — Production schema and mixed-writer rollout are unverified

`migrations/133_ai_outcome_ownership.sql` explicitly requires migration 103 fields. The dependency is existing ai_signal_log (048), then 103, then 133. Migration 105 (`105_ai_signal_outcome_6w_12w.sql`, distinguish similarly numbered account-equity migration) is separately needed for 6w/12w results. It is not a substitute for 103/133.

133 adds nullable provenance/lifecycle fields without historical attribution and installs immutable evidence guards. It runs in a transaction and reruns safely in the isolated harness. ALTER TABLE and trigger installation acquire locks; their production duration was not measured.

Before release: read-only schema verification of columns and trigger/function; plan an approved maintenance window if needed; drain/coordinate old labeller/lifecycle handlers; apply approved prerequisite migrations; deploy compatible writers; verify missing-schema failure behavior and new atomic evidence. The new labeller returns 503 before work when provenance schema is missing. An old writer may hit immutable-evidence errors after new evidence exists. Rolling code back does not undo the trigger or make old writers safe. No production migrations or backfills were run.

Because ownership code is already in main, actual deployed version/schema readiness deserves confirmation before further rollout. The review cannot assert production is healthy or broken without those observations.

### P2 — Broad admin suite has six existing line-ending failures

Combined run: 220 files, 1,972 tests; 214 files/1,966 tests pass, six tests fail. Failures are exact-string DDL comparisons in cgHistory, cryptoMetaModelJob, cryptoPaperExcursion, cryptoSignalLedger, cryptoReplayJob and cryptoExitSelectJob. Their 18 test/helper/migration blobs match admin-integration exactly. Six separate normalization probes pass: differences are CRLF versus LF, not SQL changes. They were not silently skipped or loosened. A portable normalization change should be owned separately if required by CI.

### P2 — Browser and live-read acceptance remains outstanding

Page/component behavior tests pass, but no authenticated browser viewport review or real-data expectancy comparison was performed in this review. Saved Morning Brief snapshots retain legacy values until an authorized rebuild. New verified cohorts may be empty until correctly attributed measurements accumulate; no historical backfill should be inferred from dates.

## Combined verification

- Project TypeScript check passes on the exact exported combined tree.
- Broad admin + position-horizon + Morning Brief run: 1,966 pass / six existing line-ending failures, as detailed above. This is not the complete repository suite.
- Additional labeller/price/label tests and review probes: 39 pass (32 route/rule tests plus seven policy/normalization probes).
- All seven PostgreSQL 18.4 harnesses pass on the combined source: ownership migrations/writer order/immutability, pre-migration reader compatibility, cohort routing/isolation, long-horizon denominators, journal R accounting, expectancy parity, and completeness classification.
- Tests use isolated temporary fixture schemas/tables and mocked external inputs. No provider or production traffic. PostgreSQL fixture server stopped after checks.
- Live `lib/admin/expectancy.ts` scoring behavior is unchanged by the pending stack. Journal expectancy's existing sample gate intentionally changes to valid-R counts; this can keep rebuilt briefs THROTTLED when old missing-R counts inflated eligibility. See #612 report.
- Shared writer changes in already-merged #604 can affect downstream recorded statistics; unchanged public code/contracts does not imply no downstream data effect.

## Recommended next task

Prepare a narrow read-only access proposal for these analytics under discovery-only mode, with middleware tests that keep rebuilds, labelling and other paused jobs disabled. Separately confirm deployed commit and schema with read-only checks before any release decision. No deployment authorization is implied by this report.
