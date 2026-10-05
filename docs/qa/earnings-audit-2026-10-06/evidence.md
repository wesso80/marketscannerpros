# Earnings layout-gate evidence — 2026-10-06

Mocked browser capture of `audit/research-earnings-compact` at the working tip, route `/tools/research?tab=earnings`. Production Next server. Every `/api` call is fulfilled locally. External origins are aborted. This is layout evidence, not live-provider acceptance.

Viewports: 1280×800 and 390×844. Screen count = `documentElement.scrollHeight / innerHeight`. Pro tier via mocked `/api/me`. Fixture: 7 this-week rows (first company name is `International Consolidated Airlines Group Societe Anonyme`; second estimate is absent), next week empty, 3 major rows.

| Case | 1280 scrollHeight / screens | 390 scrollHeight / screens | Overflow-x | One verdict above fold | PNGs |
|---|---|---|---|---|---|
| This week, five rows, folds closed | 1268 / 1.585 | 1522 / 1.803 | No | Yes — “7 scheduled reports · this week” | [1280 full](shots/this-week-closed-1280-full.png) · [1280 fold](shots/this-week-closed-1280-fold.png) · [390 full](shots/this-week-closed-390-full.png) · [390 fold](shots/this-week-closed-390-fold.png) |
| Next week, empty group | 800 / 1.000 | 844 / 1.000 | No | Yes — “No scheduled reports collected · next week” | [1280](shots/next-week-empty-1280-full.png) · [390](shots/next-week-empty-390-full.png) |
| Major, three rows, folds closed | 936 / 1.170 | 1190 / 1.410 | No | Yes — “3 scheduled reports · major earnings” | [1280](shots/major-closed-1280-full.png) · [390](shots/major-closed-390-full.png) |
| This week, Show all 7 | 1548 / 1.935 | 1802 / 2.135 | No | Yes | [1280](shots/this-week-show-all-1280-full.png) · [390](shots/this-week-show-all-390-full.png) |
| This week, first two report folds open | 1484 / 1.855 | 1758 / 2.083 | No | Yes | [1280](shots/this-week-details-1280-full.png) · [390](shots/this-week-details-390-full.png) |
| Feed error | 800 / 1.000 | 844 / 1.000 | No | Yes — “Earnings could not be loaded.” | [1280](shots/error-1280-full.png) · [390](shots/error-390-full.png) |

Full-page PNG pixel height matches `scrollHeight`.

## Gates

| # | Gate | Result |
|---|---|---|
| 2 | About two screens, folds closed. Hard max 2.3 at 390. Target ≤2.0 | **Pass** for the five-row closed groups. Maximum closed group is This week at 1.803 (390) and 1.585 (1280). Show all stays folds-closed and is 2.135 at 390: under the 2.3 hard max, above the 2.0 target. |
| 3 | No sideways scroll at 390 | **Pass.** Document and body width 390 in every case, including the open long company name. Research tab list wraps: `scrollWidth` 366 = `clientWidth` 366. No shared TabBar sideways overflow at 390. |
| 7 | Screenshots at 1280 and 390 | **Pass.** Full-page and first-fold PNGs for all three groups, Show all, opened details, and the error state. |

Closed This week verdict top/bottom: 271–299 at 1280, 390.5–418.5 at 390. One `[data-research-verdict]`. One SourceLine on populated groups, including the empty next-week group: “Source · Earnings calendar · Not available right now · Scheduled report dates · estimates may change · provider observation time not supplied”. Error has zero source lines.

Opened details show the long company name wrapping inside the card and `EPS estimate: Not supplied` for the absent estimate. `openFolds` is 0 on the closed captures and 2 on the details capture.

## Limits

Before screenshots against `batch/oct-wp` @ `9c9d40a8` were not taken. Symbol navigation and watchlist save were not exercised against a signed-in account. News and calendar feeds return empty successful fixtures so those tabs do not error while Earnings is open.
