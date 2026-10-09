# Outcome ownership repair

Base main 79f27a56. Implements the #602 repair brief. No production migration, merge or deployment performed.

## Product scope confirmed by owner

Admin is the owner's private trading workstation. Scores, rankings, actionable setups, entries, stops, targets, risk analysis and trading review are permitted. Public educational-only constraints do not apply to admin. The platform must not place trades or connect to a broker; execution belongs to the owner. This repair improves the data underpinning trading decisions and does not introduce advice restrictions or remove trading tools.

## Ownership

- `signal-lifecycle` writes lifecycle_outcome, lifecycle_method, lifecycle_outcome_measured_at and lifecycle_provenance, atomically with lifecycle state/timestamps. Provenance records its input snapshot, including entry/stop/target and selected price/time when known. The update compares the state read earlier; stale state updates return no rows and do not increment processed counts. It never writes fixed-horizon outcome/measurement fields.
- `label-ai-outcomes` owns 4h/24h observations. Each guarded measurement writes JSON provenance with writer, versioned method, threshold, direction, signal time, entry/observed price, selected bar close/source, outcome/move, and database processing time in the same SQL statement. Seven-day expiry records a distinct expiry method/reason, not a fictitious observed price.
- The horizon labeller no longer sets lifecycle target-hit/stop/expiry fields or fabricated +/-1 expectancy_r from a horizon label. Those are different concepts. Existing lifecycle values are not backfilled or erased. Search found no current app/lib readers of expectancy_r/max_favorable_pct/max_adverse_pct, but external consumers were not checked.
- 6w/12w measurement code and scoring formulas are unchanged. The top-level route requires provenance schema readiness before any work, including those later steps.

## Migration 133 (additive, no historical attribution)

Apply migration 103 first, then 133. New provenance/lifecycle fields are nullable. No default/backfill labels history as verified. A database trigger rejects changes to already-provenanced 4h/24h evidence and its direction/entry/time basis. Lifecycle writes remain possible. The trigger also rejects attempts by an old deployed writer to relabel verified measurements. Correction of verified records would require a separately reviewed process, not silent mutation.

If the schema is missing, the new labeller returns 503 before expiry writes, candidate reads or provider calls. This is intentional: it cannot promise atomic provenance using the old fallback schema. Old writers can still produce unknown-provenance rows during a mixed-version rollout, and may get immutable-evidence errors. Coordinate and drain old job handlers when this is eventually released; the trigger is a last line of protection, not a substitute for controlled rollout.

## Public and data boundary

No public page, response projection, navigation, entitlement or broker integration was edited. These are shared writer routes, so their corrected future records can affect downstream statistics wherever those records are consumed. Public response schemas are unchanged; do not interpret that as zero downstream data effect. Admin scoring formulas, thresholds, scheduler definitions and provider selection/budgets are unchanged.

## Verification

63 focused tests pass across the two route suites, ownership regressions, price resolution, horizon rules and position horizons. Project typecheck passes in the locked dependency runtime with the changed files copied in. Diff checks pass.

The isolated PostgreSQL 18.4 harness applies real migrations 048, 103 and 133, reruns 133 for idempotence, and uses extracted production UPDATE statements. It verifies historical NULL provenance, both writer orders, stale lifecycle CAS, duplicate measurement rejection, atomic failure, processing timestamp parity, 4h/24h immutable evidence (including direction changes), and separate expiry provenance. Temporary schema dropped and fixture server stopped. No production/provider traffic, full-suite or UI viewport run claimed.

## Release acceptance and follow-up

1. Review migration order, locking and deployment coordination before applying it anywhere shared. No production action is authorized by this document.
2. Update admin readers to show newly provenanced measurements separately from historical unknowns; current cutoff-based readers still include mixed historical methodology. This repair prevents future collisions but does not establish historical accuracy.
3. Coordinate #602 characterization tests: they deliberately describe old defects. Replace/retire those in favour of the safety tests in this repair when integrating, rather than expecting the old unsafe outcomes to keep passing.
4. Tune the private trading workstation on verified data: lifecycle trade results and horizon statistics should stay distinguishable in reporting. Do not add execution or broker connectivity.
