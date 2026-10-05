# Saved Cases audit follow-up — Pip visual check pending

Targets `batch/oct-wp` from `9c9d40a8bab904db0ed695a7efd69a7cba9c4f83`. Separate from Earnings #402; no changes to the Earnings rendering block.

The archive previously displayed all loaded cards with multiple engine badges and actions open. It now shows five records with Show all, folds detail/action controls, uses plain display labels, and identifies the data as stored snapshots in one source line. Missing evidence counts stay missing instead of showing zero. Failed requests are distinct from an empty archive and raw backend errors are hidden; retained records are explicitly described as previously loaded.

Validation: eight focused tests passed (savedCasesCompact and researchCompact); TypeScript passed; diff whitespace check passed. Tests cover expansion, source/summary counts, initial closed folds, unknown labels, missing evidence, refresh failure/recovery, Symbol navigation, explicit suggestion application, original outcome values and deletion identity. All network/API operations in tests are mocked. No provider requests or production writes.

Refresh, delete, update and suggestion callbacks/effect are byte-identical to the batch base. SHA-256: `35d1788115e3b5468aaf528f09fe35f2d6118544c12f41670f8ba35425859666`. Display labels never flow back into APIs. React review: existing callbacks retained, native disclosures/buttons, immutable slice, no new effects.

| Hard layout gate | Status |
|---|---|
| One verdict above first fold | One summary tested; position for Pip |
| About two screens with folds closed | Pending Pip |
| No sideways scroll at 390 | Pending Pip |
| No fake/empty tool | Empty/failure differentiated; stored basis explicit |
| No banned/engine words | Fixture and unknown-state tests pass; populated copy for Pip |
| Readable numbers + one source line | One source; missing count not fabricated |
| Screenshots 1280 and 390 | Pending Pip; no screenshots claimed |
| Symbol / Overview / Track chrome | Symbol retained; shared chrome unchanged |

**Pip to check:** Research → Saved Cases at 1280×800 and 390×844, populated and empty. Capture before/after, first-fold summary, document height/screen count and overflow with folds closed. Include long titles and old snapshots. Exercise Show all/Show five, details, Symbol handoff, refresh failure/recovery. On a disposable test account, check explicit Apply, Confirm/Invalidate/Expire/Review, and Delete. Verify long expanded evidence wraps and no raw codes remain.

User assigned visual verification to Pip. Keep draft/HOLD until the screenshots and gate measurements are attached. No merge/deploy.
