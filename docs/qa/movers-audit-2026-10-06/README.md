# Movers audit follow-up — Pip visual check pending

Base: `batch/oct-wp` at `9c9d40a8bab904db0ed695a7efd69a7cba9c4f83`.

Five initial rows with Show all; one assessment; folded filters, row evidence, context and charts. Neutral borders and plain labels. Equity observation time remains separate from the crypto feed basis. Empty/error responses do not display synthetic assessments or retained rows.

## Validation

- 24 tests passed across moversCompact, moversDataChipOv21, analysis/moverQuality, moversServerFilter and moverGoldenEggHandoff.
- TypeScript passed; production Next build passed with outbound fetch/HTTP/socket calls blocked (local build IPC allowed). Build logged expected blocked database reads; no production credentials or provider requests used.
- Fetch, filters, rankings, thresholds, environment/eligibility calculations and AI context are byte-identical to base; reason-label helper also unchanged. Core SHA-256: `55adfd07bac1e522deb440b9cb89c1d0a3b5e1fd830f0f6626ceb96fe3be7194`.
- React review: presentation-only props, type-only API import, native disclosures, buttons for actions, immutable input arrays, no new effects or requests.

## Hard layout gate

Measured on `/tools/explorer?tab=movers` with mocked Pro fixtures. Details, PNG paths, and raw `scrollHeight` values are in [evidence.md](evidence.md) and [evidence.json](evidence.json).

| # | Gate | Status |
|---|---|---|
| 1 | One verdict above first fold | Pass. One `[data-movers-verdict]`, fully inside 1280×800 (y 246–266) and 390×844 (y 365.5–385.5). No parent Markets verdict. |
| 2 | About two screens, folds closed | **Pass.** Closed max 1.681 at 1280 and 1.829 at 390. Hard max 2.3 and target 2.0 both met. Show all is 2.394 / 2.505 and is not the closed gate. |
| 3 | No sideways scroll at 390 | **Pass.** Document and body width 390 in every captured case. Markets tab list wraps (`scrollWidth` = `clientWidth`). |
| 4 | No fake/empty tool | Empty and error captures show the explicit sentence and no retained rows. |
| 5 | No banned/engine words | Not re-scanned in this visual pass. |
| 6 | Readable numbers + one source line | Populated and empty: one SourceLine. Error: zero source lines. |
| 7 | Screenshots 1280 and 390 | **Pass.** Full-page PNGs at both viewports for populated closed, Show all, empty, and error. Pixel height matches `scrollHeight`. |
| 8 | Symbol / Overview / Track chrome | Unchanged by this evidence commit. |

Before screenshots against `batch/oct-wp` @ `9c9d40a8` were not taken. Keep draft. No merge or deploy.
