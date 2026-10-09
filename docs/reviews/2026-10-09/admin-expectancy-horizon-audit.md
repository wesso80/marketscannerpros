# Admin expectancy and long-horizon audit

9 October 2026. Audited branch: `codex/admin-outcome-cohort-panels` at `d6320013`; fetched remote main `8795a15a`, admin-integration `00fe60c7`. Implementation branch: `codex/admin-horizon-evidence-audit`, stacked on #609. No overlapping remote changes in the two edited horizon reader/display files. Scope notice posted to #609 before editing.

## Findings

### P1 — Scanner expectancy can adjust scores without verified method attribution

`lib/admin/expectancy.ts:60` selects correct/wrong/neutral outcomes using a timestamp cutoff, a non-null move and an absolute-move guard. It does not check recorded method provenance. Its query also lacks an explicit LONG/SHORT eligibility filter, while `signedMoveSql` treats non-SHORT rows as long. `enrichHitsWithExpectancy` (same file, line 110) blends symbol/playbook histories and changes eliteScore using an assumed 0.2 percentage-point cost, minimum sample 30, shrinkage and an eight-point cap. The eligibility count uses the larger sample, avoiding a simple double-counted threshold; the weighted average still mixes overlapping histories.

This is historical fixed-horizon percentage return, not closed-trade expectancy in R. It is consumed by `app/api/admin/scanner/live/route.ts` and `lib/admin/morning-brief.ts`. Timestamp recency cannot prove writer/method identity. No score formulas or live rankings were changed in this audit.

Acceptance for a follow-up: explicit directional eligibility; separate verified and unknown cohorts; show both profile bases and overlap; fixture with 30 unknown outcomes cannot be described as verified; compare baseline and proposed score effects in a read-only shadow report before changing ranking behavior.

### P1 — Journal expectancy turns missing R into zero

`lib/admin/morning-brief.ts:2713` aggregates closed journal rows for 90 days. The expression `COALESCE(r_multiple, dynamic_r, normalized_r, 0)` includes missing R as zero in averages. Sample count includes all trades rather than valid-R rows. Wins use outcome=win OR positive P&L, which can disagree with R. The three R fields have different provenance but are pooled without an attribution count. Errors are caught as empty rows at lines 2019–2020, making unavailable data resemble no history. Returned groups are capped at 40.

Example: one +2R trade and one missing-R trade produces 1R with a sample of two. The measured-R average is 2R with one valid R observation and one missing observation. This is a code-derived example, not a production-data finding.

Acceptance for the next task: retain closed-trade count; add valid/missing R counts; use null-aware averages; disclose which R field contributed; represent read errors as unavailable; show contradictory outcome/P&L/R separately; test genuine 0R, missing R, nonfinite values, and mixed sources. Keep changes inside admin consumers.

### P1 — Long-horizon method provenance is absent

`lib/outcomes/positionHorizonLabeller.ts:227` and `:234` write the 6w/12w observations with measured-at timestamps and conditional updates, but no versioned per-horizon snapshot of writer, algorithm and original measurement inputs. Migration 105 fields do not provide that snapshot. The new 24h provenance from #604 does not establish 6w/12w attribution.

Current source describes daily-bar simulation: 42/84 calendar days, first completed exit bar at/after horizon, original entry/stop/target, conservative same-day stop/target handling with opening-gap rules (`lib/outcomes/positionHorizon.ts`). That describes current code, not proof of the method used for every historical row. Missing history, reconstructed OHLC values and the original basis of stop/target fields need separate quality treatment before claiming reproducibility. No provider data was requested and no historical labels were recomputed.

Acceptance for later writer work: versioned per-horizon evidence; entry/stop/target/source/time snapshot; explicit simulated cost basis; idempotent write tests; unknown historical attribution remains unknown; no backfill inferred solely from timestamps. This audit does not implement that writer/schema work.

### P2 — Horizon statistics used the wrong sample threshold (fixed here)

`lib/admin/positionHorizonStats.ts` previously used the total number of labelled outcomes to unlock return/MFE/MAE averages, even when very few non-null in-range measurements contributed. The directional win-rate threshold likewise included neutral outcomes. A large neutral count could unlock a rate based on only one or two directional outcomes.

The reader now counts valid return, MFE, MAE and finite-R measurements independently. Directional win rate requires the minimum correct+wrong count. Each average requires its own minimum sample. `components/admin/PositionHorizonOutcomes.tsx` shows the directional and return denominators alongside the existing R denominator. Actual zeros remain valid; missing count metadata does not silently use total labels.

The SQL now trims direction when signing moves, matching the reader's existing eligibility and the writer's normalization. Nonfinite numeric R values are excluded from both average and count.

### P2 — Display overclaimed method/boundary and exposed raw read errors (fixed here)

The method note now explicitly states unverified historical attribution and simulated daily-bar results, with no fees/slippage deducted. It accurately describes ±1% classification: +1% is correct, -1% wrong, and only values strictly between are neutral. The unsupported assertion about most historical stops being 15m was replaced with a statement about each call's recorded timeframe. Read failures now return a reference identifier instead of raw database exception text; detailed errors still use the existing server-side logging helper.

## Other expectancy families

`lib/admin/cryptoPaperStats.ts` separately counts finite R observations (`withR`) and derives its R average from those, while P&L profit factor is a different denominator/basis. `lib/admin/portfolio-lab/analyticsEngine.ts` computes portfolio-lab expectancy and confidence intervals from its own closed-trade inputs. These are distinct sources; the 24h validator must not be applied as a blanket verification stamp to either. A full execution-ledger/cost audit is outside this patch.

## Validation and release boundaries

- 40 tests pass: new horizon evidence checks 6, existing horizon labeller 12, pure position calculations 16, and the three admin cohort page integration tests 6.
- Real PostgreSQL 18.4 harness `scripts/audit/horizon-stats-postgres.cjs` runs the actual 6w/12w aggregation against rollback-only temporary data: sparse valid counts, NaN R exclusion, trimmed SHORT direction and valid zero averages.
- Locked project TypeScript check passes. No full-suite or browser visual check claimed.
- Changed runtime files are only the admin horizon statistics helper and its admin display component. No scoring, writer, public, broker or execution changes. No merges, deployments, production queries/mutations or provider requests.

Recommended next task: repair the admin Morning Brief journal expectancy missing-R accounting and unavailable state, then produce a shadow comparison of verified-only versus current scanner expectancy before tuning score adjustments.
