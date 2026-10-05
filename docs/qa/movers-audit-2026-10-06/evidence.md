# Movers layout-gate evidence — 2026-10-06

Mocked browser capture of `audit/movers-compact` at the working tip, route `/tools/explorer?tab=movers` (the `/tools/market-movers` redirect destination). Production Next server. Every `/api` call is fulfilled locally. External origins are aborted. This is layout evidence, not live-provider acceptance.

Viewports: 1280×800 and 390×844. Screen count = `documentElement.scrollHeight / innerHeight`. Folds closed means `details[open] === 0`. Pro tier via mocked `/api/me`. Fixture list: 10 gainers, 6 decliners, 6 most active. Equity feed `end_of_day` so the source label does not depend on the session clock.

| Case | 1280 scrollHeight / screens | 390 scrollHeight / screens | Overflow-x | One verdict above fold | PNGs |
|---|---|---|---|---|---|
| Populated, five rows, folds closed | 1345 / 1.681 | 1544 / 1.829 | No (390 and 1280) | Yes | [1280 full](shots/populated-closed-1280-full.png) · [1280 fold](shots/populated-closed-1280-fold.png) · [390 full](shots/populated-closed-390-full.png) · [390 fold](shots/populated-closed-390-fold.png) |
| Show all 10, folds still closed | 1915 / 2.394 | 2114 / 2.505 | No | Yes, after scroll reset | [1280 full](shots/populated-show-all-1280-full.png) · [390 full](shots/populated-show-all-390-full.png) |
| Empty lists | 800 / 1.000 | 844 / 1.000 | No | Yes — “No mover observations collected.” | [1280](shots/empty-1280-full.png) · [390](shots/empty-390-full.png) |
| Feed error | 800 / 1.000 | 844 / 1.000 | No | Yes — “Movers could not be collected.” No retained rows. | [1280](shots/error-1280-full.png) · [390](shots/error-390-full.png) |

Full-page PNG pixel height matches `scrollHeight` (device scale 1).

## Gates

| # | Gate | Result |
|---|---|---|
| 2 | About two screens, folds closed. Hard max 2.3 at 390. Target ≤2.0 | **Pass.** Closed maximum is 1.829 at 390 and 1.681 at 1280. Show all is outside this gate: 2.505 at 390 and 2.394 at 1280. |
| 3 | No sideways scroll at 390 | **Pass.** `documentElement` and `body` `scrollWidth` equal `clientWidth` (390) in every case, including Show all. The Markets tab list wraps: `scrollWidth` 366 = `clientWidth` 366. |
| 7 | Screenshots at 1280 and 390 | **Pass.** Eight full-page PNGs plus matching first-fold PNGs. |

Populated closed verdict is the only `[data-movers-verdict]`: “Conditions support further research.” Desktop top 246 / bottom 266 inside 800. Phone top 365.5 / bottom 385.5 inside 844. Parent Markets chrome adds no second verdict and no second source line (`parentVerdictCount` 0, `sourceCount` 1). Open folds: 0. Five mover rows, “Show all 10”.

Empty and error states keep that single verdict above the fold and do not invent rows. Empty still has one source line. Error has zero source lines.

## Limits

Before screenshots against `batch/oct-wp` @ `9c9d40a8` were not taken in this pass. Measurements above are the compact branch only. Shared header, regime bar, favourite control, and the page disclaimer are included in the screen count. Sibling Explorer feeds (sectors, crypto, commodities) return empty successful fixtures so they do not paint an error banner on the Movers tab. Unknown APIs return 503 and are not live calls.
