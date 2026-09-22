# Backtest calculations and historical-data integrity — 22 September 2026

Base release: `335a7c5d334d722567210e5d277f619c516bd130`, previously verified live on Render. This follow-up is a separate release. It is not a platform-wide or 5/5 approval.

## Confirmed defects addressed

| Finding | Change | Evidence |
|---|---|---|
| Every price bar was treated as a trading day, using 252 regardless of timeframe | Aggregate closed-trade balance to provider-labelled calendar dates, carry the realised ledger over idle dates, use 365.25 daily periods | Equivalent intraday/daily schedules produce identical statistics; elapsed-year arithmetic |
| First balance change was excluded from returns | Begin return calculation at actual initial capital | Independent -10%, +20%, 0% daily-return example |
| Sortino divided downside squared returns only by losing observations | Use the full observation count; Sharpe uses sample standard deviation | Independent denominator and standard-deviation checks |
| Undefined ratios appeared as zero; a zero ending balance could fall back to starting capital | Nullable annualised statistics, zero balance preserved, invalid capital/outcomes/timelines rejected | Empty, zero-variance, all-gain, first-loss and insolvency examples |
| Unavailable profit factor was replaced with 3 in diagnostic and workflow scoring | Missing profit factor contributes no positive score; its absence cannot validate a run or earn a healthy verdict | Breakeven diagnostic score is zero; all-win/undefined-PF validation stays mixed |
| Annualisation of single-day or multi-day-bar runs implied unsupported timing precision | Withhold those annualised statistics and explain why | Single-day and weekly-bar tests; source cadence passed through strategy, scanner and signal replay |
| Shuffling dollar outcomes produced identical ending returns while presenting a percentile range | Deterministic IID bootstrap with replacement; fixed trade count and dollar sizing | Repeatability, nondegenerate distribution and support bounds |
| Percentiles were called best/worst cases and a >50% drawdown frequency was labelled ruin probability | Label percentile returns and simulated drawdown frequency directly | Display review; no worst-case or insolvency guarantee claimed |
| Kelly allocation percentages were inferred from average dollar wins/losses without consistent risk budgets | Stop emitting Kelly allocation estimates; remove their display | Engine and UI review |
| “Inverse Short Replay” summed position percentages, compounded them on an arbitrary 100 balance and negated ratios | Recompute mirrored dollar outcomes on original capital and dates; label a sensitivity scenario, not an executed short backtest | +$500/-$200 on $10,000 mirrors to -3%, with $200 average win, -$500 average loss and 5% realised drawdown |
| Crypto backtests manufactured OHLC and interval volume from sampled prices and rolling volume | Require genuine hourly/daily OHLC; reject sub-hour requests; volume remains unavailable | Provider-failure and unsupported-resolution tests |
| Three-year daily OHLC request exceeded CoinGecko's 180-day cap and triggered the sampled-price fallback | Bound requests to 180 days daily / 31 days hourly; no sampled-price fallback | Mocked request-bound checks; max seven daily or three hourly requests per uncached symbol |
| CoinGecko close timestamps were used as candle opens | Subtract source interval, exclude future closes, reject invalid/conflicting candles, deduplicate chunk boundaries | Daily/hourly time examples and malformed-candle tests |
| Resampling could include incomplete crypto buckets | Require every constituent source candle | Complete 4-hour example and missing-hour rejection |
| Stock daily data mixed adjusted closes with raw OHLC | Apply adjusted/raw-close ratio consistently to all daily OHLC fields | Independent split-style example preserves high/low relationships |
| Signal replay read the wrong daily volume field; cache metadata mislabelled intraday adjustment | Reuse the stock provider in replay; explicitly request adjusted intraday data; preserve metadata on cache hits | Missing-field rejection and cache/cold equivalence |
| Old provider caches could retain manufactured/mixed-basis bars | New `bt:v3` cache namespace | Provider cache-key verification |

## Meaning of the repaired statistics

These are **realised balance statistics**. They are not daily marked portfolio returns. Open gains/losses, intrabar excursions, margin liquidation and financing are excluded. Idle calendar dates carry the closed-trade ledger unchanged; this does not impute market prices. Date labels remain in the provider's date convention, avoiding accidental conversion of exchange-local intraday keys into the server timezone.

Sharpe assumes a zero risk-free rate, Sortino a zero target, and square-root scaling assumes uncorrelated returns. Short samples remain unstable. Annualised figures from less than a year are disclosed as extrapolations; single-day and multi-day-bar annualisation is withheld. Calendar interval accounting includes the first and last labelled dates. This does not establish exact intraday capital exposure.

The bootstrap resamples fixed dollar outcomes independently. It does not model serial dependence, regime shifts, dynamic position sizing, margin calls or future execution. Eight trades is an availability threshold, not a reliability threshold. Negative simulated balances are possible under this arithmetic model; the >50% drawdown count is not an estimate of broker liquidation probability.

The mirrored scenario flips already-recorded net P&L. Costs and fills are not re-simulated. It must not be interpreted as evidence that shorting the original strategy would produce the displayed result.

