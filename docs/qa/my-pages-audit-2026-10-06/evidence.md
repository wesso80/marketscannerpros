# My Pages layout-gate evidence — 2026-10-06

Mocked browser capture of `audit/my-pages-compact` at the working tip, route `/tools/dashboard?tab=pages`. Production Next server. Every `/api` call is fulfilled locally. External origins are aborted. This is layout evidence, not live-provider acceptance.

Viewports: 1280×800 and 390×844. Screen count = `documentElement.scrollHeight / innerHeight`. The count includes the shared header, regime bar, Dashboard heading, lens tabs, compact disclaimer, and FavoritesPanel. Manage pages stays closed. Fixture: 8 saved catalogue keys, five shown until Show all.

| Case | 1280 scrollHeight / screens | 390 scrollHeight / screens | Overflow-x | Summary above fold | PNGs |
|---|---|---|---|---|---|
| Five shortcuts, browser closed | 824 / 1.030 | 1262 / 1.495 | No | Yes — “8 saved pages” | [1280 full](shots/populated-closed-1280-full.png) · [1280 fold](shots/populated-closed-1280-fold.png) · [390 full](shots/populated-closed-390-full.png) · [390 fold](shots/populated-closed-390-fold.png) |
| Show all 8 | 931 / 1.164 | 1585 / 1.878 | No | Yes | [1280](shots/populated-show-all-1280-full.png) · [390](shots/populated-show-all-390-full.png) |
| Cached / degraded | 824 / 1.030 | 1282 / 1.519 | No | Yes | [1280](shots/degraded-1280-full.png) · [390](shots/degraded-390-full.png) |
| Empty | 800 / 1.000 | 844 / 1.000 | No | Yes — “No pages saved yet.” | [1280](shots/empty-1280-full.png) · [390](shots/empty-390-full.png) |
| Feed error | 800 / 1.000 | 844 / 1.000 | No | Yes | [1280](shots/error-1280-full.png) · [390](shots/error-390-full.png) |
| Signed out | 800 / 1.000 | 898 / 1.064 | No | Yes | [1280](shots/signed-out-1280-full.png) · [390](shots/signed-out-390-full.png) |

Full-page PNG pixel height matches `scrollHeight`. The compact disclaimer “General Information Only” is in every capture.

## Gates

| # | Gate | Result |
|---|---|---|
| 2 | About two screens, folds closed. Hard max 2.3 at 390. Target ≤2.0 | **Pass.** Tallest closed state is the cached summary at 1.519 (390) and 1.030 (1280). Five shortcuts are 1.495 / 1.030. Show all is 1.878 / 1.164, still under 2.0. |
| 3 | No sideways scroll at 390 | **Pass.** Document and body width 390 in every case. Dashboard lens tabs wrap: `scrollWidth` 366 = `clientWidth` 366. |
| 7 | Screenshots at 1280 and 390 | **Pass.** Full-page and first-fold PNGs for five shortcuts, Show all, cache, empty, error, and signed out. |

Five-shortcut summary top/bottom: 380–400 at 1280, 479–499 at 390. One `[data-my-pages-summary]`. One SourceLine on populated, cached, and empty states. Error and signed-out have zero source lines. Remove controls measure 40×40 on every visible card, including at 390, and are not hover-only. Manage pages is closed (`#my-pages-browser` absent).

## Limits

Before screenshots against `batch/oct-wp` @ `9c9d40a8` were not taken. Add and remove were not exercised against a signed-in account. The loading skeleton was not captured because the fixture resolves immediately.
