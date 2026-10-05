# Job A — Symbol visual evidence, 5 October 2026

**Mocked Pro browser session; not live market/provider evidence. Do not merge until real-session review.** These are Chromium screenshots of the complete built Next application. No screenshot is a jsdom render, image mockup or cropped desktop substituted for mobile. Every API response, including authentication tier and writes, was intercepted in the browser. External browser requests were blocked. No production page was opened.

The before application is the existing #353 starting head `9b8d93a811da008ae9cbac2be773fa1a008baea0` (not main). The after continues its published follow-up `a92c1e1bf10d525a52c0ccb9967f0e28b341e23b`; PR base remains main `f33130bd969238fc3e959049df1cbd48c819ae04`. Same deterministic fixtures are used on both sides. Data are intentionally historical/synthetic. NEAR's packet/quote/chart have a $16 latest close; AAPL chart closes at $100. No fixture is claimed as current market data.

## Closed-fold measurements

| Symbol | Viewport | Before height/screens | After height/screens | After scroll width |
|---|---|---|---|---|
| AAPL | 1280×800 | 1095 / 1.369 | 1180 / 1.475 | 1280 |
| AAPL | 390×844 | 1328 / 1.573 | 1391 / 1.648 | 390 |
| NEAR | 1280×800 | 1328 / 1.660 | 1344 / 1.680 | 1280 |
| NEAR | 390×844 | 1803 / 2.136 | 1780 / 2.109 | 390 |

Every after case has zero open `details`, exactly one summary verdict (`No setup` for AAPL; `NO BASE` for NEAR) within the first fold, and one SourceLine closed and expanded. Verdict top: 291.5 desktop / 287.5 mobile. No page errors. Exact observation times, DOM text and intercepted requests are in each `evidence.json`.

## Screenshots

For each link, `viewport` is the exact requested viewport; `closed` is the full-page capture at that width.

| Case | Before | After |
|---|---|---|
| AAPL desktop | [viewport](before/aapl-1280-viewport.png) · [full page](before/aapl-1280-closed.png) | [viewport](after/aapl-1280-viewport.png) · [full page](after/aapl-1280-closed.png) |
| AAPL phone | [viewport](before/aapl-390-viewport.png) · [full page](before/aapl-390-closed.png) | [viewport](after/aapl-390-viewport.png) · [full page](after/aapl-390-closed.png) |
| NEAR desktop | [viewport](before/near-1280-viewport.png) · [full page](before/near-1280-closed.png) | [viewport](after/near-1280-viewport.png) · [full page](after/near-1280-closed.png) |
| NEAR phone | [viewport](before/near-390-viewport.png) · [full page](before/near-390-closed.png) | [viewport](after/near-390-viewport.png) · [full page](after/near-390-closed.png) |

NEAR Rule check expanded: [desktop](after/near-1280-rule-check-open.png), [phone](after/near-390-rule-check-open.png).

## Changes prompted by browser review

Compact chart and rule dates now use readable session dates. Source names are deduplicated within the single source line. Ownership errors remain explicit amber faults, with their original reason. The legacy Symbol name in next-check prose is mapped by the existing presentation formatter. No scoring, dates, numeric observations or engine outputs change.

## Gates and limits

1. **Yes, mocked session:** one verdict first fold on AAPL/NEAR. Existing AAPL/NVDA/NEAR/LINK/BTC render assertions retained.
2. **Yes, mocked session:** 1.48–2.11 screens, closed.
3. **Yes, mocked session:** 390 scroll width at 390 viewport.
4. **Yes in captured states:** no example results; mocked missing ownership feed is a visible amber fault. Actual provider behavior still requires real-session review.
5. **Partial, protected disclosure exception:** no banned/engine strings in captured closed states; expanded evidence retains the protected sentence “Research alignment, not an outcome probability.” That wording was not changed. No blanket zero-match claim.
6. **Yes, mocked session:** readable dates and numbers; one SourceLine even all folds open. Number unit tests preserve 249.4%, $1.09B, $0.4664 and 1.49x.
7. **Yes for mocked Pro captures; real-session pending:** required before/after AAPL/NEAR viewport shots and NEAR open Rule check included. Free/signed-out browser proof and optional LINK screenshots still pending.
8. **Yes in captured page chrome:** Symbol naming, no user-visible Golden Egg or Command Center in captured after states. Shared navigation is unchanged.

## Validation

- Required dummy-environment Next build: exit 0.
- TypeScript: exit 0.
- Final focused Symbol group: 30 tests across 5 files passed, including 3 unchanged-score parity replays.
- Full suite before final one-line naming mapper: 4927 passed, 12 failed, 13 skipped; 555 passed, 7 failed, 2 skipped files. Same previously documented failures: commanderCommandState, operatorMarketDataAccuracy, workerEquityBulkWiring, globalM2Reliability, backtestStrategySignals, bulkSelectionRoute, cryptoScanAliasRows. No new failing file.
- New ownership fault render test fails against the original before application and passes after. New date/naming formatter assertions pass. Existing baseline parity remains fixture-only, not live canonical proof.

Noticed, not changed: NEAR OI/funding data-truth faults remain Patch-owned; protected disclosure; actual data freshness and provider correctness; shared regime strip says not available because fixture does not supply regime. No nav, API, scoring, worker, package, authentication implementation or configuration changes.