Daily stock prices are reconstructed on one split/dividend-adjusted basis; volume remains provider-reported shares. These adjusted prices are research inputs, not historical executable quotes. Corporate-action cash accounting and stock-session completeness still need separate validation.

## Read-only production checks

Public app coin-detail responses were compared with direct CoinGecko coin-detail responses. No credentials were extracted, and no test trades, alerts, watchlists or saved cases were created. Diamond was not run.

| Sample | App | CoinGecko public response | Assessment |
|---|---|---|---|
| BTC USD price | 85,826 | 85,826 | Exact match |
| BTC market cap USD | 1,725,195,702,323 | 1,725,195,702,323 | Exact match |
| BTC circulating supply | 20,087,596 | 20,087,596 | Exact match |
| BTC provider observation | 2026-09-22 01:02:30 UTC | 2026-09-22 01:02:30 UTC | Same observation |
| ETH USD price | 2,743.99 at 01:05:30 UTC | 2,742.50 at 01:04:40 UTC | Different observation times; ~0.054% difference, not exact parity |
| SOL USD price | 117.75 at 01:05:30 UTC | 117.69 at 01:04:40 UTC | Different observation times; ~0.051% difference, not exact parity |

ETH and SOL circulating supplies matched across each pair. Their market caps and prices did not have matching observation times, so no exact price/market-cap sign-off is given. The source comparison establishes fidelity to CoinGecko for a small snapshot; it does not independently verify consolidated exchange truth or historical candle values.

The live Markets overview displayed **7/11 positive equity sectors**. Counting the eleven visible sector rows produced seven positive and four negative values. This checks the displayed summary against its rows, not the provider accuracy of every sector return.

## Remaining material work

- Verify paid hourly/daily OHLC history end to end after deployment, including gaps, asset-listing boundaries, requested coverage and cache refresh. Local provider checks use mocked payloads and cannot prove account entitlement or actual response latency.
- Add a position/quantity/fee model that can produce marked daily equity, then validate portfolio-risk ratios and intrabar drawdown. Current realised-only ratios must not drive an institutional risk decision on their own.
- Align strategy, scanner and recorded-signal replay commission/slippage models. Crypto replay still uses genuine Binance bars while the strategy/scanner providers use CoinGecko; cross-provider and signal-timestamp parity remain unverified.
- Verify exchange calendars, higher-timeframe anchoring and stock-session completeness. Multi-day annualised metrics are withheld; this does not certify all weekly/monthly aggregation boundaries.
- Audit global crypto freshness metadata: the market-overview route still uses retrieval time instead of CoinGecko's `updated_at` observation. This follow-up does not claim that timestamp defect is resolved.
- Complete the earlier alert, mobile, observed derivatives and out-of-sample validation backlog. No 5/5 scanner rating is claimed.

## Method references

- [William Sharpe, The Sharpe Ratio](https://web.stanford.edu/~wfsharpe/art/sr/sr.htm): return differential, sample variability and time-scaling assumptions.
- [PerformanceAnalytics manual](https://cran.r-project.org/web/packages/PerformanceAnalytics/PerformanceAnalytics.pdf): full-series downside denominator and return-frequency scaling conventions. The calendar-ledger choice here is explicitly our implementation convention.
- [Alpha Vantage documentation](https://www.alphavantage.co/documentation/): adjusted daily close, raw daily OHLC and intraday adjustment selection.
- [CoinGecko OHLC range documentation](https://docs.coingecko.com/reference/coins-id-ohlc-range): candle-close timestamps and hourly/daily request limits.

## Release verification

The expanded regression suite passed **157/157 tests across 13 files**, including **21 new numerical/provider cases**. Coverage includes access-tier gates, research readiness, compliance copy, prior audit regressions and the affected calculation/provider paths. Two outdated layout text expectations were corrected: the renamed realised-balance tab and the timeframe prop introduced by the previous release. Terminal production code was not changed in this batch.

The final missing-profit-factor scoring guard also passed its **13/13 numerical regression cases**, including an extreme all-win example that remains under review rather than receiving a healthy verdict.

Publication is blocked in this workspace: the GitHub connector still returns HTTP 400 `Invalid MCP request metadata`, and `git push --dry-run` fails with `could not read Username for 'https://github.com': terminal prompts disabled`. A fresh public fetch confirms `origin/main` is still `335a7c5`. No permissions or environment variables on Render were changed. The release is prepared on `codex/backtest-integrity-20260922` with a Git-bundle handoff; the [publishing instructions](backtest-release-handoff-2026-09-22.md) use an ancestry check and a normal, non-force push.

Final production build completed with **exit code 0**: compilation, TypeScript and **400/400 generated pages passed**. The build used local placeholder credentials and an unreachable local database; expected local connection-refusal logs are not production failures. No production credentials were read. Generated `next-env.d.ts` changes were discarded. This is code/build verification, not a live test of the new paid OHLC requests or a visual verification of the new deployed interface.

The previously live `335a7c5` deployment must not be confused with this new local batch.
