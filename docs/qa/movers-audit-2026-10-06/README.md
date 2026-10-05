# Movers audit follow-up — Pip visual check pending

Base: `batch/oct-wp` at `9c9d40a8bab904db0ed695a7efd69a7cba9c4f83`.

Five initial rows with Show all; one assessment; folded filters, row evidence, context and charts. Neutral borders and plain labels. Equity observation time remains separate from the crypto feed basis. Empty/error responses do not display synthetic assessments or retained rows.

## Validation

- 24 tests passed across moversCompact, moversDataChipOv21, analysis/moverQuality, moversServerFilter and moverGoldenEggHandoff.
- TypeScript passed; production Next build passed with outbound fetch/HTTP/socket calls blocked (local build IPC allowed). Build logged expected blocked database reads; no production credentials or provider requests used.
- Fetch, filters, rankings, thresholds, environment/eligibility calculations and AI context are byte-identical to base; reason-label helper also unchanged. Core SHA-256: `55adfd07bac1e522deb440b9cb89c1d0a3b5e1fd830f0f6626ceb96fe3be7194`.
- React review: presentation-only props, type-only API import, native disclosures, buttons for actions, immutable input arrays, no new effects or requests.

## Hard layout gate

| Gate | Status |
|---|---|
| One verdict above first fold | One summary verified in DOM tests; placement for Pip |
| About two screens, folds closed | Pending Pip measurement |
| No sideways scroll at 390 | Pending Pip |
| No fake/empty tool | Empty/error states tested |
| No banned/engine words | Fixture copy tested; Pip to inspect populated expanded evidence |
| Readable numbers + one source line | Rounding/source/date assertions pass |
| Screenshots 1280 and 390 | Pending Pip; no screenshots claimed |
| Symbol / Overview / Track chrome | Symbol links retained; shared chrome unchanged |

**Pip to check:** capture populated Markets → Movers at 1280×800 and 390×844 with folds closed; record document height/screen count, overflow and first-fold verdict. Exercise Show all, asset/setup filters, row details, equity/crypto Symbol handoff, and error/empty states. Check parent Markets chrome for duplicate verdict/source. Capture before/after against the batch base.

Browser security policy blocked local file preview. User assigned visual verification to Pip. Keep draft/HOLD until that evidence is attached. No merge or deploy.
