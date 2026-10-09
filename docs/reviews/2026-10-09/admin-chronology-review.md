# Admin chronological comparison review

Reviewed main 0b6f2f5b (includes Claude #591 via #592). Codex #590 and #593 remain separate drafts. This follow-up deliberately reuses Edge Check instead of adding competing chronology to Model Diagnostics.

## Fixed in this draft

- `lib/admin/edgeCheck.ts`: a split by row count could divide the same signal timestamp across earlier/later halves. Choose the most balanced boundary between distinct timestamps, keep all tied timestamps together, and retain the existing minimum sample per period. If every timestamp is identical, there is no earlier period and the comparison is insufficient.
- The later-period sign check used a rounded display mean. Use its unrounded value, with an explicit disclosure that displayed zero can be slightly positive/negative.
- `app/admin/edge-check/page.tsx`: display both start and end timestamps of each period. Use "Positive after-cost mean not established" when the interval crosses zero; absence of evidence is not proof that an edge does not exist.
- `app/api/admin/edge-check/route.ts`: explain different group cut dates, nominal independence assumptions, multiple-comparison limitations, maturity exclusions and overlapping outcome windows. A chronological split inside retrospectively observed data is not held-out validation.

## Existing protections preserved

Admin guard before querying; research-key allowlist; whitelisted grouping intent; fixed-labeller measurement filter; LONG/SHORT scope; finite/bounded return filter; cost explicitly assumed; minimum 30 total and 15 in each period; no score, worker, provider or public changes. No new queries or writes.

## Still unresolved

- Nominal confidence intervals treat correlated observations as independent. Same-symbol and market-wide overlap can make them overconfident. Implement and compare cluster/block uncertainty before treating labels as strong evidence.
- There is no embargo or outcome-end purge around the cut. Daily fallback can extend beyond 24 hours. A genuine forward validation cohort requires frozen rules and recorded actual measurement horizon, rather than assuming 24 hours is always sufficient.
- Only measured fixed-labeller outcomes enter Edge Check; missing/recent observations need a completeness denominator alongside results.
- Groups are still ranked by evidence and after-cost mean, and no multiplicity correction is applied. This is exploratory selection, not confirmation.
- `parseBy` uses `in` on an ordinary object: inherited property names pass the intended whitelist. It should use an own-property check in a separate route-hardening follow-up with denied-auth/error cache tests.
- Verify the stated same-day deduplication against stored uniqueness/recorder behavior; this review does not establish it from live rows.
- Singleton normal intervals currently collapse to the observed value despite insufficient evidence; the minimum-sample verdict blocks a positive classification but the interval itself remains misleading.

## Validation and limits

Focused helper, real route with fake database, and rendered-page tests cover tie preservation, shuffled order, single timestamp, uneven periods, rounding and all four period endpoints. No production data reads, provider requests, merges or deployments. No browser viewport or full-suite result claimed. Typecheck is run in the locked dependency runtime with changed files copied in.
