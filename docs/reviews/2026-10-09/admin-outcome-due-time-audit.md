# Outcome due-time and provenance audit

Base: #598 at 85fd1952. Read-only code trace; no production schedule, provider responses or run logs inspected. Public pages, models, workers and collection behaviour are unchanged.

## Findings

1. **24 hours is an eligibility threshold, not a deadline.** `lib/outcomes/aiOutcomeLabel.ts` (`horizonPassed`, `priceAtOrAfter`) requires the first completed close at/after signal time + horizon. `lib/outcomes/aiOutcomePrices.ts` (`createHorizonPriceResolver`) tries intraday first, with daily fallback only for 24h. Market closures, entitlement delays, missing bars or failed requests can all defer a valid price. A due timestamp alone cannot distinguish these causes.
2. **Candidate and expiry boundaries differ.** `app/api/cron/label-ai-outcomes/route.ts` (`candidateSql`) accepts pending rows at least 24h old but strictly less than seven days old, supported assets, directional bias and a positive entry. The expiry UPDATE uses strictly older than seven days. Exactly seven days is temporarily in neither query. The route does not permanently mark each unsuccessful attempt; its response contains per-run skip counts.
3. **Capacity can defer candidates.** `lib/outcomes/labelBudget.ts` defaults to 300 rows per horizon (override capped at 1000) and a 90-second budget for starting work. Candidates are oldest first; 24h work precedes 4h work. A missing-price row stays pending and may be retried on later runs. No per-row last attempt/error reason is written by this route, so a particular row cannot be labelled stalled from the available fields.
4. **Two schedules target the same route.** `lib/worker/schedule.ts` has `label-signal-outcomes` at `7 2,8,14,20 * * *` and `admin-label-ai-outcomes` at `11 */6 * * *`, evaluated in UTC. Both specify three retries with 15-second delays, but different timeouts (120s / 300s). These are configured schedules, not proof of deployed/enabled executions. The conditional UPDATE prevents duplicate final labels, but does not itself prevent repeated provider reads.
5. **Actual observation and write times are different.** Migration `103_ai_signal_outcome_horizons.sql` adds `price_after_24h_at`, the selected bar close time. The route detects this optional column and writes it when available; without it, only `outcome_measured_at = NOW()` is saved. That is processing time, not the price horizon. Historical horizons cannot reliably be recovered by substituting write time.
6. **High-priority provenance collision.** `app/api/jobs/signal-lifecycle/route.ts` can also write `outcome` and `outcome_measured_at`. Its classifier expires some rows after 36h, and can use target/stop comparisons against `price_after_24h` to write correct/wrong. The fixed-labeller cutoff timestamp used by diagnostics does not identify which writer produced the label. Thus an expired row does not prove the seven-day labeller timeout, and a post-fix timestamp alone does not prove a threshold-based 24h verdict. This is a code path finding; whether/how often it executes in production remains unverified.

## Implemented admin-only display

Pending counts now distinguish: under 24h with supported asset/valid entry; candidate-age window 24h to under 7d; at/beyond 7d; unsupported asset; invalid entry; future/unknown timestamps. Categories are disjoint, with precedence documented on screen. They reflect the selected LONG/SHORT cohort only. No category claims a provider outage, overdue SLA or stalled run.

The same query now selects asset, entry price and PostgreSQL NOW() as observation time; no extra query or write. Counts use database observation time, avoiding application-clock drift at boundaries. Existing estimates and measured eligibility are unchanged. No optional horizon column is required.

## Validation

30 focused tests pass: exact 24h and 7d boundaries, blocker precedence, malformed/future time, measured exclusion, rendered caveats, and route use of database time. Locked-runtime project typecheck passes. The updated PostgreSQL 18.4 minimal-schema harness passes 13 classification fixtures and measured-count parity after adding the selected columns. The temporary fixture server was stopped. No full suite, browser viewport, production reads or deployment.

## Prioritised next actions

1. Audit and separate lifecycle vs fixed-horizon outcome provenance before interpreting hit rates. Reproduce both writers against fixture rows; acceptance: one writer cannot silently relabel another methodology, and historical unknown provenance is visible. Requires coordination with Claude because this concerns shared collection behaviour; this draft does not change either job.
2. Verify live scheduler enablement and recent run logs, including candidate/skip/deferred counts, before removing duplicate schedules or diagnosing an outage. No provider calls required for log inspection.
3. Propose per-row attempt time/reason plus selected-bar timestamp coverage. Acceptance: distinguish not yet ready, provider unavailable, budget deferred and terminal expiry; missing historical evidence stays unknown.
4. Only then implement an overdue/stalled SLA, session/calendar-aware availability expectations and purged forward cohorts using actual selected-bar endpoints.
