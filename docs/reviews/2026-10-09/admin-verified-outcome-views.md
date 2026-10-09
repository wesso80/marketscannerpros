# Admin measurement cohorts

Draft implementation, 9 October 2026. Stacked on #604 (`e936ae41`). No merge, deployment, production migration or production writes.

## Delivered

Edge Check and Model Diagnostics now offer all eligible records (the default), verified method records, and unverified/unknown records. Historical records remain accessible. Counts distinguish unknown method attribution from inconsistent evidence, and an empty verified cohort never falls back to historical data.

`lib/admin/verifiedOutcomes.ts` validates the recorded writer, 24h method, direction, threshold, prices, percentage move, verdict and timestamps. Verification means stored method/evidence consistency, not independent verification of provider prices or proof of predictive skill. Optional provenance columns use row JSON projection so a pre-migration schema returns unknown attribution safely. The raw provenance packet is not exposed by these routes.

`app/api/admin/edge-check/route.ts` filters the already eligible measured population in the requested date window. Daily completeness still describes the full recorded population. `app/api/admin/model-diagnostics/route.ts` filters after selecting the latest 1,000 score-bearing records, including unresolved outcomes; it does not search older history to fill a cohort. Its truth timestamp now follows the selected sample.

The matching pages use `components/admin/OutcomeCohort.tsx` for the accessible selector, counts and population explanation. Existing request-order protections remain. Public routes and pages, scoring formulas, models, outcome writers, execution and broker integrations are unchanged by this child diff. Admin remains a private trading analysis platform.

## Validation

- 45 focused tests pass across verifiedOutcomes, edgeCheck, modelDiagnostics, modelDiagnosticsPage and edgeChronology.
- Project TypeScript check passes using the locked dependency runtime and explicit local type roots.
- Isolated PostgreSQL 18.4 test executes the actual JSON projection against a pre-migration schema, a valid stored measurement and a contradictory verdict.
- Existing PostgreSQL completeness harness passes 13 classification fixtures, measured-population parity and workspace/direction/window exclusions.
- Final review corrected the empty-cohort note; all 14 Model Diagnostics route tests pass again.
- React review checked selector labelling, effect dependencies, request ordering and type-only server helper imports.
- No full-suite run or browser viewport inspection is claimed for this patch. No live provider requests were needed.

## Remaining work

Signal Outcomes, Scorecard, Backtest Lab and expectancy readers still need separate review for timestamp-cutoff attribution versus explicit measurement provenance. This patch does not claim those readers are converted. Extend the same distinction next, preserving each population and denominator before tuning models against verified samples. The writer/schema prerequisite in #604 must be reviewed and integrated first; no historical provenance is invented or backfilled here.
