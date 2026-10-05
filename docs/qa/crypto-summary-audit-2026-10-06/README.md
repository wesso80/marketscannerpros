# Crypto Derivatives summary and timestamp basis — Pip check pending

Targets `batch/oct-wp` from `9c9d40a8bab904db0ed695a7efd69a7cba9c4f83`.

The conditions assessment was below the open charts. It now appears immediately after the page header, with conditions evidence and charts folded. Missing feed coverage has a clear summary instead of a fabricated assessment. Existing disclaimer text is preserved in its standard disclosure.

The page previously passed `lastUpdate` (local request completion) as SourceLine's observation time. That value is now explicitly labelled last response with data received / request completion, not a provider observation time. It is no longer passed as `asOf`. The source line states that a shared provider observation time was not supplied. No provider timestamps are inferred.

All code before the display return is byte-identical to base (SHA-256 `d5cab0fdd0ca4bf0ae75feebed08ebe5d59665ffba838d9baefd8d9186bf9d5d`), including fetches, freshness guards, OI/ratio/funding calculations, scenario generation, refresh behavior and access checks. No changes to Terminal's #365 crypto tab or data-truth #367.

Validation: 29 tests passed (wp3DerivativesDesk, derivativesEvidence, derivativesSnapshots), TypeScript and whitespace checks passed. Assertions cover summary before chart DOM, one summary/source, closed folds, truthful empty coverage, explicit receipt-time basis and no liquidation fetch. Tests mock providers; no production writes or live provider requests.

| Hard layout gate | Status |
|---|---|
| One verdict above first fold | One summary before charts tested; viewport position for Pip |
| About two screens closed | Pending Pip |
| No sideways scroll at 390 | Pending Pip |
| No fake/empty tool | Missing coverage summary and existing feed guards retained |
| No banned/engine words | Existing copy tests pass; expanded copy for Pip |
| Readable numbers + one source line | Formatters unchanged; one source with receipt-time basis |
| Screenshots 1280 and 390 | Pending Pip; no screenshots claimed |
| Symbol / Overview / Track chrome | Shared chrome unchanged |

**Pip to check:** `/tools/crypto-dashboard`, before/after at 1280×800 and 390×844 with populated and empty mocked feeds. Capture first-fold conditions, closed evidence/charts/scenarios, screen counts and overflow. Expand charts and conditions evidence, check the 3-of-4-feed limitation and missing-liquidations chip. Refresh and confirm request completion is never presented as market observation time. Check loading and partial coverage, and retain existing CoinGecko credit. No live provider requests needed for these layout/copy checks.

User assigned screenshots/layout acceptance to Pip. Draft/HOLD pending review; no merge/deploy.
