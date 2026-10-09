# Admin outcome cohort panels

9 October 2026. Child branch `codex/admin-outcome-cohort-panels`, stacked on draft #606 (`3fdafed8`), which depends on #604. Remote fetched before work: main and admin-integration at `75b455b8`. No overlapping changes were found in the three touched admin pages/routes. Ownership notice posted on #606 before edits.

## Delivered

Signal Outcomes (`app/admin/outcomes/page.tsx`), Playbook Scorecard (`app/admin/outcomes/scorecard/page.tsx`) and Backtest Lab (`app/admin/backtest-lab/page.tsx`) each include the shared `components/admin/OutcomeCohortAnalysis.tsx` panel.

The panel calls the new admin-only `/api/admin/outcome-cohorts` route. It offers all eligible, verified-method, and unverified/unknown measurements, with 7/30/90-day windows. It reports correct/wrong/neutral counts, the explicit directional denominator, mean signed percentage move with its valid-move count, per-group counts and the latest selected signal time. Groups are alphabetical, with no minimum or group truncation; a small sample is visible rather than represented as established edge.

Verification uses #606's server-side validator: recorded writer/method, direction, threshold, prices, move, verdict and timestamps must agree. It does not independently validate provider prices or predictive performance. Unknown attribution and inconsistent evidence are distinct counts. An empty verified cohort never falls back to history.

## Population and boundaries

All three panels include only LONG/SHORT calls with correct/wrong/neutral 24h outcomes, a non-null move, a measurement timestamp at or after the legacy cutoff, and a signal timestamp within the selected window. The cutoff alone never establishes provenance. Signal Outcomes and Scorecard use operator-terminal only; Backtest Lab also includes admin-call:* workspaces.

Grouping is direction/regime for Signal Outcomes, playbook/direction/regime for Scorecard, and setup/market for Backtest Lab. Correct / (correct + wrong) excludes neutral from the rate denominator. Signed mean moves include neutral, excluding non-finite or absolute moves over 100%. No fees/slippage deducted. These are fixed-horizon measurements, not executed P&L or target-before-stop results; repeated calls can overlap.

This is a deliberately independent 24h analysis. Existing historical tables remain available, with explicit mixed/unknown-attribution wording. The selector DOES NOT filter those tables, pending counts, the signal list, 4h statistics or 6w/12w studies. It cannot confer 24h verification on another horizon. The existing aggregate routes only receive wording corrections; their calculations remain unchanged. Prior default populations are preserved.

One query supplies the records and evidence for each request. Above 20,000 eligible rows the route returns 422 and asks for a shorter window rather than presenting partial statistics. This bound is an implementation limit, not a claimed performance benchmark. Migration-dependent provenance fields read safely as unknown on old schemas. Authentication precedes query work; successful, refused and failed responses are private/no-store. Raw evidence and database exceptions are not exposed.

No public pages/contracts, writers, scoring models, broker integrations or trade execution changed. No merge, deployment, provider request, live labeller run, production migration or production-data mutation.

## Validation

- 54 focused tests pass: new route/aggregation 14, real shared panel and all three real page mounts 6, existing provenance validator 10, historical Scorecard/Backtest regression 4, existing truth-stamp checks 20.
- Panel tests cover filter/window/refresh, failure clearing, stale-request rejection, explicit historical separation and absence of writer calls.
- `scripts/audit/outcome-cohort-panels-postgres.cjs` executes the actual route and SQL against isolated PostgreSQL 18.4 with rollback-only temporary fixtures. It covers pre-provenance schema, verified/unknown/inconsistent records, workspace/window/direction/status exclusions, backtest source grouping and raw-evidence exclusion.
- Project typecheck run in the locked dependency checkout. No full-suite run or visual browser viewport inspection is claimed.

## Remaining work

Expectancy readers and longer-horizon readers still need their own method/evidence attribution audit. Avoid pooling lifecycle outcomes, fixed 24h moves and 6w/12w studies. Before model tuning, confirm verified sample size, overlap and outcome completeness; no claim of profitable edge follows from this implementation. Production remains unchanged until the prerequisite drafts are reviewed and an eventual release is authorized.
