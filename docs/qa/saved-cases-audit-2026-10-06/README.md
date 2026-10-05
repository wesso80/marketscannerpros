# Saved Cases audit follow-up — Pip visual check pending

Targets `batch/oct-wp` from `9c9d40a8bab904db0ed695a7efd69a7cba9c4f83`. Separate from Earnings #402; no changes to the Earnings rendering block.

The archive previously displayed all loaded cards with multiple engine badges and actions open. It now shows five records with Show all, folds detail/action controls, uses plain display labels, and identifies the data as stored snapshots in one source line. Missing evidence counts stay missing instead of showing zero. Failed requests are distinct from an empty archive and raw backend errors are hidden; retained records are explicitly described as previously loaded.

Validation: eight focused tests passed (savedCasesCompact and researchCompact); TypeScript passed; diff whitespace check passed. Tests cover expansion, source/summary counts, initial closed folds, unknown labels, missing evidence, refresh failure/recovery, Symbol navigation, explicit suggestion application, original outcome values and deletion identity. All network/API operations in tests are mocked. No provider requests or production writes.

Refresh, delete, update and suggestion callbacks/effect are byte-identical to the batch base. SHA-256: `35d1788115e3b5468aaf528f09fe35f2d6118544c12f41670f8ba35425859666`. Display labels never flow back into APIs. React review: existing callbacks retained, native disclosures/buttons, immutable slice, no new effects.

Measured on `/tools/research?tab=saved` with mocked Pro fixtures. Details, PNG paths, and raw `scrollHeight` values are in [evidence.md](evidence.md) and [evidence.json](evidence.json).

| # | Hard layout gate | Status |
|---|---|---|
| 1 | One verdict above first fold | Pass. One `[data-research-verdict]` inside both viewports. Phone summary wraps and still ends at y 446.5 inside 844. |
| 2 | About two screens, folds closed | **Pass.** Five cards: 1.692 at 1280 and 1.918 at 390. Empty and error are 1.000. Show all is 2.319 / 2.512 and is over the 2.3 hard max; that is the expanded list, not the five-card gate. |
| 3 | No sideways scroll at 390 | **Pass.** Document and body width 390, including the opened long evidence. Research TabBar wraps (`scrollWidth` = `clientWidth`). |
| 4 | No fake/empty tool | Empty archive and failed request are different sentences. Error keeps no cards and no source line. |
| 5 | No banned/engine words | Closed populated text has no `DEGRADED` or `NO_SETUP`. Opened details use plain labels. |
| 6 | Readable numbers + one source line | One SourceLine on populated and empty. Missing evidence count renders “Not supplied”. Error has zero source lines. |
| 7 | Screenshots at 1280 and 390 | **Pass.** Populated closed, Show all, opened details, empty, and error. |
| 8 | Symbol / Overview / Track chrome | Unchanged by this evidence commit. Symbol handoff and outcome actions were not exercised on a signed-in account. |

Before screenshots against `batch/oct-wp` @ `9c9d40a8` were not taken. Keep draft. No merge or deploy.
