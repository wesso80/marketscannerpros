# Watchlist load isolation — Pip check pending

Targets `batch/oct-wp` from `9c9d40a8bab904db0ed695a7efd69a7cba9c4f83`. Fixes the existing read-state issue documented in layout PR #405; this PR does not include that layout change.

Switching lists previously retained old items when a load failed. Late item responses or quote batches could also replace data belonging to the current selection. Every item load now gets a generation token, clears old items/quotes, and accepts results only while that generation is current. Selection cleanup invalidates pending reads. Quote callbacks use the same token, including incremental batches. A current item-load failure shows a plain error and Retry loading symbols; an empty list remains a separate successful state. Retry uses the existing read route.

No provider adapters, pricing/scoring, write endpoints, account tiers, export calculations or navigation routes changed. Quote requests for already-running batches are not cancelled; stale callbacks are ignored. Late old item results are discarded before launching any new quote request. This PR addresses item/quote reads, not concurrent add/remove/write races or provider freshness.

Validation: 27 tests passed (watchlistLoadIsolation, watchlistPricing, watchlistDedupeManage, optionsWatchlistIdentity). TypeScript and whitespace check passed. Four component regressions prove failed-switch clearing and retry recovery, old item response suppression before pricing, same-symbol quote isolation and late-error suppression. Tests use deferred mocked responses; no provider requests or production writes.

| Hard layout gate | Status |
|---|---|
| One verdict above first fold | Layout tracked in #405; new failure is explicit |
| About two screens closed | #405 + Pip |
| No sideways scroll at 390 | Pip to check retry/error with #405 |
| No fake/empty tool | Failed load distinct from empty; stale read tests pass |
| No banned/engine words | New error is plain text |
| Readable numbers + one source line | Existing formatters untouched; #405 source line |
| Screenshots 1280 and 390 | Pending Pip; no screenshots claimed |
| Symbol / Overview / Track chrome | No chrome/route changes |

**Pip to check:** combine with #405 in a review environment. At 1280×800 and 390×844, load list A, delay/fail list B, and verify A's symbols/quotes disappear and B shows Retry rather than an empty-list claim. Retry B successfully. Reverse response order while switching A/B rapidly; include the same symbol with distinct fixture prices. Ensure late errors and quote chunks do not change the selected list. Capture error and recovered states alongside the #405 populated screenshots. Use mocked responses; no production writes needed.

User assigned screenshots/layout acceptance to Pip. Draft/HOLD pending review; no merge/deploy.
