# Explorer — Job 8 evidence

Base: `3e43d9a2303bb23fb6f3463e7bac5a6f5701fdc2` (`batch/oct-wp`). Initial review was committed and posted on #383 before application edits. These are deterministic, intercepted API fixtures, **not live provider or Render acceptance**. No production data was mutated.

## Changes

One shared nine-tab Markets shell; six initial sector tiles and Show all; closed supporting evidence; recorded observations shown as charts. Embedded Equity, Crypto assets and Crypto overview omit duplicate heroes. Equity's hard-coded four illustrative status tiles are removed. Crypto news initially shows five articles. Missing assessments remain Not collected while independently collected quote/history values remain visible. Presentation-only number and label helpers preserve real zeros.

Commodities body is byte-identical to base; its standalone page and Movers data are untouched. API/provider/polling/access/plan/legal behavior is unchanged. Seven calculation bodies are byte-identical; see calculation-parity.json. The standalone legacy Crypto overview page retains its existing presentation: this job covers the Explorer-mounted view.

## Screen counts and screenshots

Widths/heights are 1280×800 and 390×844, in that order. Screens = document height / viewport height, folds closed. Default Equity/Crypto cases are intentionally unrun, despite the shared fixture case name populated; selected cases load AAPL/BTC. Before captures use the same completed fixture schema as after captures.

| Pro view / case | Before screens | After screens | Full-page PNGs |
|---|---|---|---|
| overview / populated | 2.300 / 4.763 | 1.000 / 1.570 | [before 1280](before/overview-pro-populated-1280-full.png) · [before 390](before/overview-pro-populated-390-full.png) · [after 1280](after/overview-pro-populated-1280-full.png) · [after 390](after/overview-pro-populated-390-full.png) |
| heatmap / populated | 1.385 / 2.083 | 1.000 / 1.073 | [before 1280](before/heatmap-pro-populated-1280-full.png) · [before 390](before/heatmap-pro-populated-390-full.png) · [after 1280](after/heatmap-pro-populated-1280-full.png) · [after 390](after/heatmap-pro-populated-390-full.png) |
| cross / populated | 1.308 / 1.956 | 1.000 / 1.034 | [before 1280](before/cross-pro-populated-1280-full.png) · [before 390](before/cross-pro-populated-390-full.png) · [after 1280](after/cross-pro-populated-1280-full.png) · [after 390](after/cross-pro-populated-390-full.png) |
| equity / populated | 1.596 / 2.193 | 1.000 / 1.050 | [before 1280](before/equity-pro-populated-1280-full.png) · [before 390](before/equity-pro-populated-390-full.png) · [after 1280](after/equity-pro-populated-1280-full.png) · [after 390](after/equity-pro-populated-390-full.png) |
| equity / selected | 2.745 / 5.258 | 1.062 / 1.602 | [before 1280](before/equity-pro-selected-1280-full.png) · [before 390](before/equity-pro-selected-390-full.png) · [after 1280](after/equity-pro-selected-1280-full.png) · [after 390](after/equity-pro-selected-390-full.png) |
| crypto / populated | 1.811 / 3.039 | 1.000 / 1.180 | [before 1280](before/crypto-pro-populated-1280-full.png) · [before 390](before/crypto-pro-populated-390-full.png) · [after 1280](after/crypto-pro-populated-1280-full.png) · [after 390](after/crypto-pro-populated-390-full.png) |
| crypto / selected | 2.940 / 4.575 | 1.123 / 1.678 | [before 1280](before/crypto-pro-selected-1280-full.png) · [before 390](before/crypto-pro-selected-390-full.png) · [after 1280](after/crypto-pro-selected-1280-full.png) · [after 390](after/crypto-pro-selected-390-full.png) |
| crypto-command / populated | 2.584 / 4.635 | 1.121 / 1.463 | [before 1280](before/crypto-command-pro-populated-1280-full.png) · [before 390](before/crypto-command-pro-populated-390-full.png) · [after 1280](after/crypto-command-pro-populated-1280-full.png) · [after 390](after/crypto-command-pro-populated-390-full.png) |
| crypto-intel / populated | 2.569 / 3.389 | 1.147 / 1.380 | [before 1280](before/crypto-intel-pro-populated-1280-full.png) · [before 390](before/crypto-intel-pro-populated-390-full.png) · [after 1280](after/crypto-intel-pro-populated-1280-full.png) · [after 390](after/crypto-intel-pro-populated-390-full.png) |

## Eight-gate review

| Gate | Result |
|---|---|
| One verdict above first fold | Pass for every Pro case, including unrun and missing-assessment states; access-gated states retain their access explanation. |
| About two screens closed | Pass: every after case ≤1.901 screens, including Free and anonymous. |
| No sideways scroll at 390 | Pass for every after case. |
| No fake/empty tools | Hard-coded equity status tiles removed; search prompts are actionable; absent assessments/derivatives are explicit and never replaced by numeric zeros. |
| No banned/engine words | Zero unprotected hits in case-insensitive visible/expanded text and title/aria-label scans in 50 cases. Existing legal analyst wording is preserved and explicitly excluded. |
| Readable numbers + one source line | Pro cases each have one SourceLine, including expanded folds; readable display precision and explicit date/time basis. Gated cases do not invent a data source. Existing protected attribution remains. |
| Before/after 1280 and 390 | 18 before and 50 after PNGs; Pro, Free, anonymous, selected symbols and missing assessment. |
| Symbol / Overview / Track naming | Explorer shell uses plain Markets/Overview labels; embedded Symbol links replace Golden Egg; no Command Center chrome in reviewed views. |

## Verification and limits

- Production build and standalone TypeScript check passed.
- 29 focused tests passed across explorerLayout, cryptoGateFeeds, sectorEtfProfile and equityNewsRelevance. Provider calls are mocked. Full provider-connected suite was not run.
- 50 after browser cases: zero page errors, closed folds, no horizontal overflow or unprotected scanned words. All Pro verdict bottoms are inside the first viewport. Charts appear above the desktop fold where observations exist; unrun searches/news do not invent charts.
- 7 calculation bodies pass byte-for-byte parity against base. No scoring change.
- Initial review called ETF_PROFILE an error leak; inspection showed it was an implementation term in a source description. The label now reads ETF profiles.
- Existing global regime header remains unchanged. Fixtures supply its actual regime/counting fields; screenshot observations use raw browser times in evidence.json.
- These isolated screenshots do not establish live feed health, authorization correctness against production, or Options OI acceptance.

## Reproduce

Build the checked-out revision with the repository's existing dependencies. From repository root, run `node docs/qa/explorer-2026-10-05/calculation-parity.cjs` and the four focused Vitest files. For captures, set TRACK_ROOT to that checkout, TRACK_OUT to a new output folder, and run `node docs/qa/explorer-2026-10-05/capture.cjs`. BEFORE=true selects the 18-case baseline matrix. The runner's Playwright/Chromium locations reflect the builder environment; adjust only those local executable/dependency paths when reproducing elsewhere. Every API request is intercepted, external requests are aborted, and server credentials are dummy values.
