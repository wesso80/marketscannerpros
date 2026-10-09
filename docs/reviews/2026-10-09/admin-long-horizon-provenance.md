# 6-week / 12-week result provenance and immutability

9 October 2026. Draft, held for release approval. Nothing here was merged or deployed, and no production queries,
migrations or backfills were run.

## Problem

Migration 133 gave 24h and 4h results a record of how they were measured (`outcome_provenance`,
`outcome_4h_provenance`) and a trigger that freezes them once verified. The 6w and 12w results from migration 105
had neither: they could not be told apart from historical rows of unknown origin, and any writer could change them.

## Change

- `migrations/134_ai_outcome_long_horizon_provenance.sql`
  - Refuses to run before 105 and 133. Safe to run twice.
  - Adds nullable `outcome_6w_provenance` and `outcome_12w_provenance` (JSONB). No backfill: existing 6w/12w rows
    keep NULL (unknown provenance) and stay editable, as before.
  - Replaces `protect_ai_horizon_evidence()`. The 24h and 4h checks are identical to 133. It adds 6w and 12w checks:
    once a horizon's provenance is set, that horizon's result columns, its provenance, and the inputs it was measured
    from (`trade_bias`, `price_at_signal`, `signal_at`, `stop_loss`, `target_1`) can no longer change.
- `lib/outcomes/positionHorizonLabeller.ts`
  - Every 6w/12w result, measured or `no_data`, is written with its provenance in the same guarded UPDATE.
    Provenance fields: `writer`, `method` (`daily-bar-horizon-v1`), `horizon`, `horizonDays`, `direction`, `signalAt`,
    `entryPrice`, `stopLoss`, `target`, `barSource`, `barCount`, `outcome`, and either the measured exit, move,
    excursions, first hit, R and bar count, or the `no_data` reason. `processedAt` is set by the database.
  - Bar source is `daily-cache+ohlcv_bars` for equities and `alpha-vantage-digital-currency-daily` for crypto.
  - Until 134 is applied, 6w/12w labelling is skipped with a note naming the migration, instead of writing results
    with no provenance. This never fails the labeller run; the 4h/24h steps are unaffected.

## Behaviour change to plan for

If this code deploys before migration 134, 6w/12w labelling pauses (with a note in the run result) until 134 is
applied. Rows are not lost; they stay pending and are labelled on the next run after 134.

## Release order

1. Read-only check that 105 and 133 (columns, function, trigger) exist in production.
2. Apply 134 in an approved window. It takes a short `ALTER TABLE` lock and replaces the function in one transaction.
3. Deploy the labeller.
4. Verify after the next labeller run: new 6w/12w rows have provenance whose `horizon`, `outcome` and exit fields
   match their columns; `processedAt` equals `outcome_<h>_measured_at`.

Re-running 133 after 134 would put back the 133-only function and drop the 6w/12w checks; re-run 134 if that
happens.

Rollback: rolling the code back does not remove the trigger. The old 105-era labeller only writes rows whose
`outcome_<h>` is still NULL, so it never touches frozen rows; it would write new rows without provenance.

## Validation

- `scripts/audit/long-horizon-provenance-postgres.cjs` against local Postgres 16 (loopback only). It checks:
  - 134 refuses to run without 133, and runs twice cleanly;
  - unknown-history rows stay untouched and editable;
  - the labeller's real UPDATE statements write provenance atomically for measured and `no_data` results;
  - a second write is refused by the guard;
  - a failed write leaves no provenance;
  - 6w/12w results, notes, provenance, stop, target, entry and direction are frozen once verified;
  - 6w evidence does not freeze the 12w horizon;
  - the 24h check is unchanged.
- `scripts/audit/outcome-ownership-postgres.cjs` (migration 133) still passes.
- Unit tests in `test/positionHorizonLabeller.test.ts` cover the provenance payloads, the skip before 134, and
  labelling only the horizons whose provenance column exists.

## Not in this change

- The 6w/12w stats (`lib/admin/positionHorizonStats.ts`) do not yet separate verified results from those of unknown
  provenance. That needs a follow-up before any 6w/12w figure is read as verified.
