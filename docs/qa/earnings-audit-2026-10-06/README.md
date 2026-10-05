# Research Earnings audit follow-up — Pip visual check pending

Base: `batch/oct-wp` at `9c9d40a8bab904db0ed695a7efd69a7cba9c4f83`.

Replaces three simultaneously open tables with one selected API group, five compact rows and Show all. Report details and watchlist action are folded. Symbol uses a native button, avoiding row-keyboard events triggered by nested watchlist controls. Existing data hooks, group order, Symbol handler and watchlist handler remain unchanged. Estimates are rounded with supplied currency; absent/nonfinite estimates remain missing.

Validation: TypeScript passed; eight focused tests passed (earningsCompact and researchCompact). Tests cover original ordering and expansion reset, independent Symbol/watchlist actions, disabled completed saves, empty/error states, one source/summary, closed folds, currency and zero/missing estimates. No provider requests or production writes. React review: prop-only presentation, no new effects, immutable arrays, native controls/disclosures.

Measured on `/tools/research?tab=earnings` with mocked Pro fixtures. Details, PNG paths, and raw `scrollHeight` values are in [evidence.md](evidence.md) and [evidence.json](evidence.json).

| # | Hard layout gate | Status |
|---|---|---|
| 1 | One verdict above first fold | Pass. One `[data-research-verdict]` inside both viewports on every captured group. |
| 2 | About two screens closed | **Pass.** Five-row This week is 1.585 at 1280 and 1.803 at 390. Next week empty is 1.000. Major is 1.170 / 1.410. Show all is 1.935 / 2.135: under the 2.3 hard max, above the 2.0 target. |
| 3 | No sideways scroll at 390 | **Pass.** Document and body width 390, including the opened long company name. Research TabBar wraps (`scrollWidth` = `clientWidth`); no sideways overflow. |
| 4 | No fake/empty tool | Empty next week and the failed feed are explicit. No stale rows on error. |
| 5 | No banned/engine words | Not re-scanned in this visual pass. |
| 6 | Readable numbers + one source line | One SourceLine on populated groups. Absent estimate renders “Not supplied” when the row fold is open. Error has zero source lines. |
| 7 | Screenshots at 1280 and 390 | **Pass.** All three groups, Show all, opened details, and the error state. |
| 8 | Symbol / Overview / Track chrome | Unchanged by this evidence commit. Symbol navigation and watchlist save were not exercised on a signed-in account. |

Before screenshots against `batch/oct-wp` @ `9c9d40a8` were not taken. Keep draft. No merge or deploy.
