# Research Earnings audit follow-up — Pip visual check pending

Base: `batch/oct-wp` at `9c9d40a8bab904db0ed695a7efd69a7cba9c4f83`.

Replaces three simultaneously open tables with one selected API group, five compact rows and Show all. Report details and watchlist action are folded. Symbol uses a native button, avoiding row-keyboard events triggered by nested watchlist controls. Existing data hooks, group order, Symbol handler and watchlist handler remain unchanged. Estimates are rounded with supplied currency; absent/nonfinite estimates remain missing.

Validation: TypeScript passed; eight focused tests passed (earningsCompact and researchCompact). Tests cover original ordering and expansion reset, independent Symbol/watchlist actions, disabled completed saves, empty/error states, one source/summary, closed folds, currency and zero/missing estimates. No provider requests or production writes. React review: prop-only presentation, no new effects, immutable arrays, native controls/disclosures.

| Hard layout gate | Status |
|---|---|
| One verdict above first fold | One summary tested; placement for Pip |
| About two screens closed | Pending Pip |
| No sideways scroll at 390 | Pending Pip |
| No fake/empty tool | Empty/error states tested; no stale rows on error |
| No banned/engine words | Raw backend error hidden; populated copy for Pip |
| Readable numbers + one source line | Currency/rounding/missing-value tests pass; one source |
| Screenshots at 1280 and 390 | Pending Pip; no screenshots claimed |
| Symbol / Overview / Track chrome | Symbol wording; shared chrome unchanged |

**Pip to check:** Research → Earnings at 1280×800 and 390×844; all three list tabs, five rows/Show all/reset, folds closed, first-fold summary, screen count and overflow. Include a long company name, empty group, absent estimate and failed feed. Verify Symbol navigation and watchlist save on a test account. Capture before/after against batch base. No scores, data routes or other Research tabs changed.

User assigned visual verification to Pip after local browser file preview was blocked by browser security policy. Keep draft/HOLD pending visual proof. No merge/deploy.
