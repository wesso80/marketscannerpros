# Watchlists layout-gate evidence — 2026-10-06

Mocked browser capture of `audit/watchlists-compact` at `b08952d5` plus this evidence commit, route `/tools/workspace?tab=watchlists`. Production Next server. Every `/api` call is fulfilled locally. External origins are aborted. This is layout evidence, not live-provider acceptance.

Viewports: 1280×800 and 390×844. Screen count = `documentElement.scrollHeight / innerHeight`. The count includes the shared header, regime bar, favorite control, collapsed disclaimer, Track heading, Track tabs, and WatchlistWidget. Folds stay closed (`details[open]` is 0). Fixture: one long-named list with 8 symbols (NEAR crypto, AAPL equity, `AAPL 2026-10-16 180C` option, MSFT cached equity, NVDA with no price, plus EURUSD, TSLA, and AMD). Five symbols show until Show all.

| Case | 1280 scrollHeight / screens | 390 scrollHeight / screens | Overflow-x | Summary above fold | PNGs |
|---|---|---|---|---|---|
| Five symbols, folds closed | 1157 / 1.446 | 1866 / 2.211 | No | Yes — long list name · 8 saved symbols loaded | [1280 full](shots/populated-closed-1280-full.png) · [1280 fold](shots/populated-closed-1280-fold.png) · [390 full](shots/populated-closed-390-full.png) · [390 fold](shots/populated-closed-390-fold.png) |
| Show all 8, folds still closed | 1346 / 1.683 | 2432 / 2.882 | No | Yes | [1280](shots/populated-show-all-1280-full.png) · [390](shots/populated-show-all-390-full.png) |
| Empty list | 890 / 1.113 | 1034 / 1.225 | No | Yes — 0 saved symbols loaded | [1280](shots/empty-1280-full.png) · [390](shots/empty-390-full.png) |
| Initial list load error | 800 / 1.000 | 844 / 1.000 | No | Yes — “The last watchlist request did not complete.” | [1280](shots/error-1280-full.png) · [390](shots/error-390-full.png) |

Full-page PNG pixel height matches `scrollHeight`.

## Gates

| # | Gate | Result |
|---|---|---|
| 2 | About two screens, folds closed. Hard max 2.3 at 390. Target ≤2.0 | **Pass against the 2.3 hard max.** Five symbols, folds closed, are 2.211 (1866px) at 390 and 1.446 (1157px) at 1280. That phone count is above the 2.0 target. Show all 8 is 2.882 (2432px) at 390, which is over 2.3. Show all is the expanded list, not the five-symbol gate. |
| 3 | No sideways scroll at 390 | **Pass.** Document and body width 390 in every case. Track tabs wrap: `scrollWidth` 366 = `clientWidth` 366. |
| 7 | Screenshots at 1280 and 390 | **Pass.** Full-page and first-fold PNGs for five symbols, Show all, empty, and the initial load error. |

Five-symbol summary top/bottom: 259–279 at 1280, 334.5–374.5 at 390 (the long name wraps on the phone). One `[data-watchlist-summary]`. One SourceLine on the populated and empty states. The initial load error has zero source lines. Closed quote folds were checked on the phone: the first card is 177px tall, its `details` element is 66px tall, and `open` is false, so the Scan / Symbol / Options actions inside the fold are not part of the painted card. Symbol links and fold summaries measure 40px tall. Shared chrome that this PR does not own stays shorter: the header mark (32px), favorite star (20×22), collapsed disclaimer toggle, and footer policy links.

Closed cards show NEAR +3.88%, AAPL +1.16%, the options contract as “Today: No price”, MSFT +0.40% from the cached item price (omitted from the live quote fixture), and NVDA as “Today: No price”.

## Limits

Before screenshots against `batch/oct-wp` @ `9c9d40a8` were not taken. List switch, mode change, filters, quote-fold open, symbol links, create, rename, add, remove, delete, and export were not exercised.

`fetchItems` still logs a failed items request and can keep the previous list. That stale-list-on-load-failure path was not captured and is not fixed. The error screenshots are only the first `/api/watchlists` request failing, before any list is selected.
