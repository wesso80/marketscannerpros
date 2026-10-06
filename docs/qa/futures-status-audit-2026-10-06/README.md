# Terminal Futures status copy — Pip visual check pending

Targets `batch/oct-wp` from `9c9d40a8bab904db0ed695a7efd69a7cba9c4f83`.

Futures previously displayed raw request errors, the `dataState` engine value, and individual backend issue strings. Request failure now shows a plain recovery message. Loaded responses have a readable context summary and folded coverage count; no backend diagnostics are printed. Missing data no longer claims that unrendered modules remain available. A single source line distinguishes session-derived context from observed market prices/volume without inventing a timestamp.

Liquidity & Volume now explicitly says its scores are session-based estimates, not measured volume or order-book liquidity. The estimator and numerical scores are unchanged, as are session engines, risk notice, selected-tab rendering and provider-failure suppression. No changes to #365 Options Flow/Crypto Derivatives/Time Confluence tabs or shared Terminal chrome. This is a focused status/copy correction, not a Futures layout rewrite.

Validation: seven tests passed (futuresStatusCopy and futuresSessionEngine), TypeScript and whitespace checks passed. Tests verify raw-error suppression, absent-data wording, one summary/source, initially folded coverage, retained estimator output and provider-failure suppression. No fetch/provider requests or production writes.

| Hard layout gate | Status |
|---|---|
| One verdict above first fold | Pass on loaded states except Close Calendar provider-error at 390, where the summary ends 16px below the fold. See [evidence.md](evidence.md) |
| About two screens closed | Pass the 2.3 hard max for Session, Cash Bridge, Commodity Session Map, and Liquidity. Close Calendar loaded states are 2.812–2.928 |
| No sideways scroll at 390 | Page width stays 390. Close Calendar table scrolls inside the page: 620px in a 340px region |
| No fake/empty tool | Failed, absent, partial, and provider-error copy captured |
| No banned/engine words | Raw error, NO_SETUP, PROVIDER_DEGRADED, and Data State are not visible |
| Readable numbers + one source line | One SourceLine on loaded states. Estimator scores unchanged. Failed and absent have no source line |
| Screenshots 1280 and 390 | Captured, mocked. [evidence.md](evidence.md) |
| Symbol / Overview / Track chrome | Terminal chrome included. No second Terminal verdict |

**Pip to check:** Terminal Futures using a mocked /ES response at 1280×800 and 390×844: ready, partial coverage, failed request, absent response and provider-error states. Verify the context summary is above the first fold and does not duplicate parent Terminal verdict/source. Check all Futures subviews, closed Data coverage, the explicit estimate caveat, screen counts and overflow. Capture before/after with parent chrome. No need to run a live provider request for this copy review.

Layout-gate screenshots are attached in [evidence.md](evidence.md). Calculations were not changed. No merge from this evidence commit.
