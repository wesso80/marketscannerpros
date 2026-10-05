# Saved Cases layout-gate evidence — 2026-10-06

Mocked browser capture of `audit/saved-cases-compact` at the working tip, route `/tools/research?tab=saved`. Production Next server. Every `/api` call is fulfilled locally. External origins are aborted. This is layout evidence, not live-provider acceptance.

Viewports: 1280×800 and 390×844. Screen count = `documentElement.scrollHeight / innerHeight`. Pro tier via mocked `/api/me`. Fixture: 8 stored cases. The first title is the long International Consolidated Airlines Group name. Its saved date is 15 Jan 2024 and its snapshot date is 2 Nov 2023.

| Case | 1280 scrollHeight / screens | 390 scrollHeight / screens | Overflow-x | One verdict above fold | PNGs |
|---|---|---|---|---|---|
| Five cards, folds closed | 1354 / 1.692 | 1619 / 1.918 | No | Yes — “8 saved research cases loaded” | [1280 full](shots/populated-closed-1280-full.png) · [1280 fold](shots/populated-closed-1280-fold.png) · [390 full](shots/populated-closed-390-full.png) · [390 fold](shots/populated-closed-390-fold.png) |
| Show all 8, folds still closed | 1855 / 2.319 | 2120 / 2.512 | No | Yes | [1280](shots/populated-show-all-1280-full.png) · [390](shots/populated-show-all-390-full.png) |
| First card details open | 1627 / 2.034 | 1994 / 2.363 | No | Yes | [1280](shots/populated-details-1280-full.png) · [390](shots/populated-details-390-full.png) |
| Empty archive | 800 / 1.000 | 844 / 1.000 | No | Yes — “No saved research cases yet.” | [1280](shots/empty-1280-full.png) · [390](shots/empty-390-full.png) |
| Feed error | 800 / 1.000 | 844 / 1.000 | No | Yes — “The last request did not complete.” | [1280](shots/error-1280-full.png) · [390](shots/error-390-full.png) |

Full-page PNG pixel height matches `scrollHeight`.

## Gates

| # | Gate | Result |
|---|---|---|
| 2 | About two screens, folds closed. Hard max 2.3 at 390. Target ≤2.0 | **Pass** for the five-card closed view. Maximum closed state is 1.918 at 390 and 1.692 at 1280. Show all stays folds-closed and is 2.512 at 390, over the 2.3 hard max; that is the expanded list, not the five-card gate. |
| 3 | No sideways scroll at 390 | **Pass.** Document and body width 390 in every case, including the opened long evidence paragraph. Research TabBar wraps: `scrollWidth` 366 = `clientWidth` 366. |
| 7 | Screenshots at 1280 and 390 | **Pass.** Full-page and first-fold PNGs for populated closed, Show all, opened details, empty, and error. |

Closed verdict top/bottom: 271–299 at 1280, 390.5–446.5 at 390 (the phone summary wraps to two lines and stays inside 844). One `[data-research-verdict]`. One SourceLine on populated and empty states. The error state has zero source lines and no retained cards. Closed captures have `details[open] === 0` and five `[data-saved-case]` cards. Visible closed copy uses plain labels such as “Outcome pending”; the DOM text does not contain `DEGRADED` or `NO_SETUP`.

The opened first card shows “Older observation”, “Under review”, the long stored note wrapping inside the card, and “Not supplied” for the missing evidence count.

## Limits

Before screenshots against `batch/oct-wp` @ `9c9d40a8` were not taken. Symbol handoff, Apply, Confirm/Invalidate/Expire/Review, and Delete were not exercised on a signed-in account. News, calendar, and earnings feeds return empty successful fixtures so those tabs do not error while Saved Cases is open.
