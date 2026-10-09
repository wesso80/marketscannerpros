# Outcome writer collision: reproduction and repair brief

Audited main **d8c2cdd6**, fetched 9 October 2026. The two writer files are unchanged from the versions previously traced. This draft changes only tests, a local SQL harness and this report. No runtime, worker, public, schema or production data changes.

## Reproduced findings

| Scenario | Initial evidence | Actual result | Impact |
| --- | --- | --- | --- |
| Early expiry | 40-hour-old pending LONG, valid entry, no observed close yet | Lifecycle writes expired; the fixed-horizon route then excludes it because it selects pending only | The seven-day retry opportunity is cut short |
| Stale read interleaving | Lifecycle reads active/pending row; fixed-horizon route subsequently records correct and +2% | Lifecycle's unconditional id-only UPDATE writes expired over the new outcome | A valid measurement remains in price columns but its classification is lost |
| Different methodology | Fixed-horizon writes neutral at +0.5%; optional lifecycle metadata update fails; target was +0.4% | Lifecycle reads still-active state and writes correct | A target comparison is presented using the same outcome fields as the >=1% fixed-horizon rule |

The route characterization tests execute both real POST handlers with fixture SQL state and a fake price resolver. The stale read test explicitly schedules the fixed-horizon handler between lifecycle SELECT and UPDATE. A separate isolated PostgreSQL 18.4 run executes the actual extracted production UPDATE statements against a temporary minimal-schema table and reproduces overwrite, retry exclusion and the +0.5% neutral-to-correct collision. This is controlled ordering, not a stress test or production-frequency estimate.

Sources:
- `app/api/jobs/signal-lifecycle/route.ts`: classify() uses 36-hour age and target/stop comparisons; SELECT depends on active lifecycle state; UPDATE writes shared outcome and outcome_measured_at with only WHERE id.
- `app/api/cron/label-ai-outcomes/route.ts`: candidateSql() selects pending, under-seven-day rows; fixed-horizon UPDATE guards outcome=pending; updateLifecycleState() follows as a separate best-effort write and swallows metadata failures.
- `lib/outcomes/aiOutcomeLabel.ts`: classifyOutcome() uses signed +/-1% threshold, not targets/stops.
- `lib/admin/signalStats.ts` and admin consumers: a cutoff on outcome_measured_at identifies a time, not the writer or methodology.

## Can we identify the writer of each existing outcome?

Not reliably from these columns. Both paths can populate outcome_measured_at, and lifecycle can preserve the prior price/pct_move/bar-time fields while changing the outcome. A selected-bar timestamp therefore also cannot prove that the current verdict belongs to that observation. No dedicated writer/method version was found in the searched migrations. Existing trustworthy external run/audit logs might establish some records, but none were retrieved in this audit. Historical rows with insufficient proof must remain provenance unknown; do not backfill a method simply from measurement date or numerical agreement.

## Concrete repair proposal (not implemented)

1. **Separate ownership.** Reserve fixed-horizon outcome, price/move and measurement timestamps for the horizon labeller. Store lifecycle target/stop/expiry results in separately named lifecycle fields; lifecycle transitions must not overwrite the fixed-horizon outcome or mark it expired at 36h. A state-only CAS guard helps races but is not enough to separate methodologies.
2. **Make horizon evidence atomic.** The horizon write should store method/version, horizon, selected bar close time, processing time and writer in the same guarded transaction as the outcome/price. Metadata-only failure must not make evidence mutable by a second writer. Define whether lifecycle state is intentionally separate before coupling transactions.
3. **Record provenance going forward.** Add explicit nullable provenance columns or an append-only observation record with an idempotent unique key per signal/horizon/method version. Preserve price source/fallback and selected bar time; retain writer processing time separately. Unknown historical provenance stays null/unknown.
4. **Update readers deliberately.** Inventory admin diagnostics, Signal Outcomes, Scorecard, Backtest Lab, expectancy and any shared/public consumers before changing predicates. Expose verified-method vs legacy/unknown counts. Do not silently relabel historical rows or claim all post-cutoff rows are verified. Public response changes are outside the authorized admin-only task and require separate coordination.
5. **Repair historical data only as a separate approved operation.** Use immutable source bars and a frozen method version to build a reviewable recomputation plan. Keep old evidence/audit trail; no production UPDATE is part of this report.

## Acceptance checks for the fix

- Both execution orders and the stale-read interleaving preserve the horizon result and its provenance.
- A missing close at 40h can still be retried within the horizon labeller's seven-day window; lifecycle expiry remains separately visible.
- +0.5% remains neutral for the 1% method even if a lifecycle target is hit.
- Duplicate horizon calls are idempotent; provenance cannot disagree with observation/method fields.
- Partial failures roll back required evidence fields or expose incomplete evidence explicitly; optional state failure cannot reopen ownership.
- Historical unknown-method rows are counted separately; no timestamp-only attribution.
- Admin access/privacy remain enforced; public contracts, worker scheduling and provider budgets do not change accidentally.

## Validation artifacts

- `test/admin/outcomeWriterAudit.test.ts`: 3 passing characterizations of the current defects. These are diagnostic tests, not acceptance of unsafe behaviour. When repaired, replace them with the opposite safety assertions; do not weaken them just to preserve passing tests.
- Existing `test/labelAiOutcomesRoute.test.ts`: 12 tests pass.
- `scripts/audit/outcome-writer-postgres.cjs`: loopback-only fixture harness, real production UPDATE statements, temporary table and rollback; PostgreSQL 18.4 run passed and server stopped.
- No provider requests, production reads/writes, deployed schedule verification, full-suite or live incident attribution.

## Next owner action

Coordinate the ownership fix with Claude before editing shared writer files. The high-priority next task is a draft implementing field ownership separation and atomic provenance, with migration/reader scope reviewed first. No merges or deployments are authorized by this report.
