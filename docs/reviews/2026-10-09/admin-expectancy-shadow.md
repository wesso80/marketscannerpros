# Read-only scanner expectancy comparison

9 October 2026. Branch `codex/admin-expectancy-shadow`, stacked on #612 (`9642ae53`). Remote fetched before work. Edge Check differences against admin-integration were the existing unmerged #606 cohort changes, not a competing edit; those changes are preserved. Ownership notice posted to #612.

## Delivered

New page `/admin/expectancy-shadow`, linked from Edge Check, calls only the new admin-only read route `/api/admin/expectancy-shadow`. The user enters a symbol and exact scanner playbook key, optionally the elite score BEFORE expectancy was added. There is no automatic provider fetch or live score lookup.

`lib/admin/expectancyShadow.ts` compares the current eligible population with its verified-method subset using the existing exported `profileFromRow` and `expectancyScoreBoost` functions. The weighted blend, rounded profile averages, maximum-profile eligibility count, adjustment rounding and score cap match the live enrichment function. Accumulation uses the schema's NUMERIC(10,4) precision to preserve PostgreSQL decimal sums rather than introduce binary floating-point accumulation differences.

Results show symbol/playbook counts, overlapping records, unique counts, unknown/inconsistent attribution, eligibility sample, blended move, adjustment difference and optional capped-score difference. Empty verified history remains explicitly unavailable as a sample; the formula's zero adjustment is shown as a hypothetical scenario, not a finding of no trading edge. Groups below the live minimum of 30 never receive an adjustment.

## Exact scope

Current baseline deliberately preserves live eligibility: operator-terminal workspace, requested symbol OR playbook, 120-day signal window, correct/wrong/neutral, the legacy measurement cutoff, non-null move and absolute move <=100%. Its non-SHORT-as-LONG signing is preserved and unrecognized directions counted. Playbook keys are case sensitive; caller must use the actual key (playbook, regime fallback, or Unknown). This tool is not an automatic scanner-wide ranking report.

A single read supplies both populations. More than 20,000 eligible records returns unavailable without truncated statistics. Authentication precedes DB work. All response branches use private/no-store. Raw measurement evidence and database error details are excluded. Editing inputs clears the prior result and invalidates in-flight responses; requests only begin on submission.

## Verification

- 21 focused tests pass: comparison/route contract 10, page behavior 3, unchanged live expectancy regression 4, Edge Check chronology 4.
- Isolated PostgreSQL 18.4 harness `scripts/audit/expectancy-shadow-postgres.cjs` executes the actual route and live enrichment helper. Both current and verified scenarios match live profile values, blended averages, score adjustments and capped scores using rollback-only temporary fixtures. Tests include overlapping memberships, decimal rounding, unknown direction, workspace/window exclusions and response projection.
- Locked runtime initially had an outdated expectancy helper; it was synchronized from the source branch before passing checks. No source live scoring edits were made.
- Project typecheck passes. No full-suite or browser viewport check claimed; client behavior is covered by component tests.

## Release and interpretation

No production data/provider requests, writes, merges or deployments. `lib/admin/expectancy.ts` is unchanged. This is a comparison tool, not evidence that verified-only scoring will perform better. Its route/page become available only after the stack is reviewed and eventually released. No live comparison results are claimed in this report.

Recommended next task: review the stacked admin changes together, including #604 writer/schema prerequisites, before release. Any proposal to change scoring should first inspect real verified cohort coverage, overlap and forward/out-of-sample evidence; do not tune against this tool's synthetic fixture results.
