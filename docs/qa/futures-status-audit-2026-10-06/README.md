# Terminal Futures status copy — Pip visual check pending

Targets `batch/oct-wp` from `9c9d40a8bab904db0ed695a7efd69a7cba9c4f83`.

Futures previously displayed raw request errors, the `dataState` engine value, and individual backend issue strings. Request failure now shows a plain recovery message. Loaded responses have a readable context summary and folded coverage count; no backend diagnostics are printed. Missing data no longer claims that unrendered modules remain available. A single source line distinguishes session-derived context from observed market prices/volume without inventing a timestamp.

Liquidity & Volume now explicitly says its scores are session-based estimates, not measured volume or order-book liquidity. The estimator and numerical scores are unchanged, as are session engines, risk notice, selected-tab rendering and provider-failure suppression. No changes to #365 Options Flow/Crypto Derivatives/Time Confluence tabs or shared Terminal chrome. This is a focused status/copy correction, not a Futures layout rewrite.

Validation: seven tests passed (futuresStatusCopy and futuresSessionEngine), TypeScript and whitespace checks passed. Tests verify raw-error suppression, absent-data wording, one summary/source, initially folded coverage, retained estimator output and provider-failure suppression. No fetch/provider requests or production writes.

| Hard layout gate | Status |
|---|---|
| One verdict above first fold | One panel summary tested; parent Terminal context for Pip |
| About two screens closed | Not claimed by this copy patch; Pip to measure |
| No sideways scroll at 390 | Pending Pip |
| No fake/empty tool | Failure/missing states explicit; estimates labelled |
| No banned/engine words | Error/dataState/issue strings removed; other module copy for Pip |
| Readable numbers + one source line | Existing score rounding preserved; one panel source |
| Screenshots 1280 and 390 | Pending Pip; no screenshots claimed |
| Symbol / Overview / Track chrome | No shared chrome changes |

**Pip to check:** Terminal Futures using a mocked /ES response at 1280×800 and 390×844: ready, partial coverage, failed request, absent response and provider-error states. Verify the context summary is above the first fold and does not duplicate parent Terminal verdict/source. Check all Futures subviews, closed Data coverage, the explicit estimate caveat, screen counts and overflow. Capture before/after with parent chrome. No need to run a live provider request for this copy review.

User assigned visual checks to Pip. Draft/HOLD pending evidence; no merge/deploy.
