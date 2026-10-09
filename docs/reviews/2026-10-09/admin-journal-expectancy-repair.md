# Admin Morning Brief journal expectancy repair

9 October 2026. Branch `codex/admin-journal-expectancy`, stacked on #611 at `0d0e8dc2`. Before edits, fetched main `27b44546` and admin-integration `56e8250f`; no overlapping remote Morning Brief changes. Ownership notice posted on #611.

## Changed

`lib/admin/journalExpectancy.ts` now owns the admin-only journal expectancy loader and aggregation. A single SQL snapshot builds overall, symbol and playbook aggregates for the explicit workspace's closed journal trades over 90 days. Overall totals are not capped at 40 groups. The final best/weak lists still contain at most four groups and require two valid R values.

Missing R is no longer zero. True 0R remains valid. The first non-null field is chosen in the existing order: r_multiple, dynamic_r, normalized_r. NaN/Infinity/-Infinity in the chosen field is counted invalid and excluded, not silently replaced by a different field. Counts distinguish closed trades, valid R, missing R, invalid R and source fields. Positive-R win rate uses all valid R, including zero; groups show the valid denominator. Outcome/P&L/R sign conflicts are counted, not silently rewritten. These journal sources can have differing risk/cost bases and are not independently verified fills.

`lib/admin/morning-brief.ts` delegates to this loader. Missing workspace, failed read and malformed aggregate output return explicit unavailable status and null counts; successful empty history returns available status and zero counts. Error details stay out of the response. The existing 30-sample risk-governor gate now uses valid R observations instead of closed-trade count; a large number of missing-R rows cannot unlock NORMAL on sample size. This may correctly keep a rebuilt brief THROTTLED where the old inflated count allowed NORMAL. The thresholds, risk percentages, scanner elite scoring and trade execution remain unchanged.

`app/admin/morning-brief/page.tsx` shows valid-R counts and the source/conflict note. All four expectancy buckets show unavailable on read failure. Previously saved briefs are not rewritten: missing denominator metadata is labelled unrecorded and the historical win basis labelled legacy. Corrected values appear on a future authorized rebuild. No live rebuild was run.

## Acceptance and evidence

- 28 focused tests pass: journal aggregation/loader 4, saved Morning Brief and workspace integration 16, workspace route 5, data truth 3.
- `scripts/audit/journal-expectancy-postgres.cjs` exercises the actual SQL and loader on isolated PostgreSQL 18.4 with rollback-only temporary data. It checks missing vs 0R, nonfinite exclusion without fallback, dynamic/normalized sources, conflicting records, >40 groups, workspace/open/date exclusions and empty history.
- The SQL fixture has 92 eligible closed trades: 89 valid R, one missing R, two invalid R and one conflict. Excluded workspace/open/old rows never enter those totals.
- A +2R, missing-R, 0R group yields two valid observations and a 1R mean, rather than dividing by all three closed trades.
- Project typecheck uses the locked dependency runtime. No full-suite or browser viewport verification claimed.

## Boundaries and follow-up

No public page/API, journal writes, labeller, scanner expectancy scoring, broker connection, deployment or merge. No production/provider calls. Only admin Morning Brief reporting and its existing sample-size gate change.

Remaining: other Morning Brief session-score/outcome-grade R aggregations still use their own missing-as-zero logic and were not silently changed in this focused patch. Scanner expectancy still needs a read-only shadow comparison of current versus verified-only histories before altering its elite-score adjustment. That is the recommended next task.
