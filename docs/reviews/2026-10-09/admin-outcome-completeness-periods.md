# Admin outcome completeness by period

Stacked on #596 at e7d84c76. Latest fetched main f8369309 includes Claude's expectancy work (#595/#597); this draft does not touch expectancy or its scoring.

## Change

Edge Check now reads all recorded LONG/SHORT shared-scan rows in its requested 1-365 day window. One SQL CASE classifies every row exactly once: measured (same fixed-labeller/bounded move conditions as before), pending, expired, old method (missing/pre-fix measurement date on a recognised outcome), invalid move (fixed-method recognised label but missing/out-of-bounds move), or unknown. Pending and expired remain their recorded status, not measurement verdicts.

Only measured rows reach existing Edge Check calculations and uncertainty helpers. Overall and UTC-day completeness counts come from the same query snapshot, avoiding a second-query denominator race. Rows remain internal; the API adds aggregated counts only. Admin authorization still precedes the query.

The page shows overall counts and a collapsible daily table. Calendar periods are explicitly distinct from group-specific earlier/later splits. Empty dates are omitted, not represented as measured zero-return days. Pending is not classified as overdue without a verified due time. Existing truth timestamp retains the latest measured signal basis.

## Verification

- 25 focused tests pass, covering category reconciliation, UTC day boundaries, unknown statuses, empty/all-pending display, route numerator preservation and refusal before reads for non-admin sessions.
- Locked dependency-runtime project typecheck passes with changed files copied in.
- Isolated PostgreSQL 18.4 fixture run passes: 13 status/edge fixtures (including zero, null, 100, 101 and NaN moves); measured count agrees with the previous SQL; different workspace, non-directional and outside-window rows stay excluded. The script extracts the production query template with fixed grouping/sign substitutions. It uses a temporary minimal-schema table, not production data or a full migration replay.
- Reusable harness: scripts/audit/edge-completeness-postgres.cjs. Requires EDGE_COMPLETENESS_TEST_URL on loopback and pg installed; creates a temporary table inside a rolled-back transaction.
- No full-suite or browser viewport check claimed. No production traffic, merges or deployments.

## Limitations and follow-up

The widened query transfers more rows because unresolved outcomes now count; production volume and latency have not been benchmarked. Keep the window cap and assess representative-volume performance before deployment. The completeness ledger is overall by calendar day, not cross-tabulated per playbook/group. It includes recorded rows only and cannot detect signals never written by a scanner.

Next: verify expected measurement due times and actual outcome-end timestamps, so pending-but-not-due can be separated from stalled collection and forward-validation purging can use actual horizons. Also address the separately documented route whitelist, error cache and singleton interval issues. No inference of profitability follows from completeness alone.
