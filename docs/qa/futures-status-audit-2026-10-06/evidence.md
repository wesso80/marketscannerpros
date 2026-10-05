# Terminal Futures status copy — layout-gate evidence — 2026-10-06

Mocked browser capture of `audit/terminal-futures-status` at `969010cc` plus this evidence commit. Route `/tools/terminal` with `/ES` (Futures Session, Cash Bridge, Liquidity & Volume, Close Calendar) and `/GC` (Commodity Session Map). Production Next. `/api/terminal/futures` is fulfilled from `fixture.json`. That file is the existing session, close-calendar, cash-bridge, and phantom engines at `2026-10-05T15:00:00Z`. Ready keeps `dataState: ready` and an empty error list. Partial and provider-error change only `dataState` and `errors`. Failed is HTTP 500 with a raw error string. Absent is a null body. Liquidity scores are still produced by the unchanged estimator from that session. Other `/api` calls return a local 503. External origins are aborted. This is layout evidence, not a live-provider run, and it does not change calculations.

Viewports: 1280×800 and 390×844. Screen count = `documentElement.scrollHeight / innerHeight`. Counts include the header, regime bar, compact disclaimer, Terminal hero, symbol card, closed view switcher, and the futures panel. The view switcher and Data coverage stay closed (`details[open]` is 0).

| View / state | 1280 scrollHeight / screens | 390 scrollHeight / screens | Page overflow-x |
|---|---|---|---|
| Futures Session / ready | 951 / 1.189 | 1778 / 2.107 | No |
| Futures Session / partial | 1029 / 1.286 | 1856 / 2.199 | No |
| Futures Session / failed | 800 / 1.000 | 844 / 1.000 | No |
| Futures Session / absent | 800 / 1.000 | 844 / 1.000 | No |
| Futures Session / provider-error | 1029 / 1.286 | 1876 / 2.223 | No |
| Cash Bridge / ready | 950 / 1.188 | 1562 / 1.851 | No |
| Cash Bridge / partial | 1028 / 1.285 | 1640 / 1.943 | No |
| Cash Bridge / failed | 800 / 1.000 | 844 / 1.000 | No |
| Cash Bridge / absent | 800 / 1.000 | 844 / 1.000 | No |
| Cash Bridge / provider-error | 1028 / 1.285 | 1660 / 1.967 | No |
| Commodity Session Map / ready | 800 / 1.000 | 1042 / 1.235 | No |
| Commodity Session Map / partial | 810 / 1.012 | 1120 / 1.327 | No |
| Commodity Session Map / failed | 800 / 1.000 | 844 / 1.000 | No |
| Commodity Session Map / absent | 800 / 1.000 | 844 / 1.000 | No |
| Commodity Session Map / provider-error | 810 / 1.012 | 1140 / 1.351 | No |
| Liquidity & Volume / ready | 1016 / 1.270 | 1739 / 2.060 | No |
| Liquidity & Volume / partial | 1094 / 1.367 | 1817 / 2.153 | No |
| Liquidity & Volume / failed | 800 / 1.000 | 844 / 1.000 | No |
| Liquidity & Volume / absent | 800 / 1.000 | 844 / 1.000 | No |
| Liquidity & Volume / provider-error | 944 / 1.180 | 1508 / 1.787 | No |
| Close Calendar / ready | 1621 / 2.026 | 2373 / 2.812 | No page overflow; table scroller |
| Close Calendar / partial | 1699 / 2.124 | 2451 / 2.904 | No page overflow; table scroller |
| Close Calendar / failed | 800 / 1.000 | 878 / 1.040 | No |
| Close Calendar / absent | 800 / 1.000 | 898 / 1.064 | No |
| Close Calendar / provider-error | 1699 / 2.124 | 2471 / 2.928 | No page overflow; table scroller |

Full-page PNG pixel height matches `scrollHeight`. Files are `shots/{view}-{state}-{width}-full.png` and `shots/{view}-{state}-{width}-fold.png`. Views: `session`, `bridge`, `commodity`, `liquidity`, `calendar`.

## Gates

| # | Gate | Result |
|---|---|---|
| 2 | About two screens, folds closed. Hard max 2.3 at 390. Target ≤2.0 | **Pass against the 2.3 hard max** for Futures Session, Cash Bridge, Commodity Session Map, and Liquidity & Volume. The tallest of those is Futures Session provider-error at 2.223. Session ready (2.107), session partial (2.199), and Liquidity ready/partial (2.060 / 2.153) are above the 2.0 target. **Close Calendar loaded states fail the hard max:** ready 2.812, partial 2.904, provider-error 2.928. |
| 3 | No sideways scroll at 390 | **Pass for the page** on every capture. Document and body stay 390 wide. **Close Calendar fails as an inner scroller:** the schedule table is 620px inside a 340px `overflow-x-auto` region on ready, partial, and provider-error. |
| 7 | Screenshots at 1280 and 390 | **Pass.** Full-page and first-fold PNGs for all five views and all five states. |

Loaded states show one `[data-futures-summary]` and one SourceLine. Parent `[data-research-verdict]` count is 0, so the futures summary does not sit next to a second Terminal verdict. On the phone the summary is fully inside the first fold except Close Calendar provider-error, where “Market observations could not be loaded; schedule context only.” runs from y 820 to y 860 and the viewport ends at 844.

Failed request copy is “Futures context could not be loaded. Refresh this view to try again.” The raw `PROVIDER_UNKNOWN` string is not on the page. Partial says “Futures context has limited data coverage.” Data coverage is closed, and `NO_SETUP` / `PROVIDER_DEGRADED` / `Data State` are not visible. Absent says no market observations were collected. Provider-error says schedule context only. Liquidity ready and partial include “Session-based estimates, not measured volume or order-book liquidity.” On Liquidity provider-error that estimate card is replaced by the missing-observations message. A `/100` figure can still appear from the existing phantom-charge card, which this copy change does not remove.

## Limits

Before screenshots against `batch/oct-wp` @ `9c9d40a8` were not taken. The view switcher was opened only long enough to select Commodity Session Map, then closed before measurement. Anchor, horizon, and anchor-mode controls were left at their defaults.
